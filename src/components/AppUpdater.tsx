import { useEffect, useState, useSyncExternalStore } from 'react';
import { Alert, App, Button, Card, Modal, Progress, Space, Switch, Tooltip, Typography } from 'antd';
import { CloudDownloadOutlined } from '@ant-design/icons';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { check } from '@tauri-apps/plugin-updater';
import { useTranslation } from 'react-i18next';
import { createUpdateController } from '../utils/updateController';
import { version as appVersion } from '../../package.json';

const controller = createUpdateController({
  enabled: () => invoke<boolean>('updater_enabled'),
  check: () => check({ timeout: 20_000 }),
  prepare: () => invoke('prepare_app_update'),
  recover: () => invoke('recover_app_update'),
  restart: () => invoke('restart_app'),
});
const preferenceKey = 'testdog-auto-update';
const openUpdaterEvent = 'testdog:open-updater';

export function UpdateSettings() {
  const { t } = useTranslation();
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const desktop = isTauri();
  const busy = ['checking', 'downloading', 'installing'].includes(state.phase);
  const installable = state.phase === 'ready' || state.phase === 'restart';

  return (
    <Card title={t('updater.title')} className="mb-4 max-w-[640px]" size="small">
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Space wrap>
          <Typography.Text>{t('common.version')} v{appVersion}</Typography.Text>
          <Button
            type="primary"
            icon={<CloudDownloadOutlined />}
            aria-label={t(installable ? 'updater.viewUpdate' : 'updater.check')}
            disabled={!desktop || busy}
            loading={busy}
            onClick={() => {
              window.dispatchEvent(new Event(openUpdaterEvent));
              void controller.check();
            }}
          >
            {t(installable ? 'updater.viewUpdate' : 'updater.check')}
          </Button>
        </Space>
        <Typography.Text type={state.error ? 'danger' : 'secondary'} role="status">
          {desktop ? t(`updater.${state.phase}`, { version: state.version }) : t('updater.desktopOnly')}
        </Typography.Text>
      </Space>
    </Card>
  );
}

export default function AppUpdater({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation();
  const { notification, modal } = App.useApp();
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [open, setOpen] = useState(false);
  const [automatic, setAutomatic] = useState(() => {
    try { return localStorage.getItem(preferenceKey) !== 'false'; } catch { return true; }
  });
  const desktop = isTauri();

  useEffect(() => {
    const showUpdater = () => setOpen(true);
    window.addEventListener(openUpdaterEvent, showUpdater);
    return () => window.removeEventListener(openUpdaterEvent, showUpdater);
  }, []);

  useEffect(() => {
    if (!desktop || !automatic || import.meta.env.DEV) return;
    const startup = window.setTimeout(() => { void controller.check(); }, 5000);
    const periodic = window.setInterval(() => { void controller.check(); }, 4 * 60 * 60 * 1000);
    const online = () => { void controller.check(); };
    window.addEventListener('online', online);
    return () => {
      window.clearTimeout(startup);
      window.clearInterval(periodic);
      window.removeEventListener('online', online);
    };
  }, [desktop, automatic]);

  useEffect(() => {
    if (state.phase !== 'ready') return;
    notification.info({
      key: 'app-update-ready',
      message: t('updater.ready', { version: state.version }),
      duration: 0,
      btn: <Button type="primary" onClick={() => { setOpen(true); notification.destroy('app-update-ready'); }}>{t('updater.title')}</Button>,
    });
    return () => notification.destroy('app-update-ready');
  }, [state.phase, state.version, notification, t]);

  if (!desktop) return null;
  const busy = ['checking', 'downloading', 'installing'].includes(state.phase);
  const installable = state.phase === 'ready' || state.phase === 'restart';
  const status = t(`updater.${state.phase}`, { version: state.version });
  return (
    <>
      <Tooltip title={status} placement="right">
        <Button
          type="text"
          className="mx-2 mb-1"
          icon={<CloudDownloadOutlined />}
          aria-label={t('updater.title')}
          onClick={() => setOpen(true)}
          style={installable ? { color: 'var(--ant-color-primary, #1677ff)' } : undefined}
        >
          {!collapsed && (installable ? t('updater.install') : t('updater.title'))}
        </Button>
      </Tooltip>
      <Modal
        title={t('updater.title')}
        open={open}
        onCancel={() => setOpen(false)}
        closable={state.phase !== 'installing'}
        maskClosable={state.phase !== 'installing'}
        keyboard={state.phase !== 'installing'}
        footer={[
          <Button key="later" disabled={state.phase === 'installing'} onClick={() => setOpen(false)}>{t('updater.later')}</Button>,
          installable
            ? <Button key="install" type="primary" onClick={() => modal.confirm({
              title: t('updater.confirmTitle'),
              content: t('updater.confirm'),
              okText: t(state.phase === 'restart' ? 'updater.restartButton' : 'updater.install'),
              cancelText: t('updater.later'),
              onOk: () => { void controller.install(); },
            })}>{t(state.phase === 'restart' ? 'updater.restartButton' : 'updater.install')}</Button>
            : <Button key="check" type="primary" disabled={busy} loading={busy} onClick={() => { void controller.check(); }}>{t('updater.check')}</Button>,
        ]}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Space>
            <Switch checked={automatic} aria-label={t('updater.auto')} onChange={(value) => {
              setAutomatic(value);
              try { localStorage.setItem(preferenceKey, String(value)); } catch { /* session preference still applies */ }
            }} />
            <span>{t('updater.auto')}</span>
          </Space>
          <Typography.Text type="secondary">{t('updater.description')}</Typography.Text>
          <Alert showIcon type={state.error ? 'error' : installable ? 'success' : 'info'} message={status} description={state.error} />
          {state.phase === 'downloading' && (
            state.total
              ? <Progress percent={Math.min(99, Math.floor(state.downloaded / state.total * 100))} status="active" />
              : <Typography.Text>{t('updater.downloaded', { size: (state.downloaded / 1024 / 1024).toFixed(1) })}</Typography.Text>
          )}
          {state.notes && <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', maxHeight: 240, overflow: 'auto' }}>{state.notes}</Typography.Paragraph>}
        </Space>
      </Modal>
    </>
  );
}
