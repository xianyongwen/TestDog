/** 状态/动作常量 + 中文标签（前后端共用，界面统一中文）。 */

export const RUN_STATUS = [
  'PENDING',
  'RUNNING',
  'PASSED',
  'FAILED',
  'ERROR',
  'CANCELLED',
] as const;
export type RunStatus = (typeof RUN_STATUS)[number];

export const RUN_STATUS_LABEL: Record<string, string> = {
  PENDING: '待运行',
  RUNNING: '运行中',
  PASSED: '通过',
  FAILED: '失败',
  ERROR: '出错',
  CANCELLED: '已取消',
};

export const STEP_STATUS = ['PENDING', 'PASSED', 'FAILED', 'SKIPPED'] as const;
export type StepStatus = (typeof STEP_STATUS)[number];

export const STEP_STATUS_LABEL: Record<string, string> = {
  PENDING: '待运行',
  PASSED: '通过',
  FAILED: '失败',
  SKIPPED: '跳过',
};

export const STEP_ACTION_LABEL: Record<string, string> = {
  goto: '打开页面',
  click: '点击',
  fill: '填写',
  press: '按键',
  check: '勾选',
  select: '选择',
  assert: '断言',
  wait: '等待',
  raw: '原始代码',
  plugin: '组件动作',
  // 内置组件语义动作（计划确认/导出场景直接中文展示；插件自定义语义动作回退显示原名）
  // 内置组件语义动作（计划确认/导出场景直接中文展示；插件自定义语义动作回退显示原名）
  set_date: '设置日期',
};

/** 步骤动作展示名：plugin 步骤优先显示其语义动作（pluginAction.label 为插件声明展示名，
 *  其次平台内置标签表，再回退动作名原名）。 */
export function stepActionDisplay(
  action: string | null | undefined,
  pluginAction?: { action?: string; label?: string } | null,
): string {
  const a = action ?? '';
  if (a === 'plugin' && pluginAction?.action) {
    return pluginAction.label || STEP_ACTION_LABEL[pluginAction.action] || pluginAction.action;
  }
  return STEP_ACTION_LABEL[a] ?? a;
}

export const TESTCASE_STATUS_LABEL: Record<string, string> = {
  DRAFT: '草稿',
  ACTIVE: '启用',
  ARCHIVED: '归档',
};

/** antd Tag 颜色映射。 */
export const RUN_STATUS_COLOR: Record<string, string> = {
  PENDING: 'default',
  RUNNING: 'processing',
  PASSED: 'success',
  FAILED: 'error',
  ERROR: 'warning',
  CANCELLED: 'default',
};
