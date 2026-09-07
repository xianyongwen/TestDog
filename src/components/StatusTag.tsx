import { Tag } from 'antd';
import { useTranslation } from 'react-i18next';
import { RUN_STATUS_COLOR, STEP_ACTION_LABEL } from '@shared/constants';

export function RunStatusTag({ status }: { status: string }) {
  const { t } = useTranslation();
  const label =
    ({
      PENDING: t('status.run.PENDING'),
      RUNNING: t('status.run.RUNNING'),
      PASSED: t('status.run.PASSED'),
      FAILED: t('status.run.FAILED'),
      ERROR: t('status.run.ERROR'),
      CANCELLED: t('status.run.CANCELLED'),
    } as Record<string, string>)[status] ?? status;
  return <Tag color={RUN_STATUS_COLOR[status] ?? 'default'}>{label}</Tag>;
}

export function StepStatusTag({ status }: { status: string }) {
  const { t } = useTranslation();
  const label =
    ({
      PENDING: t('status.step.PENDING'),
      PASSED: t('status.step.PASSED'),
      FAILED: t('status.step.FAILED'),
      SKIPPED: t('status.step.SKIPPED'),
    } as Record<string, string>)[status] ?? status;
  const color = status === 'PASSED' ? 'success' : status === 'FAILED' ? 'error' : status === 'SKIPPED' ? 'default' : 'processing';
  return <Tag color={color}>{label}</Tag>;
}

export function ActionTag({ action, pluginAction }: { action: string; pluginAction?: { action?: string; label?: string } | null }) {
  const { t } = useTranslation();
  // 组件语义动作（plugin 步骤）优先显示插件声明展示名（pluginAction.label），其次平台内置标签表，回退动作名
  const semantic = action === 'plugin' && pluginAction?.action ? pluginAction.label || STEP_ACTION_LABEL[pluginAction.action] || pluginAction.action : undefined;
  const label =
    semantic ??
    ({
      goto: t('status.action.goto'),
      click: t('status.action.click'),
      fill: t('status.action.fill'),
      press: t('status.action.press'),
      check: t('status.action.check'),
      select: t('status.action.select'),
      assert: t('status.action.assert'),
      wait: t('status.action.wait'),
      raw: t('status.action.raw'),
      plugin: t('status.action.plugin'),
    } as Record<string, string>)[action] ??
    action;
  return <Tag>{label}</Tag>;
}
