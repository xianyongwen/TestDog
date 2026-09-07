/** 插件管理页：插件列表（上传/试运行/删除，内置保护）+ 预设 Tab（组合即开关）。 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tabs, Button, Drawer, Form, Input, Upload, Tag, Popconfirm, Empty, Badge, App, Modal, Alert, Space, Tooltip } from 'antd';
import { UploadOutlined, ApiOutlined, AppstoreOutlined, DeleteOutlined, ExperimentOutlined, DownloadOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { pluginsApi } from '../api/client';
import { downloadPluginSkillZip, downloadPluginTemplateZip } from '../utils/pluginDevBundles';
import SortableTable from '../components/SortableTable';
import PresetTab from './PresetTab';

interface PluginRow {
  id: string;
  name: string;
  version: string;
  description?: string | null;
  builtin: boolean;
  /** 动作元数据 [{name, doc?, preferFill?}]；用户插件试运行后回写。 */
  actions?: { name: string; doc?: string; label?: string }[] | null;
  presetNames: string[];
}

export default function Plugins() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [list, setList] = useState<PluginRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editRow, setEditRow] = useState<PluginRow | null>(null); // 非空 = 该插件的重新上传模式
  const [form] = Form.useForm();
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [tab, setTab] = useState('plugins');
  const [testRow, setTestRow] = useState<PluginRow | null>(null);
  const [testUrl, setTestUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  /** 展示上传/重传返回的动作 label 一致性警告（同名动作词表按预设优先级取先声明插件的元数据）。 */
  const showLabelWarnings = (warnings?: string[]) => {
    for (const w of warnings ?? []) message.warning(w, 6);
  };

  const reload = async () => {
    setLoading(true);
    try {
      setList(await pluginsApi.list());
    } catch (e) {
      message.error(String(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    reload();
  }, []);

  const beforeUpload = (f: File) => {
    if (!/\.(js|zip)$/i.test(f.name)) { message.error(t('plugins.invalidFile')); return Upload.LIST_IGNORE; }
    if (f.size > 512 * 1024) { message.error(t('plugins.tooLarge')); return Upload.LIST_IGNORE; }
    setFile(f);
    return false;
  };
  const openCreate = () => { setEditRow(null); setFile(null); form.resetFields(); setUploadOpen(true); };
  const openReupload = (r: PluginRow) => {
    setEditRow(r);
    setFile(null);
    form.setFieldsValue({ name: r.name, version: r.version, description: r.description ?? '' });
    setUploadOpen(true);
  };
  const submitUpload = async () => {
    const v = await form.validateFields();
    if (!file) { message.error(t('plugins.needFile')); return; }
    setSubmitting(true);
    try {
      if (editRow) {
        // 重新上传：只传文件与可选的版本/说明，保留 id、名称与预设关联
        const fd = new FormData();
        fd.append('file', file);
        if (v.version) fd.append('version', v.version);
        if (v.description) fd.append('description', v.description);
        const res = await pluginsApi.reupload(editRow.id, fd);
        message.success(t('plugins.reuploaded'));
        showLabelWarnings(res?.warnings);
      } else {
        const fd = new FormData();
        fd.append('name', v.name);
        fd.append('version', v.version ?? '1.0.0');
        if (v.description) fd.append('description', v.description);
        fd.append('file', file);
        const res = await pluginsApi.upload(fd);
        message.success(t('plugins.uploaded'));
        showLabelWarnings(res?.warnings);
      }
      setUploadOpen(false);
      setEditRow(null);
      setFile(null);
      form.resetFields();
      reload();
    } catch (e) {
      message.error(String(e));
    } finally {
      setSubmitting(false);
    }
  };
  const runTest = async () => {
    if (!testRow) return;
    setTesting(true);
    try {
      setTestResult(await pluginsApi.test(testRow.id, testUrl));
    } catch (e) {
      setTestResult({ error: String(e) });
    } finally {
      setTesting(false);
    }
  };
  const removePlugin = async (id: string) => {
    try {
      await pluginsApi.remove(id);
      message.success(t('plugins.deleted'));
      reload();
    } catch (e) {
      message.error(String(e));
    }
  };

  const columns = [
    { title: t('plugins.colName'), dataIndex: 'name', render: (n: string, r: PluginRow) => (
      <span className="text-ink font-medium">{n}<span className="ml-2 text-xs text-ink-3">v{r.version}</span></span>
    ) },
    { title: t('plugins.colSource'), dataIndex: 'builtin', width: 88, render: (b: boolean) => (b ? <Tag color="blue">{t('plugins.sourceBuiltin')}</Tag> : <Tag>{t('plugins.sourceUpload')}</Tag>) },
    { title: t('plugins.colPreset'), dataIndex: 'presetNames', render: (names: string[]) => names?.length
      ? <>{names.map((n) => <Tag key={n}>{n}</Tag>)}</>
      : <span className="text-ink-3">{t('plugins.noPreset')}</span> },
    { title: t('plugins.colActions'), dataIndex: 'actions', width: 110, render: (a: PluginRow['actions'], r: PluginRow) => {
      const metas = a ?? [];
      return metas.length
        ? <Tooltip title={metas.map((m) => (m.doc ? `${m.label || m.name}：${m.doc}` : m.label || m.name)).join('\n')}><Badge count={metas.length} color="var(--tk-accent)" /></Tooltip>
        : (r.builtin
          ? <span className="text-ink-3">—</span>
          : <Tooltip title={t('plugins.actionsHint')}><span className="text-ink-3">{t('plugins.actionsAfterTest')}</span></Tooltip>);
    } },
    { title: t('plugins.colDesc'), dataIndex: 'description', ellipsis: true, render: (v: string) => v || '—' },
    { title: t('common.actions'), fixed: 'right' as const, key: 'op', width: 140, render: (_: unknown, r: PluginRow) => (
      <Space>
        <Tooltip title={t('plugins.tryRun')}>
          <Button size="small" type="text" icon={<ExperimentOutlined />} onClick={() => { setTestRow(r); setTestUrl(''); setTestResult(null); }} />
        </Tooltip>
        {!r.builtin && (
          <Tooltip title={t('plugins.reupload')}>
            <Button size="small" type="text" icon={<UploadOutlined />} onClick={() => openReupload(r)} />
          </Tooltip>
        )}
        <Popconfirm title={t('plugins.deleteConfirm')} onConfirm={() => removePlugin(r.id)} disabled={r.builtin}>
          <Button size="small" type="text" danger icon={<DeleteOutlined />} disabled={r.builtin} />
        </Popconfirm>
      </Space>
    ) },
  ];

  return (
    <div className="flex h-[calc(100vh-40px)] flex-col">
      <div className="mb-4 shrink-0 flex items-center gap-2">
        <h2 className="m-0 text-xl">{t('plugins.title')}
          <Tooltip title={
            <span>
              <div>{t('plugins.securityAlert')}</div>
              <div className="mt-1">{t('plugins.securityAlertDesc')}</div>
            </span>
          }>
            <InfoCircleOutlined className="ml-2 cursor-help text-[15px] text-ink-2" />
          </Tooltip>
        </h2>
        <Button type="primary" onClick={openCreate}>
          <UploadOutlined className="mr-1.5" />{t('plugins.upload')}
        </Button>
        <Tooltip title={t('plugins.downloadTemplateTooltip')}>
          <Button type="primary" onClick={downloadPluginTemplateZip}><DownloadOutlined className="mr-1.5" />{t('plugins.downloadTemplate')}</Button>
        </Tooltip>
        <Tooltip title={t('plugins.downloadSkillTooltip')}>
          <Button type="primary" onClick={downloadPluginSkillZip}><DownloadOutlined className="mr-1.5" />{t('plugins.downloadSkill')}</Button>
        </Tooltip>
      </div>
      <Tabs className="flex-1 min-h-0 tabs-fill" activeKey={tab} onChange={setTab} items={[
        { key: 'plugins', label: <span><ApiOutlined /> {t('plugins.tabPlugins')}</span>, children: (
          <SortableTable<PluginRow> rowKey="id" loading={loading} dataSource={list} columns={columns}
            className="auto-height-table" scroll={{ x: 'max-content', y: 'max-content' }}
            locale={{ emptyText: <Empty description={t('plugins.emptyHint')} /> }} />
        ) },
        { key: 'presets', label: <span><AppstoreOutlined /> {t('plugins.tabPresets')}</span>, children: <PresetTab onChanged={reload} /> },
      ]} />
      <Drawer title={editRow ? t('plugins.reuploadTitle', { name: editRow.name }) : t('plugins.uploadTitle')} width={440} open={uploadOpen}
        onClose={() => { setUploadOpen(false); setEditRow(null); }}
        extra={<Button type="primary" loading={submitting} onClick={submitUpload}>{t('common.save')}</Button>}>
        <Form form={form} layout="vertical" initialValues={{ version: '1.0.0' }}>
          <Form.Item name="name" label={t('plugins.uploadName')} rules={[{ required: true, message: t('plugins.nameRequired') }]}>
            <Input disabled={!!editRow} placeholder={t('plugins.namePlaceholder')} />
          </Form.Item>
          <Form.Item name="version" label={t('plugins.uploadVersion')}><Input placeholder="1.0.0" /></Form.Item>
          <Form.Item name="description" label={t('plugins.uploadDesc')}>
            <Input.TextArea rows={2} placeholder={t('plugins.descPlaceholder')} />
          </Form.Item>
          <Form.Item label={t('plugins.uploadFile')} required>
            <Upload.Dragger maxCount={1} beforeUpload={beforeUpload} onRemove={() => setFile(null)} accept=".js,.zip">
              <Button icon={<UploadOutlined />}>{t('plugins.chooseFile')}</Button>
              <div className="mt-2 text-xs text-ink-3">{t('plugins.fileSizeHint')}</div>
            </Upload.Dragger>
          </Form.Item>
        </Form>
      </Drawer>
      <Modal title={t('plugins.testTitle', { name: testRow?.name ?? '' })} open={Boolean(testRow)} onCancel={() => setTestRow(null)} footer={null} width={680}>
        <Space.Compact className="w-full mb-3">
          <Input value={testUrl} onChange={(e) => setTestUrl(e.target.value)} placeholder={t('plugins.testUrlPlaceholder')} />
          <Button type="primary" loading={testing} onClick={runTest} disabled={!testUrl}>{t('plugins.testRun')}</Button>
        </Space.Compact>
        {testResult?.error && <Alert type="error" showIcon message={testResult.error} />}
        {testResult && !testResult.error && (
          <div className="text-sm leading-6">
            <div>{t('plugins.detectHit')}：<b>{String(testResult.detectHit)}</b>（{testResult.detectedPlugins?.join('、') || t('common.none')}）；{t('plugins.candidatesCount')}：<b>{testResult.candidatesCount}</b></div>
            <div className="my-1">{t('plugins.actionsLabel')}：{testResult.actions?.length
              ? testResult.actions.map((x: any) => <Tag key={x.id} color="blue">{x.id}: {(x.actions ?? []).map((m: any) => (typeof m === 'string' ? m : m.label || m.name)).join('、')}</Tag>)
              : <span className="text-ink-3">{t('common.none')}</span>}</div>
            <pre className="m-0 p-2 bg-subtle rounded text-xs max-h-64 overflow-auto whitespace-pre-wrap">{(testResult.log ?? []).join('\n') || t('plugins.noSampleLog')}</pre>
          </div>
        )}
      </Modal>
    </div>
  );
}
