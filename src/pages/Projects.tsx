import { useEffect, useState } from 'react';
import { Button, Form, Input, Modal, Popconfirm, Select, Space, Tooltip, App } from 'antd';
import SortableTable from '../components/SortableTable';
import { rowClickNav } from '../utils/rowNav';
import { PlusOutlined, DeleteOutlined, FolderOpenOutlined, EditOutlined, KeyOutlined, LockOutlined, DownloadOutlined, DesktopOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { http, pluginsApi } from '../api/client';
import { isValidVarName } from '@shared/envVars';
import type { ViewportSize } from '@shared/viewport';
import LoginConfigManager from '../components/LoginConfigManager';
import ViewportConfigModal from '../components/ViewportConfigModal';
import { downloadSkillZip } from '../utils/skillBundle';
import { downloadRule } from '../utils/ruleDownload';

interface Project {
  id: string;
  name: string;
  baseUrl?: string;
  presetId?: string | null;
  /** 项目级浏览器窗口尺寸（运行/生成脚本时生效）；null = 默认 1920×1080。 */
  viewport?: ViewportSize | null;
  createdAt: string;
  _count?: { testCases: number };
}

export default function Projects() {
  const { t } = useTranslation();
  const [items, setItems] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const [editing, setEditing] = useState<Project | null>(null);
  const [editForm] = Form.useForm();
  const [envProject, setEnvProject] = useState<Project | null>(null);
  const [envVars, setEnvVars] = useState<{ key: string; value: string }[]>([]);
  const [envLoading, setEnvLoading] = useState(false);
  const [envSaving, setEnvSaving] = useState(false);
  const [loginProject, setLoginProject] = useState<Project | null>(null);
  const [viewportProject, setViewportProject] = useState<Project | null>(null);
  const nav = useNavigate();
  const { message } = App.useApp();

  const load = async () => {
    setLoading(true);
    try {
      setItems(await http.get<Project[]>('/api/projects'));
    } catch (e) {
      message.error(t('projects.loadFailed', { err: String(e) }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // 预设列表（组件插件组合，唯一注入编排入口）
  const [presets, setPresets] = useState<{ id: string; name: string; builtin: boolean }[]>([]);
  const loadPresets = async () => {
    try {
      setPresets((await pluginsApi.presets()).map((p: any) => ({ id: p.id, name: p.name, builtin: p.builtin })));
    } catch {
      /* 插件模块不可用时下拉为空 */
    }
  };
  useEffect(() => {
    loadPresets();
  }, []);

  const submit = async () => {
    const v = await form.validateFields();
    await http.post('/api/projects', { name: v.name, baseUrl: v.baseUrl, ...(v.presetId ? { presetId: v.presetId } : {}) });
    message.success(t('projects.created'));
    setOpen(false);
    form.resetFields();
    load();
  };

  const remove = async (id: string) => {
    await http.del(`/api/projects/${id}`);
    message.success(t('projects.deleted'));
    load();
  };

  const openEdit = (r: Project) => {
    setEditing(r);
    editForm.setFieldsValue({ name: r.name, baseUrl: r.baseUrl, presetId: r.presetId ?? undefined });
  };

  const submitEdit = async () => {
    if (!editing) return;
    const v = await editForm.validateFields();
    await http.put(`/api/projects/${editing.id}`, {
      name: v.name,
      baseUrl: v.baseUrl,
      presetId: v.presetId ?? null, // 显式传 null = 清除关联（回落全部插件注入）
    });
    message.success(t('projects.updated'));
    setEditing(null);
    load();
  };

  const openEnv = async (r: Project) => {
    setEnvProject(r);
    setEnvVars([]);
    setEnvLoading(true);
    try {
      const list = await http.get<{ key: string; value: string }[]>(`/api/projects/${r.id}/env-vars`);
      setEnvVars(list.map((v) => ({ key: v.key, value: v.value })));
    } catch (e) {
      message.error(t('projects.envLoadFailed', { err: String(e) }));
    } finally {
      setEnvLoading(false);
    }
  };

  // 环境变量键校验：非空、合法字符（与 {{}} 识别规则一致）、不重复。任一行不合法则禁用保存。
  const envRowErrors: (string | undefined)[] = envVars.map((v, i) => {
    if (!v.key) return t('projects.varNameRequired');
    if (!isValidVarName(v.key)) return t('projects.varNameInvalid');
    if (envVars.some((x, j) => j !== i && x.key === v.key)) return t('projects.varNameDuplicate');
    return undefined;
  });
  const envHasError = envRowErrors.some(Boolean);

  const saveEnv = async () => {
    if (!envProject || envHasError) return;
    setEnvSaving(true);
    try {
      await http.put(`/api/projects/${envProject.id}/env-vars`, { vars: envVars });
      message.success(t('projects.envSaved'));
      setEnvProject(null);
    } catch (e) {
      message.error(t('projects.saveFailed', { err: String(e) }));
    } finally {
      setEnvSaving(false);
    }
  };

  const updateEnvRow = (i: number, patch: Partial<{ key: string; value: string }>) =>
    setEnvVars((prev) => prev.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));
  const addEnvRow = () => setEnvVars((prev) => [...prev, { key: '', value: '' }]);
  const removeEnvRow = (i: number) => setEnvVars((prev) => prev.filter((_, idx) => idx !== i));

  const columns: ColumnsType<Project> = [
    // 标题列用实色 textPrimary：antd 表体默认色是 colorTextBase 88% 透明度，观感偏灰
    { title: t('common.projectName'), dataIndex: 'name', render: (n) => <span className="text-ink">{n}</span> },
    { title: t('common.baseUrl'), dataIndex: 'baseUrl' },
    { title: t('common.caseCount'), dataIndex: ['_count', 'testCases'], width: 90 },
    { title: t('common.createdAt'), dataIndex: 'createdAt', width: 180, render: (v) => new Date(v as string).toLocaleString() },
    {
      title: t('common.actions'),
      width: 235,
      render: (_v, r) => (
        <Space>
          <Tooltip title={t('projects.envVars')}>
            <Button size="small" type="text" icon={<KeyOutlined />} onClick={() => openEnv(r)} />
          </Tooltip>
          <Tooltip title={t('projects.loginConfig')}>
            <Button size="small" type="text" icon={<LockOutlined />} onClick={() => setLoginProject(r)} />
          </Tooltip>
          <Tooltip title={t('projects.viewport')}>
            <Button size="small" type="text" icon={<DesktopOutlined />} onClick={() => setViewportProject(r)} />
          </Tooltip>
          <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Popconfirm title={t('projects.deleteConfirm')} onConfirm={() => remove(r.id)}>
            <Button size="small" type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="flex h-[calc(100vh-40px)] flex-col">
      <div className="mb-4 shrink-0 flex items-center gap-2">
        <h2 className="m-0 text-xl">{t('projects.title')}</h2>
        <Button type="primary" onClick={() => setOpen(true)}><PlusOutlined className="mr-1.5" />{t('projects.newProject')}</Button>
        <Tooltip title={t('projects.downloadSkillTooltip')}>
          <Button type="primary" onClick={downloadSkillZip}><DownloadOutlined className="mr-1.5" />{t('projects.downloadSkill')}</Button>
        </Tooltip>
        <Tooltip title={t('projects.downloadRuleTooltip')}>
          <Button type="primary" onClick={downloadRule}><DownloadOutlined className="mr-1.5" />{t('projects.downloadRule')}</Button>
        </Tooltip>
      </div>
      <SortableTable
        rowKey="id"
        loading={loading}
        dataSource={items}
        columns={columns}
        className="auto-height-table"
        scroll={{ x: 'max-content', y: 'max-content' }}
        onRow={(r) => ({ className: 'cursor-pointer', onClick: rowClickNav(nav, `/projects/${r.id}`) })}
      />
      <Modal title={t('projects.newProject')} open={open} onOk={submit} onCancel={() => setOpen(false)} okText={t('common.create')} cancelText={t('common.cancel')}>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label={t('common.projectName')} rules={[{ required: true, message: t('projects.nameRequired') }]}>
            <Input placeholder={t('projects.namePlaceholder')} />
          </Form.Item>
          <Form.Item name="baseUrl" label={t('common.baseUrlOptional')}>
            <Input placeholder="https://example.com" />
          </Form.Item>
          <Form.Item name="presetId" label={t('plugins.presetLabel')}>
            <Select
              allowClear
              placeholder={presets.length ? t('plugins.presetPlaceholder') : t('plugins.presetEmptyHint')}
              options={presets.map((p) => ({ value: p.id, label: `${p.name}${p.builtin ? t('plugins.presetBuiltinSuffix') : ''}` }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('projects.editProject')}
        open={!!editing}
        onOk={submitEdit}
        onCancel={() => setEditing(null)}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
      >
        <Form form={editForm} layout="vertical">
          <Form.Item name="name" label={t('common.projectName')} rules={[{ required: true, message: t('projects.nameRequired') }]}>
            <Input placeholder={t('projects.namePlaceholder')} />
          </Form.Item>
          <Form.Item name="baseUrl" label={t('common.baseUrlOptional')}>
            <Input placeholder="https://example.com" />
          </Form.Item>
          <Form.Item name="presetId" label={t('plugins.presetLabel')}>
            <Select
              allowClear
              placeholder={presets.length ? t('plugins.presetPlaceholder') : t('plugins.presetEmptyHint')}
              options={presets.map((p) => ({ value: p.id, label: `${p.name}${p.builtin ? t('plugins.presetBuiltinSuffix') : ''}` }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('projects.envVarManager', { suffix: envProject ? ` · ${envProject.name}` : '' })}
        open={!!envProject}
        onOk={saveEnv}
        onCancel={() => setEnvProject(null)}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        confirmLoading={envSaving}
        okButtonProps={{ disabled: envHasError }}
        width={560}
        destroyOnClose
      >
        {envLoading ? (
          <div className="text-ink-2">{t('common.loading')}</div>
        ) : (
          <Space direction="vertical" className="w-full" size={8}>
            <div className="text-xs text-ink-2">
              {t('projects.envVarHint')}
            </div>
            {envVars.map((v, i) => (
              <div key={i}>
                <Space className="w-full" size={8}>
                  <Input
                    placeholder={t('projects.varName')}
                    className="!w-[170px]"
                    status={envRowErrors[i] ? 'error' : undefined}
                    value={v.key}
                    onChange={(e) => updateEnvRow(i, { key: e.target.value })}
                  />
                  <Input.Password
                    placeholder={t('projects.varValue')}
                    className="!w-[270px]"
                    value={v.value}
                    onChange={(e) => updateEnvRow(i, { value: e.target.value })}
                  />
                  <Button type="text" danger icon={<DeleteOutlined />} onClick={() => removeEnvRow(i)} />
                </Space>
                {envRowErrors[i] && (
                  <div className="mt-0.5 text-xs text-danger">{envRowErrors[i]}</div>
                )}
              </div>
            ))}
            <Button type="dashed" icon={<PlusOutlined />} className="w-full" onClick={addEnvRow}>
              {t('projects.addVariable')}
            </Button>
          </Space>
        )}
      </Modal>

      <LoginConfigManager project={loginProject} open={!!loginProject} onClose={() => setLoginProject(null)} />

      <ViewportConfigModal
        project={viewportProject}
        open={!!viewportProject}
        onClose={() => setViewportProject(null)}
        onSaved={load}
      />
    </div>
  );
}
