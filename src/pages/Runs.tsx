import { useEffect, useState } from 'react';
import { Button, Popconfirm, App } from 'antd';
import SortableTable from '../components/SortableTable';
import { rowClickNav } from '../utils/rowNav';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { http } from '../api/client';
import { RunStatusTag } from '../components/StatusTag';
import { DeleteOutlined, RedoOutlined } from '@ant-design/icons';
import { fmtToken, type TokenUsage } from '../utils/token';
import CacheRatePie from '../components/CacheRatePie';

interface RunItem {
  id: string;
  status: string;
  startedAt?: string;
  finishedAt?: string;
  testCase: { id: string; title: string };
  meta?: { usage?: TokenUsage } | null;
}

export default function Runs() {
  const { t } = useTranslation();
  const [items, setItems] = useState<RunItem[]>([]);
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();
  const { message } = App.useApp();

  const load = async () => {
    setLoading(true);
    try {
      setItems(await http.get<RunItem[]>('/api/runs'));
    } catch (e) {
      message.error(t('runs.loadFailed', { err: String(e) }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const clearAll = async () => {
    try {
      const res = await http.del<{ count: number }>('/api/runs');
      message.success(t('runs.cleared', { count: res?.count ?? 0 }));
      load();
    } catch (e) {
      message.error(t('runs.clearFailed', { err: String(e) }));
    }
  };

  const columns: ColumnsType<RunItem> = [
    { title: t('common.status'), dataIndex: 'status', width: 100, render: (v) => <RunStatusTag status={v} /> },
    // 标题列用实色 textPrimary：antd 表体默认色是 colorTextBase 88% 透明度，观感偏灰
    { title: t('runs.case'), render: (_v, r) => <span className="text-ink">{r.testCase.title}</span> },
    {
      title: t('common.tokenUsage'),
      width: 170,
      render: (_v, r) => {
        const u = r.meta?.usage;
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
    { title: t('common.startTime'), dataIndex: 'startedAt', render: (v) => (v ? new Date(v as string).toLocaleString() : '-') },
    { title: t('common.endTime'), dataIndex: 'finishedAt', render: (v) => (v ? new Date(v as string).toLocaleString() : '-') },
    { title: t('common.actions'), width: 120, render: (_v, r) => <Button size="small" onClick={() => nav(`/cases/${r.testCase.id}?tab=runs&runId=${r.id}`)}>{t('common.viewDetail')}</Button> },
  ];

  return (
    <div className="flex h-[calc(100vh-40px)] flex-col">
      <div className="mb-4 shrink-0 flex items-center gap-2">
        <h2 className="m-0 text-xl">{t('runs.title')}</h2>
        <Button onClick={load}><RedoOutlined /></Button>
        <Popconfirm title={t('runs.clearAllConfirm')} onConfirm={clearAll} disabled={!items.length}>
          <Button disabled={!items.length}>
            <DeleteOutlined className="mr-1.5" />{t('common.clearAll')}
          </Button>
        </Popconfirm>
      </div>
      <SortableTable rowKey="id" loading={loading} dataSource={items} columns={columns} className="auto-height-table" scroll={{ x: 'max-content', y: 'max-content' }} onRow={(r) => ({ className: 'cursor-pointer', onClick: rowClickNav(nav, `/cases/${r.testCase.id}`) })} />
    </div>
  );
}
