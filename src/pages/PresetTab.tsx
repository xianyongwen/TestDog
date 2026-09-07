/** 预设 Tab：preset 列表 + 新建/编辑抽屉（顺序数字越大优先级越高，末行最先注入）。preset 为唯一注入编排入口。 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Drawer, Form, Input, Select, Tag, Popconfirm, Empty, Badge, App, Space, Tooltip } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { arrayMove } from '@dnd-kit/sortable';
import type { ColumnsType } from 'antd/es/table';
import { pluginsApi } from '../api/client';
import SortableTable from '../components/SortableTable';

export interface PluginRowLite {
  id: string;
  name: string;
  /** 注册的动作名（动作元数据 [{name, doc}] 取 name）。 */
  actions: string[];
  builtin: boolean;
}

/** 抽屉内成员行：pluginId + 展示用名称/动作/内置标记快照。 */
interface MemberRow {
  pluginId: string;
  pluginName: string;
  actions: string[];
  builtin: boolean;
}

/** 动作元数据 [{name, doc}] → 动作名数组。 */
const actionNames = (a: unknown): string[] => Array.isArray(a)
  ? a.flatMap((x: any) => (typeof x?.name === 'string' ? [x.name] : []))
  : [];

export default function PresetTab({ onChanged }: { onChanged?: () => void }) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [list, setList] = useState<any[]>([]);
  const [plugins, setPlugins] = useState<PluginRowLite[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [picked, setPicked] = useState<string | undefined>();
  const [form] = Form.useForm();

  const reload = async () => {
    setLoading(true);
    try {
      const [presets, pls] = await Promise.all([pluginsApi.presets(), pluginsApi.list()]);
      setList(presets);
      setPlugins(pls.map((p: any) => ({ id: p.id, name: p.name, actions: actionNames(p.actions), builtin: !!p.builtin })));
    } catch (e) {
      message.error(String(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    reload();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setMembers([]);
    setPicked(undefined);
    form.setFieldsValue({ name: '', description: '' });
    setOpen(true);
  };
  const openEdit = (r: any) => {
    setEditing(r);
    // preset 详情 include plugin.actions/builtin：编辑时按插件记录回填动作快照与内置标记。
    // 接口 items 按 priority 升序（注入顺序，首=最高优先级）返回；编辑界面按顺序数字升序展示
    // （数字越大优先级越高，末行最先注入），故逆序回填，保存时再逆序还原。
    setMembers([...(r.items ?? [])].reverse().map((i: any) => ({
      pluginId: i.pluginId,
      pluginName: i.plugin?.name ?? '',
      actions: actionNames(i.plugin?.actions),
      builtin: !!i.plugin?.builtin,
    })));
    setPicked(undefined);
    form.setFieldsValue({ name: r.name, description: r.description ?? '' });
    setOpen(true);
  };
  // 追加到展示末行 = 最大顺序数字 = 保存后链首注入（最高优先级）：自定义插件后加入即生效，无需拖拽
  const addMember = () => {
    const p = plugins.find((x) => x.id === picked);
    if (!p || members.some((m) => m.pluginId === p.id)) return;
    setMembers([...members, { pluginId: p.id, pluginName: p.name, actions: p.actions, builtin: p.builtin }]);
    setPicked(undefined);
  };
  const submit = async () => {
    const v = await form.validateFields();
    try {
      // 展示序为注入顺序的逆序（末行数字最大=最先注入），保存前逆序还原为接口期望的注入顺序
      const ids = members.map((m) => m.pluginId).reverse();
      if (editing) await pluginsApi.updatePreset(editing.id, { name: v.name, description: v.description, pluginIds: ids });
      else await pluginsApi.createPreset({ name: v.name, description: v.description, pluginIds: ids });
      message.success(editing ? t('plugins.presetUpdated') : t('plugins.presetCreated'));
      setOpen(false);
      reload();
      onChanged?.();
    } catch (e) {
      message.error(String(e));
    }
  };
  const remove = async (id: string) => {
    try {
      await pluginsApi.removePreset(id);
      message.success(t('plugins.presetDeleted'));
      reload();
      onChanged?.();
    } catch (e) {
      message.error(String(e));
    }
  };

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex shrink-0 justify-end">
        <Button type="primary" onClick={openCreate}>
          <PlusOutlined className="mr-1.5" />{t('plugins.presetNew')}
        </Button>
      </div>
      <SortableTable
        rowKey="id"
        loading={loading}
        dataSource={list}
        locale={{ emptyText: <Empty description={t('plugins.presetEmptyList')} /> }}
        className="auto-height-table"
        scroll={{ x: 'max-content', y: 'max-content' }}
        columns={[
          // 标题列用实色 textPrimary：antd 表体默认色是 colorTextBase 88% 透明度，观感偏灰
          { title: t('plugins.presetName'), dataIndex: 'name', width: 180, render: (n) => <span className="text-ink">{n}</span> },
          { title: t('plugins.colSource'), dataIndex: 'builtin', width: 90, render: (b: boolean) => (b ? <Tag color="blue">{t('plugins.sourceBuiltin')}</Tag> : <Tag>{t('plugins.sourceCustom')}</Tag>) },
          { title: t('plugins.colMembers'), key: 'n', width: 90, render: (_, r) => <Badge count={r.items?.length ?? 0} showZero color="var(--tk-accent)" /> },
          { title: t('plugins.colProjects'), key: 'pj', width: 110, render: (_, r) => r._count?.projects ?? 0 },
          {
            title: t('common.actions'),
            key: 'op',
            width: 110,
            render: (_, r) => (
              <Space>
                <Tooltip title={t('common.edit')}>
                  <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEdit(r)} />
                </Tooltip>
                <Popconfirm title={t('plugins.presetDeleteConfirm')} onConfirm={() => remove(r.id)} disabled={r.builtin}>
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} disabled={r.builtin} />
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
      <Drawer title={editing ? t('plugins.presetEdit') : t('plugins.presetNew')} width={500} open={open} onClose={() => setOpen(false)} extra={<Button type="primary" onClick={submit}>{t('common.save')}</Button>}>
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label={t('plugins.presetName')}
            extra={editing?.builtin ? t('plugins.presetBuiltinNameTip') : undefined}
            rules={[{ required: true, message: t('plugins.presetNameRequired') }]}
          >
            <Input placeholder={t('plugins.presetNamePlaceholder')} disabled={!!editing?.builtin} />
          </Form.Item>
          <Form.Item name="description" label={t('plugins.presetDesc')}>
            <Input.TextArea rows={2} placeholder={t('plugins.presetDescPlaceholder')} />
          </Form.Item>
        </Form>
        <div className="mb-1 text-sm font-medium">{t('plugins.presetMembers')}</div>
        <Space.Compact className="w-full mb-3">
          <Select className="flex-1" placeholder={t('plugins.presetPickPlaceholder')} value={picked} onChange={setPicked} options={plugins.filter((p) => !members.some((m) => m.pluginId === p.id)).map((p) => ({ value: p.id, label: `${p.name}${t('plugins.presetActionCount', { count: p.actions.length })}` }))} />
          <Button type="primary" onClick={addMember} disabled={!picked}>
            {t('plugins.presetAdd')}
          </Button>
        </Space.Compact>
        <MemberTable members={members} lockBuiltin={!!editing?.builtin} onReorder={(next) => setMembers(next)} onRemove={(id) => setMembers(members.filter((m) => m.pluginId !== id))} />
      </Drawer>
    </div>
  );
}

/** 成员编排表：拖拽行调整优先级（顺序数字越大越先注入，末行最先注入），展示插件注册的动作清单。内置预设编辑时内置插件成员不可移除。 */
function MemberTable({ members, lockBuiltin, onReorder, onRemove }: {
  members: MemberRow[];
  /** true = 正在编辑内置预设：内置插件成员的删除按钮禁用（自定义预设成员可自由增删）。 */
  lockBuiltin: boolean;
  onReorder: (next: MemberRow[]) => void;
  onRemove: (pluginId: string) => void;
}) {
  const { t } = useTranslation();
  const columns: ColumnsType<MemberRow> = [
    { title: t('plugins.presetColOrder'), width: 64, render: (_, __, i) => i + 1 },
    { title: t('plugins.presetColPlugin'), dataIndex: 'pluginName', render: (n: string, r) => (
      <span className="inline-flex items-center gap-1.5 text-ink">
        {n}
        {r.builtin && <Tag color="blue" className="mr-0">{t('plugins.sourceBuiltin')}</Tag>}
      </span>
    ) },
    { title: t('plugins.colActions'), dataIndex: 'actions', render: (a: string[]) => a?.length
      ? <>{a.map((n) => <Tag key={n} color="blue">{n}</Tag>)}</>
      : <span className="text-ink-3">—</span> },
    {
      title: t('common.actions'),
      width: 60,
      render: (_, r) => (lockBuiltin && r.builtin
        ? // disabled 按钮不转发鼠标事件，antd Tooltip 需包一层 span 才能在悬停时显示原因
          <Tooltip title={t('plugins.presetBuiltinMemberTip')}>
            <span className="inline-flex">
              <Button size="small" type="text" danger icon={<DeleteOutlined />} disabled />
            </span>
          </Tooltip>
        : <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => onRemove(r.pluginId)} />),
    },
  ];
  return (
    <SortableTable
      sortable
      rowKey="pluginId"
      dataSource={members}
      columns={columns}
      locale={{ emptyText: <Empty description={t('plugins.presetEmpty')} image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
      onSortEnd={(activeId, overId) => {
        const from = members.findIndex((m) => m.pluginId === activeId);
        const to = members.findIndex((m) => m.pluginId === overId);
        if (from < 0 || to < 0 || from === to) return;
        onReorder(arrayMove(members, from, to));
      }}
    />
  );
}
