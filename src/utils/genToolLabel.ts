import type { TFunction } from 'i18next';

/** 旧版本 GenerationStep.tool 直接落中文展示名；把旧中文名归一回工具名再走 i18n（genTool.*）。 */
const LEGACY_ZH_LABEL: Record<string, string> = {
  滚动: 'scroll',
  上传文件: 'upload',
  测试文件: 'list_files',
  快照: 'snapshot',
  结构树: 'page_tree',
  导航: 'goto',
  点击: 'click',
  填写: 'fill',
  按键: 'press',
  勾选: 'check',
  选择: 'select',
  等待: 'wait',
  读取文本: 'readText',
  断言: 'assert',
  'AI 兜底': 'act',
  视觉观察: 'see',
  网络请求: 'api',
  组件动作: 'component_action',
  批量填写: 'batch_actions',
  读取目标: 'read_goal',
  读取脚本: 'read_script',
  验收覆盖: 'read_coverage',
  人工求助: 'ask_human',
  完成: 'finish',
  脚本审查: 'script_review',
  手动捕获: 'manual_capture',
};

/** 生成记录工具名展示：新记录 tool 列为原始工具名（genTool.* 词条），旧记录的中文展示名先归一再翻译，未知值回退原名。 */
export function genToolLabel(t: TFunction, name: string | null | undefined): string {
  if (!name) return '';
  const key = LEGACY_ZH_LABEL[name] ?? name;
  return t(`genTool.${key}`, { defaultValue: name });
}
