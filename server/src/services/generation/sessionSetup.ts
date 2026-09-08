import { chromium } from 'playwright-core';
import { prisma } from '../../db';
import { getAttachment } from '../attachmentService';
import { CANDIDATE_SCRIPT } from '../locatorCandidateScript';
import { readViewport, type ViewportSize } from '../../shared/viewport';
import { closeSession, getCdpPort } from '../stagehandManager';
import { enabledInpageScripts } from '../pluginStore';
import { buildPluginInitScript, type PluginInjectItem } from '../pluginRuntime';
import { installPluginPwBridge } from '../../../scripts/pluginPwBridge';
import { reconcileTotalUsage } from '../generationLogService';
import { pub } from './logBridge';
import { scheduleSessionGc } from './jobControl';
import { buildAttachmentParts, normalizeStepSystemVars, safeJsonParse } from './util';
import type { SplitImage } from './types';
import type { TestStep } from '../../shared/testScript';
import { redactGenerationData } from './privacy';

export { createSubstituter } from './substitution';

/** 环境变量提示：拼进预拆分 prompt，引导模型用 {{key}} 占位符引用而非写死真实值。 */
export function buildEnvVarHint(envMap: Record<string, string>): string {
  const envVarKeys = Object.keys(envMap);
  return envVarKeys.length
    ? `本项目可用环境变量：${envVarKeys.map((k) => `{{${k}}}`).join('、')}。步骤中涉及这些值时用对应占位符引用，不要写死真实值。`
    : '';
}

/** 加载并归一化附件（文本提取 / 图片原始图）。附件缺失时 pub gen:error 并返回 null（调用方应终止本次生成）。 */
export function loadGenAttachments(jobId: string, ids: string[]): { text: string; images: SplitImage[] } | null {
  if (!ids.length) return { text: '', images: [] };
  const atts = ids.map((id) => getAttachment(id)).filter((a) => Boolean(a)) as NonNullable<ReturnType<typeof getAttachment>>[];
  const missing = ids.filter((id) => !atts.some((a) => a.id === id));
  if (missing.length > 0) {
    pub({ type: 'gen:error', jobId, message: `${missing.length} 个附件不存在或已过期，请重新添加后重试`, missingAttachments: missing });
    return null;
  }
  const { text, images } = buildAttachmentParts(atts);
  const visionNote = images.length ? `；其中 ${images.length} 张图片已以多模态直接发给主模型` : '';
  pub({ type: 'gen:status', jobId, message: `[附件] 已加载 ${atts.length} 个文件：${atts.map((a) => a.name).join('、')}${visionNote}` });
  return { text, images };
}

/** 落库 emit：归一化旧写法后 push 步骤并广播 gen:step。index 以 offsetOf() 动态偏移
 *  （续跑模式撤销决策可能中途裁掉 baseSteps 尾部，固定偏移会让 gen:step 索引错位）。 */
export function createStepEmitter(jobId: string, steps: TestStep[], offsetOf: () => number): (step: TestStep) => Promise<void> {
  return async (step: TestStep): Promise<void> => {
    step = redactGenerationData(jobId, step);
    normalizeStepSystemVars(step); // 原地归一化，push/pub 同一对象（引用一致性）
    steps.push(step);
    pub({ type: 'gen:step', jobId, index: offsetOf() + steps.length - 1, step });
  };
}

/** 生成会话页引导（生成/继续生成共用）：插件注入（preset 编排）+ 候选脚本常驻 + CDP 连 playwright
 *  视图 + Playwright 桥。返回 error 时已自行关闭 pwBrowser 连接，调用方 pub gen:error 并终止。 */
