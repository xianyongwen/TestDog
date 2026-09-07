/**
 * 插件存储与注入编排：
 * - ensureBuiltinPlugins：启动时 upsert 内置能力插件（ant/el × select / tree-select / date-picker
 *   六件套，源码随版本更新）、清理旧内置插件（框架级 antd / element-plus 与能力级
 *   select / tree-select / date-picker，引用它们的 preset 自动补入新成员）、
 *   seed/同步内置「默认组合」成员；
 * - enabledInpageScripts(projectId?)：注入编排（Preset 为唯一编排入口）——
 *   项目关联 preset → 成员按 priority 升序返回源码；未关联 → 内置「默认组合」成员；
 * - validatePluginCode：上传插件的 Node 侧语法快检（new Function，仅解析不执行）。
 */
import { prisma } from '../db';
import { BUILTIN_PLUGIN_DEFS, BUILTIN_PRESET_MEMBERS, DEFAULT_PRESET_NAME, LEGACY_BUILTIN_NAMES } from './componentPlugins/builtin';
import { parseActionMeta } from './genToolsPlugin';

export const MAX_PLUGIN_BYTES = 512 * 1024;

/** 上传插件源码快检：长度上限 + 语法可解析（不执行）。 */
export function validatePluginCode(code: string): void {
  if (code.length > MAX_PLUGIN_BYTES) {
    throw new Error('插件代码超过 512KB 上限');
  }
  try {
    // 仅做语法解析校验，不执行任何用户代码。
    // 源码约定：求值「插件定义对象」的表达式（对象字面量或 IIFE 表达式），平台注入时会封装 register 并注入 id。
    new Function(`return (${code.trim()})`);
  } catch (e) {
    throw new Error(`插件代码语法错误：${(e as Error).message ?? e}（源码需为一个求值插件定义对象的表达式）`);
  }
}

// ---- actions 声明的静态词法扫描（上传/重传时的 label 一致性检测，尽力而为、不执行代码）----
// 纯词法函数位于 genToolsPlugin.ts（无 DB 依赖，可单测），此处仅保留依赖 prisma 的冲突比对。

/**
 * 声明的动作 label 与库内其他插件同名动作 label 的一致性检测：
 * 同名语义动作在词表按 preset 优先级只取先声明插件的元数据，label 不一致会造成展示名随预设顺序飘忽。
 * 返回人类可读的警告列表（无冲突返回空数组）；excludeId 用于重传时排除插件自身旧元数据。
 */
