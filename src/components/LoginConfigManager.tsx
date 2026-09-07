import { useEffect, useRef, useState } from 'react';
import { Modal, Button, Input, Space, Tag, Popconfirm, Tooltip, App, Alert } from 'antd';
import SortableTable from './SortableTable';
import { DeleteOutlined, VideoCameraOutlined, StopOutlined, EditOutlined, CheckOutlined, ReloadOutlined, CloseCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useTranslation } from 'react-i18next';
import { http } from '../api/client';
import { ws } from '../api/ws';
import RunLog, { type LogItem } from './RunLog';

interface LoginConfig {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
}

interface ProjectRef {
  id: string;
  name: string;
  baseUrl?: string;
}

/**
 * 登录配置管理：列出项目的登录配置（增删改 + 设默认），并提供录制入口。
 * 录制流程：打开有头浏览器 -> 用户手动登录 -> 点「停止并保存」捕获 storageState -> 落库。
 */
export default function LoginConfigManager({
  project,
  open,
  onClose,
}: {
  project: ProjectRef | null;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [configs, setConfigs] = useState<LoginConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [recording, setRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const jobIdRef = useRef<string | null>(null);
  // 正在重新录制的配置：停止时更新该配置而非新建
  const [refreshing, setRefreshing] = useState<LoginConfig | null>(null);

  // 重命名
  const [editing, setEditing] = useState<LoginConfig | null>(null);
  const [editName, setEditName] = useState('');

  const load = async () => {
    if (!project) return;
    setLoading(true);
    try {
      setConfigs(await http.get<LoginConfig[]>(`/api/projects/${project.id}/login-configs`));
    } catch (e) {
      message.error(t('loginConfig.loadFailed', { err: String(e) }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && project) {
      setUrl(project.baseUrl || '');
      setName('');
      setLogs([]);
      setRecording(false);
      setRefreshing(null);
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, project?.id]);

  useEffect(() => {
    return ws.on((msg) => {
      if (!jobIdRef.current || msg.jobId !== jobIdRef.current) return;
      if (msg.type === 'loginconfig:status') {
        setLogs((p) => [...p, { color: msg.status === 'warning' ? 'orange' : 'blue', title: String(msg.message ?? '') }]);
      } else if (msg.type === 'loginconfig:error') {
        // 浏览器被直接关闭等异常：取消录制过程，复位 UI
        jobIdRef.current = null;
        setRecording(false);
        setRefreshing(null);
        message.error(String(msg.message ?? t('loginConfig.recordFailed')));
        setLogs((p) => [...p, { color: 'red', title: String(msg.message ?? t('loginConfig.recordFailed')) }]);
      }
    });
  }, [message, t]);

  const start = async (config?: LoginConfig) => {
    if (!project) return;
    const targetUrl = (url.trim() || project.baseUrl || '').trim();
    if (!targetUrl) {
      message.warning(t('loginConfig.needUrl'));
      return;
    }
    setRefreshing(config ?? null);
    setLogs([]);
    setRecording(true);
    try {
      const { jobId } = await http.post<{ jobId: string }>(
        `/api/projects/${project.id}/login-configs/record/start`,
        { url: targetUrl },
      );
      jobIdRef.current = jobId;
      setLogs((p) => [
        ...p,
        {
          color: 'blue',
          title: config ? t('loginConfig.rerecording', { name: config.name }) : t('loginConfig.browserOpened'),
        },
      ]);
    } catch (e) {
      setRecording(false);
      setRefreshing(null);
      message.error(t('loginConfig.startFailed', { err: String(e) }));
    }
  };

  const stop = async () => {
    if (!project || !jobIdRef.current) return;
    setSaving(true);
    try {
      const { storageState } = await http.post<{ storageState: unknown }>('/api/login-configs/record/stop', {
        jobId: jobIdRef.current,
      });
      if (refreshing) {
        await http.put(`/api/login-configs/${refreshing.id}/storage-state`, { storageState });
        message.success(t('loginConfig.updated', { name: refreshing.name }));
      } else {
        const finalName = name.trim() || t('loginConfig.autoName', { count: configs.length + 1 });
        await http.post(`/api/projects/${project.id}/login-configs`, { name: finalName, storageState });
        message.success(t('loginConfig.saved'));
      }
      setRecording(false);
      setRefreshing(null);
      setName('');
      jobIdRef.current = null;
      load();
    } catch (e) {
      message.error(t('loginConfig.saveFailed', { err: String(e) }));
      setRecording(false);
      setRefreshing(null);
    } finally {
      setSaving(false);
    }
  };

  /** 取消录制：通知服务端关闭浏览器并丢弃会话，立即复位 UI。 */
  const cancel = async () => {
    const jobId = jobIdRef.current;
    if (!jobId) return;
    jobIdRef.current = null;
    setRecording(false);
    setRefreshing(null);
    setLogs((p) => [...p, { color: 'orange', title: t('loginConfig.cancelled') }]);
    try {
      await http.post('/api/login-configs/record/cancel', { jobId });
    } catch {
      /* 会话可能已结束（浏览器被直接关闭等），忽略 */
    }
  };

  const setDefault = async (id: string) => {
    if (!project) return;
    try {
      await http.put(`/api/projects/${project.id}/login-configs/${id}/default`);
      load();
    } catch (e) {
      message.error(t('loginConfig.setDefaultFailed', { err: String(e) }));
    }
  };

  const remove = async (id: string) => {
    try {
      await http.del(`/api/login-configs/${id}`);
      message.success(t('loginConfig.deleted'));
      load();
    } catch (e) {
      message.error(t('loginConfig.deleteFailed', { err: String(e) }));
    }
  };

  const startRename = (r: LoginConfig) => {
    setEditing(r);
    setEditName(r.name);
  };
  const submitRename = async () => {
    if (!editing) return;
    if (!editName.trim()) {
      message.warning(t('loginConfig.nameRequired'));
      return;
    }
    try {
      await http.put(`/api/login-configs/${editing.id}`, { name: editName.trim() });
      message.success(t('loginConfig.renamed'));
      setEditing(null);
      load();
    } catch (e) {
      message.error(t('loginConfig.renameFailed', { err: String(e) }));
    }
  };

  const columns: ColumnsType<LoginConfig> = [
    // 标题列用实色 textPrimary：antd 表体默认色是 colorTextBase 88% 透明度，观感偏灰
    { title: t('loginConfig.name'), dataIndex: 'name', render: (n) => <span className="text-ink">{n}</span> },
    { title: t('loginConfig.isDefault'), dataIndex: 'isDefault', width: 80, render: (v) => (v ? <Tag color="green">{t('common.default')}</Tag> : '-') },
    { title: t('common.createdAt'), dataIndex: 'createdAt', width: 180, render: (v) => new Date(v as string).toLocaleString() },
    {
      title: t('common.actions'),
      width: 280,
      render: (_v, r) => (
        <Space>
          {!r.isDefault && (
            <Tooltip title={t('loginConfig.setDefault')}>
              <Button size="small" type="text" icon={<CheckOutlined />} onClick={() => setDefault(r.id)} />
            </Tooltip>
          )}
          <Tooltip title={t('loginConfig.reRecord')}>
            <Button size="small" type="text" icon={<ReloadOutlined />} disabled={recording} onClick={() => start(r)} />
          </Tooltip>
          <Button size="small" type="text" icon={<EditOutlined />} onClick={() => startRename(r)} />
          <Popconfirm title={t('loginConfig.deleteConfirm')} onConfirm={() => remove(r.id)}>
            <Button size="small" type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Modal
        title={t('loginConfig.title', { suffix: project ? ` · ${project.name}` : '' })}
        open={open}
        onCancel={onClose}
        maskClosable={false}
        width={720}
        footer={<Button onClick={onClose}>{t('common.close')}</Button>}
        destroyOnClose
      >
        <Alert
          type="info"
          showIcon
          className="mb-3"
          message={t('loginConfig.alert')}
          description={t('loginConfig.alertDesc')}
        />
        <SortableTable
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={configs}
          columns={columns}
          className="mb-4"
        />

        <div className="border-t border-line-subtle pt-4">
          <div className="mb-2 font-semibold">{t('loginConfig.newConfig')}</div>
          <Space className="w-full" wrap>
            <Input
              placeholder={t('loginConfig.urlPlaceholder')}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="!w-[360px]"
              disabled={recording}
            />
            <Input
              placeholder={t('loginConfig.namePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="!w-[220px]"
              disabled={recording}
            />
            {!recording ? (
              <Button type="primary" onClick={() => start()}>
                <VideoCameraOutlined className="mr-1.5" />
                {t('loginConfig.startRecord')}
              </Button>
            ) : (
              <Space>
                <Button type="primary" onClick={stop} disabled={saving}>
                  <StopOutlined className="mr-1.5" />
                  {saving ? t('loginConfig.saving') : t('loginConfig.stopAndSave')}
                </Button>
                <Button danger onClick={cancel} disabled={saving}>
                  <CloseCircleOutlined className="mr-1.5" />
                  {t('loginConfig.cancelRecord')}
                </Button>
              </Space>
            )}
          </Space>
          {logs.length > 0 && (
            <div className="mt-3">
              <RunLog items={logs} />
            </div>
          )}
        </div>
      </Modal>

      <Modal
        title={t('loginConfig.renameTitle')}
        open={!!editing}
        onOk={submitRename}
        onCancel={() => setEditing(null)}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
      >
        <Input value={editName} onChange={(e) => setEditName(e.target.value)} onPressEnter={submitRename} />
      </Modal>
    </>
  );
}