export async function setupGenPage(
  jobId: string,
  page: any,
  projectId: string | null | undefined,
): Promise<{ pwBrowser: any; pwPage: any; error?: string }> {
  // 插件注入（preset 编排）：buildPluginInitScript 内部先运行时框架、后成员插件——
  // 插件脚本依赖 __ttPluginRuntimeInstalled__ 守卫，顺序颠倒会静默跳过注册（勿改）。
  let pluginScripts: PluginInjectItem[] = [];
  try {
    pluginScripts = await enabledInpageScripts(projectId ?? null);
    if (pluginScripts.length) await page.addInitScript(buildPluginInitScript(pluginScripts));
  } catch {
    /* 插件注入失败不阻塞生成（动作工具仍会被尝试注册，执行时页内报缺运行时） */
  }
  // 候选脚本常驻：语义化（__ttAnalyze/__ttResolve/__ttPickCss）跨导航可用，避免热路径重复注入
  try {
    await page.addInitScript(CANDIDATE_SCRIPT);
  } catch {
    /* 注入失败则由 semanticizeLocator 的守卫式注入兜底 */
  }
  // 连接 playwright 视图：语义化用真实 getBy* 精确验证（与回放同引擎）；连接失败直接终止，不做页内兜底
  const pw = await connectPwView(jobId, page);
  if (!pw.pwPage) {
    if (pw.pwBrowser) {
      try {
        await pw.pwBrowser.close();
      } catch {
        /* 忽略 */
      }
    }
    return { pwBrowser: null, pwPage: null, error: `浏览器精确验证通道（CDP）连接失败：${pw.error ?? '未知原因'}。已终止本次生成，请重试` };
  }
  // Playwright 桥（页内插件经 pw.* 调真实 Playwright API）：桥注入失败不阻塞生成，
  // 插件内调用 pw 时收到「桥未注入」报错后按各自兜底路径执行
  if (pluginScripts.length) {
    try {
      await installPluginPwBridge(pw.pwPage);
    } catch (e) {
      console.warn('[plugin] Playwright 桥注入失败（插件内 pw 将不可用）：', e);
    }
  }
  return { pwBrowser: pw.pwBrowser, pwPage: pw.pwPage };
}

/** 任务内层收尾：关 pw 连接（只关连接，不关浏览器）；暂停（非取消）时保留浏览器会话供
 *  「继续生成」复用，超时由 GC 定时器回收，否则关闭会话；最后 usage 对账（头部 totalUsage
 *  取「Σ步骤明细 vs 运行时累计」大者，防御记账丢轮）。 */
export async function finalizeGenJob(jobId: string, o: { paused: boolean; pwBrowser: any; logId: string | null }): Promise<void> {
  if (o.pwBrowser) {
    try {
      await o.pwBrowser.close(); // 只关连接，不关浏览器
    } catch {
      /* 忽略 */
    }
  }
  if (o.paused) scheduleSessionGc(jobId);
  else await closeSession(jobId);
  if (o.logId) await reconcileTotalUsage(o.logId);
}

/** 连接会话浏览器的 playwright 视图（与 Stagehand 同一底层标签），供语义化做真实 Playwright 精确验证；失败返回错误信息。 */
async function connectPwView(jobId: string, page: any): Promise<{ pwBrowser: any; pwPage: any; error?: string }> {
  const cdpPort = getCdpPort(jobId);
  if (!cdpPort) return { pwBrowser: null, pwPage: null, error: `未找到会话 CDP 端口（jobId=${jobId}）` };
  // 浏览器绑定调试端口存在时序竞态，带退避重试；仍失败则返回真实错误供终止提示
  let lastErr: string | undefined;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const pwBrowser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
      const ctx = pwBrowser.contexts()[0];
      const pages = await ctx.pages();
      // Stagehand v4 的 page.url() 是异步的，必须 await
      let pageUrl = '';
      try {
        pageUrl = String((await page.url()) ?? '');
      } catch {
        /* 页面不可用则按空处理 */
      }
      const url = pageUrl.split('#')[0];
      const pwPage = (url && pages.find((p: any) => (p.url?.() ?? '').split('#')[0] === url)) || pages[0] || null;
      if (!pwPage) {
        return { pwBrowser, pwPage: null, error: `CDP 已连接但未找到页面（共 ${pages.length} 个，url=${url || '(空)'}）` };
      }
      return { pwBrowser, pwPage };
    } catch (e) {
      lastErr = String(e);
      if (attempt < 4) await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
    }
  }
  return { pwBrowser: null, pwPage: null, error: lastErr ?? '连接失败' };
}

/** 加载登录配置的 storageState；不存在或为空时 ok=false 并带回描述性 name 供状态提示。 */
export async function loadLoginStorageState(loginConfigId: string): Promise<{ storageState: unknown; name: string; ok: boolean }> {
  const cfg = await prisma.loginConfig.findUnique({ where: { id: loginConfigId }, select: { storageState: true, name: true } });
  if (!cfg) return { storageState: null, name: `${loginConfigId} 不存在`, ok: false };
  // Prisma Json 字段读出即为已解析对象；兼容历史字符串。
  const ss = typeof cfg.storageState === 'string' ? safeJsonParse(cfg.storageState) : cfg.storageState;
  if (!ss) return { storageState: null, name: `「${cfg.name}」状态为空`, ok: false };
  return { storageState: ss, name: cfg.name, ok: true };
}

/** 取项目配置的浏览器窗口尺寸（未配置/项目不存在时 null = 默认 1920×1080）。 */
export async function loadProjectViewport(projectId: string | null | undefined): Promise<ViewportSize | null> {
  if (!projectId) return null;
  const p = await prisma.project.findUnique({ where: { id: projectId }, select: { viewport: true } });
  return readViewport(p?.viewport);
}
