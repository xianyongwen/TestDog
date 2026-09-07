import { useEffect, useRef, useState } from 'react';
import { Button, Input, Popconfirm, Space, Tag, App, Select, Tooltip } from 'antd';
import SortableTable from '../components/SortableTable';
import { rowClickNav } from '../utils/rowNav';
import { RedoOutlined, DeleteOutlined, EyeOutlined, SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { http } from '../api/client';
import { fmtToken, type TokenUsage } from '../utils/token';
import CacheRatePie from '../components/CacheRatePie';
import GenerationRecordDetail from './GenerationRecordDetail';

interface GenLogListItem {
  id: string;
  jobId: string;
  status: 'RUNNING' | 'DONE' | 'ERROR' | 'CANCELLED' | 'PAUSED';
  nl: string;
  startUrl?: string | null;
  finishedAt?: string | null;
  createdAt: string;
  error?: string | null;
  totalUsage?: TokenUsage | null;
  testCase?: { id: string; title: string } | null;
  _count?: { steps: number };
}

const STATUS_META = (t: TFunction): Record<string, { color: string; label: string }> => ({
  RUNNING: { color: 'processing', label: t('status.run.RUNNING') },
  DONE: { color: 'success', label: t('generate.done') },
  ERROR: { color: 'error', label: t('generate.error') },
  CANCELLED: { color: 'default', label: t('generate.cancelled') },
  PAUSED: { color: 'warning', label: t('generate.pausedTitle') },
});

export default function GenerationRecords() {
  const { t } = useTranslation();
  const [items, setItems] = useState<GenLogListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<'ALL' | 'RUNNING' | 'DONE' | 'ERROR' | 'CANCELLED' | 'PAUSED'>('ALL');
  // 滚动加载：每次取一页，滚到底部追加下一页
  const PAGE_SIZE = 20;
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [detailId, setDetailId] = useState<string | null>(null);
  const nav = useNavigate();
  const { message, modal } = App.useApp();
  const statusMeta = STATUS_META(t);

  const load = async () => {
    setLoading(true);
    try {
      const url = `/api/generation-logs?limit=${PAGE_SIZE}&offset=0&status=${status}${keyword ? `&keyword=${encodeURIComponent(keyword)}` : ''}`;
      const r = await http.get<{ items: GenLogListItem[]; total: number }>(url);
      setItems(r.items);
      setTotal(r.total);
      // 过滤已选（删除/清空后）以保持 UI 一致
      setSelectedIds((prev) => prev.filter((id) => r.items.some((it) => it.id === id)));
    } catch (e) {
      message.error(t('genRecords.loadFailed', { err: String(e) }));
    } finally {
      setLoading(false);
    }
  };

  // 追加下一页：滚动到底部时调用（见下方滚动监听）
  const loadingMoreRef = useRef(false);
  const loadMore = async () => {
    if (loadingMoreRef.current || loading || items.length >= total) return;
    loadingMoreRef.current = true;
    try {
      const url = `/api/generation-logs?limit=${PAGE_SIZE}&offset=${items.length}&status=${status}${keyword ? `&keyword=${encodeURIComponent(keyword)}` : ''}`;
      const r = await http.get<{ items: GenLogListItem[]; total: number }>(url);
      setItems((prev) => [...prev, ...r.items]);
      setTotal(r.total);
    } catch (e) {
      message.error(t('genRecords.loadFailed', { err: String(e) }));
    } finally {
      loadingMoreRef.current = false;
      setTick((n) => n + 1);
    }
  };

  // loadMore 内部用 ref 防并发，不触发重渲染；tick 仅用于驱动监听器重新绑定
  const [, setTick] = useState(0);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // 表体滚到底部（≤40px）时加载下一页。滚动容器是 .ant-table-body（auto-height-table）
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const body = wrapRef.current?.querySelector('.ant-table-body');
    if (!body) return;
    const onScroll = () => {
      if ((body as HTMLElement).scrollHeight - (body as HTMLElement).scrollTop - (body as HTMLElement).clientHeight <= 40) {
        loadMore();
      }
    };
    body.addEventListener('scroll', onScroll);
    return () => body.removeEventListener('scroll', onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, total, loading]);

  const onSearch = () => {
    load();
  };

  const clearAll = async () => {
    modal.confirm({
      title: t('genRecords.clearAllConfirm'),
      content: t('genRecords.clearAllDesc'),
      okText: t('common.clearAll'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          const res = await http.del<{ count: number }>('/api/generation-logs');
          message.success(t('genRecords.cleared', { count: res?.count ?? 0 }));
          setSelectedIds([]);
          load();
        } catch (e) {
          message.error(t('genRecords.clearFailed', { err: String(e) }));
        }
      },
    });
  };

  const deleteSelected = async () => {
    if (!selectedIds.length) return;
    try {
      const res = await http.del<{ count: number }>('/api/generation-logs', { ids: selectedIds });
      message.success(t('genRecords.deletedCount', { count: res?.count ?? 0 }));
      setSelectedIds([]);
      load();
    } catch (e) {
      message.error(t('genRecords.deleteFailed', { err: String(e) }));
    }
  };

  const deleteOne = async (id: string) => {
    try {
      await http.del(`/api/generation-logs/${id}`);
      message.success(t('genRecords.deleted'));
      setSelectedIds((prev) => prev.filter((x) => x !== id));
      load();
    } catch (e) {
      message.error(t('genRecords.deleteFailed', { err: String(e) }));
    }
  };

  const columns: ColumnsType<GenLogListItem> = [
    {
      title: t('common.status'),
      dataIndex: 'status',
      width: 90,
      render: (v) => {
        const m = statusMeta[v] ?? { color: 'default', label: String(v) };
        return <Tag color={m.color}>{m.label}</Tag>;
      },
    },
    {
      title: t('runs.case'),
      width: 220,
      // 标题列用实色 textPrimary：antd 表体默认色是 colorTextBase 88% 透明度，观感偏灰
      render: (_v, r) =>
        r.testCase ? (
          <span className="text-ink">{r.testCase.title}</span>
        ) : (
          <span className="text-ink-2">—</span>
        ),
    },
    {
      title: t('genRecords.naturalLanguage'),
      dataIndex: 'nl',
      ellipsis: true,
      render: (v) => (
        <Tooltip title={v} placement="topLeft">
          <span>{v || '—'}</span>
        </Tooltip>
      ),
    },
    {
      title: t('common.stepCount'),
      width: 80,
      render: (_v, r) => r._count?.steps ?? 0,
    },
    {
      title: t('common.tokenUsage'),
      width: 220,
      render: (_v, r) => {
        const u = r.totalUsage;
        if (!u) return '-';
        return u.cachedTokens ? (
          <span>
            {fmtToken(u.totalTokens)}
            {t('runs.usageText', { cached: fmtToken(u.cachedTokens) })}
            <CacheRatePie cached={u.cachedTokens} input={u.inputTokens} total={u.totalTokens} />
          </span>
        ) : (
          fmtToken(u.totalTokens)
        );
      },
    },
    {
      title: t('common.startTime'),
      dataIndex: 'createdAt',
      width: 170,
      render: (v) => new Date(v as string).toLocaleString(),
    },
    {
      title: t('common.endTime'),
      dataIndex: 'finishedAt',
      width: 170,
      render: (v) => (v ? new Date(v as string).toLocaleString() : '-'),
    },
    {
      title: t('common.actions'),
      width: 100,
      fixed: 'right',
      render: (_v, r) => (
        <Space>
          <Tooltip title={t('common.view')}>
            <Button size="small" type="text" icon={<EyeOutlined />} onClick={() => setDetailId(r.id)}>
            </Button>
          </Tooltip>
          <Popconfirm title={t('genRecords.deleteOneConfirm')} onConfirm={() => deleteOne(r.id)}>
            <Tooltip title={t('common.delete')}>
              <Button size="small" type="text" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="flex h-[calc(100vh-40px)] flex-col">
      <div className="mb-4 flex shrink-0 flex-wrap items-center gap-2">
        <h2 className="m-0 text-xl">{t('genRecords.title')}</h2>
        <Tooltip title={t('common.refresh')}>
          <Button onClick={load} icon={<RedoOutlined />} />
        </Tooltip>
        <Input
          allowClear
          placeholder={t('genRecords.searchPlaceholder')}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onPressEnter={onSearch}
          className="!w-[260px]"
          prefix={<SearchOutlined className="text-ink-2" />}
        />
        <Select
          value={status}
          onChange={(v) => {
            setStatus(v);
          }}
          className="!w-[120px]"
          options={[
            { value: 'ALL', label: t('genRecords.allStatus') },
            ...Object.entries(statusMeta).map(([k, v]) => ({ value: k, label: v.label })),
          ]}
        />
        <Button type="primary" onClick={onSearch}>
          {t('common.search')}
        </Button>
        <Popconfirm
          title={t('genRecords.deleteSelectedConfirm', { count: selectedIds.length })}
          disabled={!selectedIds.length}
          onConfirm={deleteSelected}
        >
          <Button danger disabled={!selectedIds.length} icon={<DeleteOutlined />}>
            {t('common.deleteSelected')}
          </Button>
        </Popconfirm>
        <Popconfirm
          title={t('genRecords.clearAllConfirm')}
          disabled={!items.length && total === 0}
          onConfirm={clearAll}
        >
          <Button danger disabled={!items.length && total === 0}>
            {t('common.clearAll')}
          </Button>
        </Popconfirm>
      </div>
      <div ref={wrapRef} className="flex min-h-0 flex-1 flex-col">
        <SortableTable
          rowKey="id"
          loading={loading}
          dataSource={items}
          columns={columns}
          rowSelection={{
            selectedRowKeys: selectedIds,
            onChange: (keys) => setSelectedIds(keys as string[]),
          }}
          onRow={(r) => ({
            className: 'cursor-pointer',
            onClick: rowClickNav(nav, r.testCase ? `/cases/${r.testCase.id}` : ''),
          })}
          className="auto-height-table"
          scroll={{ x: 'max-content', y: 'max-content' }}
        />
      </div>
      <GenerationRecordDetail id={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}