export async function actionLabelConflicts(
  declared: { name: string; label?: string }[],
  excludeId?: string,
): Promise<string[]> {
  const labeled = declared.filter((d) => d.label);
  if (!labeled.length) return [];
  const rows = await prisma.plugin.findMany({
    where: excludeId ? { id: { not: excludeId } } : {},
    select: { name: true, actions: true },
  });
  const warnings: string[] = [];
  const seen = new Set<string>();
  for (const d of labeled) {
    for (const p of rows) {
      for (const meta of parseActionMeta(p.actions)) {
        if (meta.name !== d.name || !meta.label || meta.label === d.label) continue;
        const key = `${d.name}|${p.name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        warnings.push(
          `动作 ${d.name} 的展示名「${d.label}」与插件「${p.name}」的「${meta.label}」不一致（同名动作词表按预设优先级取先声明插件的元数据）`,
        );
      }
    }
  }
  return warnings;
}

/**
 * 为 preset 追加缺失的内置插件成员（排在现有成员之后，保持既有优先级稳定）。
 * 旧框架插件迁移与「默认组合」同步共用。
 */
async function appendBuiltinMembers(presetId: string): Promise<void> {
  const existing = await prisma.pluginPresetItem.findMany({
    where: { presetId },
    select: { priority: true, plugin: { select: { name: true } } },
  });
  const names = new Set(existing.map((i) => i.plugin.name));
  let priority = existing.reduce((max, i) => Math.max(max, i.priority), -1) + 1;
  const plugins = await prisma.plugin.findMany({
    where: { name: { in: BUILTIN_PRESET_MEMBERS } },
    select: { id: true, name: true },
  });
  const byName = new Map(plugins.map((p) => [p.name, p.id]));
  for (const name of BUILTIN_PRESET_MEMBERS) {
    if (names.has(name)) continue;
    const pluginId = byName.get(name);
    if (!pluginId) continue;
    await prisma.pluginPresetItem.create({ data: { presetId, pluginId, priority: priority++ } });
  }
}

/**
 * 旧试运行回写形态 [{id, actions: [...]}]（listActions 直写）归一化为动作元数据 [{name}]。
 * 幂等：已是元数据形态（条目含 name、无 actions 数组）的行不重写。doc 信息旧形态未存，回写试运行后补全。
 */
async function normalizeLegacyActionShapes(): Promise<void> {
  const rows = await prisma.plugin.findMany({ select: { id: true, actions: true } });
  for (const row of rows) {
    const a = row.actions as unknown;
    if (!Array.isArray(a) || !a.some((x) => x && Array.isArray((x as any).actions))) continue;
    const meta = a.flatMap((x: any) => (Array.isArray(x?.actions) ? x.actions.map((n: unknown) => ({ name: String(n) })) : []));
    await prisma.plugin.update({ where: { id: row.id }, data: { actions: meta } });
  }
}

/**
 * 启动时调用：
 * 1. upsert 内置能力插件（entryFile/描述/动作元数据随代码升级覆盖更新；actions 显式整体覆盖，
 *    避免条件展开导致旧元数据残留）；
 * 2. 旧内置插件迁移清理：框架级（antd / element-plus）与能力级（select / tree-select /
 *    date-picker）→ 记录引用 preset → 删除插件（preset 成员级联删除）
 *    → 为受影响 preset 补入新内置成员，保证存量项目生成/回放能力连续；
 * 3. seed/同步内置「默认组合」：已存在则补缺失成员（不删除用户额外成员），不存在则按内置成员顺序 seed；
 * 4. 插件 actions 旧回写形态归一化（[{id, actions}] → [{name}]）。
 */
export async function ensureBuiltinPlugins(): Promise<void> {
  await normalizeLegacyActionShapes();
  for (const def of BUILTIN_PLUGIN_DEFS) {
    await prisma.plugin.upsert({
      where: { name: def.name },
      create: {
        name: def.name,
        version: def.version,
        description: def.description,
        entryFile: def.entryFile,
        source: 'builtin',
        builtin: true,
        actions: def.actionsMeta ?? [],
      },
      update: {
        version: def.version,
        description: def.description,
        entryFile: def.entryFile,
        builtin: true,
        actions: def.actionsMeta ?? [],
      },
    });
  }

  const legacy = await prisma.plugin.findMany({
    where: { name: { in: LEGACY_BUILTIN_NAMES }, source: 'builtin' },
    select: { id: true },
  });
  if (legacy.length) {
    const legacyIds = legacy.map((l) => l.id);
    const referencing = await prisma.pluginPresetItem.findMany({
      where: { pluginId: { in: legacyIds } },
      select: { presetId: true },
      distinct: ['presetId'],
    });
    await prisma.plugin.deleteMany({ where: { id: { in: legacyIds } } });
    for (const r of referencing) await appendBuiltinMembers(r.presetId);
  }

  const existing = await prisma.pluginPreset.findUnique({ where: { name: DEFAULT_PRESET_NAME } });
  if (existing) {
    await appendBuiltinMembers(existing.id);
    return;
  }
  const members = await prisma.plugin.findMany({
    where: { name: { in: BUILTIN_PRESET_MEMBERS } },
    select: { id: true, name: true },
  });
  const byName = new Map(members.map((m) => [m.name, m.id]));
  const ordered = BUILTIN_PRESET_MEMBERS.map((n) => byName.get(n)).filter((x): x is string => Boolean(x));
  await prisma.pluginPreset.create({
    data: {
      name: DEFAULT_PRESET_NAME,
      description: '内置默认组合（ant/el × select / tree-select / date-picker 能力插件）',
      builtin: true,
      items: { create: ordered.map((pluginId, priority) => ({ pluginId, priority })) },
    },
  });
}

/**
 * 注入插件记录（Preset 为唯一编排入口）：
 * - 项目关联 preset → 成员按 priority 升序；
 * - 未关联项目（presetId 置空/未传 projectId）→ 默认使用内置「默认组合」的成员。
 * 供脚本注入（取 entryFile）与 LLM 工具清单（取 actions 元数据）共用。
 */
export async function enabledPluginRecords(projectId?: string | null) {
  // 解析目标预设：项目关联优先，未关联一律回落内置「默认组合」
  let presetId: string | null | undefined = undefined;
  if (projectId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { presetId: true },
    });
    presetId = project?.presetId;
  }
  if (!presetId) {
    const fallback = await prisma.pluginPreset.findUnique({
      where: { name: DEFAULT_PRESET_NAME },
      select: { id: true },
    });
    presetId = fallback?.id ?? null;
  }
  if (!presetId) return [];
  const items = await prisma.pluginPresetItem.findMany({
    where: { presetId },
    orderBy: { priority: 'asc' },
    include: { plugin: true },
  });
  return items.map((i) => i.plugin);
}

/**
 * 注入脚本列表（Preset 为唯一编排入口）：
 * - 项目关联 preset → 成员按 priority 升序返回源码；
 * - 未关联项目（presetId 置空/未传 projectId）→ 内置「默认组合」成员按 priority 升序。
 * 返回顺序即页内注册顺序，也就是语义动作匹配链（resolveChain）的优先级顺序。
 */
export async function enabledInpageScripts(projectId?: string | null): Promise<{ id: string; code: string }[]> {
  const records = await enabledPluginRecords(projectId);
  // id 取平台插件名（全库唯一）：注入前由 buildPluginInitScript 写入 window.__ttPluginId__，供插件 register 使用
  return records.map((p) => ({ id: p.name, code: p.entryFile }));
}

/** 插件动作词表条目（同名语义动作按 preset 优先级取首个声明）。 */
export interface ActionVocabEntry {
  /** 语义动作名（如 select / set_date），即页内插件 actions 的键。 */
  name: string;
  /** 给 LLM 的动作说明。 */
  doc?: string;
  /** 插件声明的界面展示名（如「选择收货地址」）。 */
  label?: string;
  /** true 时平台外壳先尝试 Playwright fill+Enter。 */
  preferFill?: boolean;
  pluginId: string;
  pluginName: string;
}

/**
 * 项目可用的插件动作词表（Preset 编排，priority 升序去重）：
 * 供预拆分 prompt 词表段与生成期统一 component_action 工具共用。
 */
export async function enabledActionVocabulary(projectId?: string | null): Promise<ActionVocabEntry[]> {
  const records = await enabledPluginRecords(projectId);
  const out: ActionVocabEntry[] = [];
  const seen = new Set<string>();
  for (const p of records) {
    for (const meta of parseActionMeta(p.actions)) {
      if (seen.has(meta.name)) continue;
      seen.add(meta.name);
      out.push({ name: meta.name, doc: meta.doc, label: meta.label, preferFill: meta.preferFill, pluginId: p.id, pluginName: p.name });
    }
  }
  return out;
}
