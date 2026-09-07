import { useEffect, useState, useRef, useCallback } from 'react';
import { Button, Card, Descriptions, Dropdown, Image, Popconfirm, Space, Switch, Tabs, Tag, App, Select } from 'antd';
import SortableTable from '../components/SortableTable';
import { ArrowLeftOutlined, ThunderboltOutlined, VideoCameraOutlined, PlayCircleOutlined, StopOutlined, SaveOutlined, DeleteOutlined, DownloadOutlined, CheckOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { http, apiBase } from '../api/client';
import { ws } from '../api/ws';
import type { TestStep } from '@shared/testScript';
import StepsTable from '../components/StepsTable';
import RunLog, { type LogItem } from '../components/RunLog';
import { RunStatusTag, StepStatusTag, ActionTag } from '../components/StatusTag';
import { fmtToken, type TokenUsage } from '../utils/token';
import CacheRatePie from '../components/CacheRatePie';
import { exportRunJSON, exportRunExcel } from '../utils/exportRun';

interface Script { id: string; version: number; steps: TestStep[]; rawCode?: string; createdAt: string }
interface StepResult { stepIndex: number; action: string; status: string; message?: string; durationMs?: number; healed: boolean; healedLocator?: { strategy: string; value: string; role?: string; name?: string } | null; screenshot?: string; consoleLog?: string; networkLog?: string }
interface Run { id: string; status: string; startedAt?: string; finishedAt?: string; logs?: string; stepResults?: StepResult[]; scriptId?: string; meta?: { usage?: TokenUsage; stepUsages?: Record<number, TokenUsage> } | null }
interface CaseDetail {
  id: string; title: string; description?: string; naturalLanguage?: string; status: string;
  project: { id: string; name: string; baseUrl?: string; envVars?: { key: string }[]; loginConfigs?: { id: string; name: string; isDefault: boolean }[] };
  scripts: Script[];
  runs: Run[];
}

export default function TestCaseDetail() {
  const { caseId } = useParams();
  const { t } = useTranslation();
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const { message } = App.useApp();
  const [data, setData] = useState<CaseDetail | null>(null);
  const [selScriptId, setSelScriptId] = useState<string | null>(null);
  const [editSteps, setEditSteps] = useState<TestStep[]>([]);
  const [selRunId, setSelRunId] = useState<string | null>(null);
  const [runDetail, setRunDetail] = useState<Run | null>(null);
  const [headless, setHeadless] = useState(false);
  const [loginConfigId, setLoginConfigId] = useState<string | undefined>(undefined);
  const loginInitedRef = useRef(false);
  const [running, setRunning] = useState(false);
  const [logItems, setLogItems] = useState<LogItem[]>([]);
  const [tab, setTab] = useState('scripts');
  const jobIdRef = useRef<string | null>(null);
  const selRunIdRef = useRef<string | null>(null);
  selRunIdRef.current = selRunId;

  const load = useCallback(async () => {
    if (!caseId) return;
    const d = await http.get<CaseDetail>(`/api/test-cases/${caseId}`);
    setData(d);
    setSelScriptId((cur) => {
      if (cur && d.scripts.some((s) => s.id === cur)) return cur;
      return d.scripts.length ? d.scripts[0].id : null;
    });
  }, [caseId]);

  useEffect(() => {
    load();
  }, [load]);

  // 查看明细：用例接口的 runs 不含 stepResults/logs，需按需取单次运行详情
  const selectRun = useCallback(
    async (runId: string) => {
      setSelRunId(runId);
      setRunDetail(null);
      try {
        setRunDetail(await http.get<Run>(`/api/runs/${runId}`));
      } catch (e) {
        message.error(t('caseDetail.detailLoadFailed', { err: String(e) }));
      }
    },
    [message, t],
  );

  const deleteRun = useCallback(
    async (runId: string) => {
      try {
        await http.del(`/api/runs/${runId}`);
        message.success(t('caseDetail.deletedRun'));
        if (selRunIdRef.current === runId) {
          setSelRunId(null);
          setRunDetail(null);
        }
        load();
      } catch (e) {
        message.error(t('caseDetail.deleteFailed', { err: String(e) }));
      }
    },
    [load, message, t],
  );

  const clearRuns = useCallback(async () => {
    if (!caseId) return;
    try {
      const res = await http.del<{ count: number }>(`/api/test-cases/${caseId}/runs`);
      message.success(t('caseDetail.clearedRuns', { count: res?.count ?? 0 }));
      setSelRunId(null);
      setRunDetail(null);
      load();
    } catch (e) {
      message.error(t('caseDetail.clearFailed', { err: String(e) }));
    }
  }, [caseId, load, message, t]);

  // 深链：/cases/:id?tab=runs&runId=xxx（来自运行记录页「查看」）
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    const r = searchParams.get('runId');
    if (tabParam) setTab(tabParam);
    if (r) selectRun(r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 选中脚本变化时同步可编辑步骤
  useEffect(() => {
    const s = data?.scripts.find((x) => x.id === selScriptId);
    setEditSteps(s ? s.steps : []);
  }, [selScriptId, data]);

  // 首次加载后默认选中项目的默认登录配置（仅初始化一次，允许用户清空）
  useEffect(() => {
    if (data && !loginInitedRef.current) {
      loginInitedRef.current = true;
      setLoginConfigId(data.project.loginConfigs?.find((c) => c.isDefault)?.id);
    }
  }, [data]);

  // WS：实时接收运行进度（用 ref 读最新 jobId）
  useEffect(() => {
    return ws.on((msg) => {
      if (!jobIdRef.current || msg.jobId !== jobIdRef.current) return;
      if (msg.type === 'run:step') {
        const su = (msg as any).usage as TokenUsage | undefined;
        const parts: string[] = [];
        if (msg.message) parts.push(String(msg.message));
        if (su) parts.push(t('caseDetail.usageText', { total: fmtToken(su.totalTokens), cached: fmtToken(su.cachedTokens) }));
        setLogItems((prev) => [
          ...prev,
          {
            color: msg.status === 'PASSED' ? 'green' : msg.status === 'FAILED' ? 'red' : 'blue',
            title: (
              <span>
                {t('caseDetail.stepLabel', { index: msg.index })} <ActionTag action={(msg as any).action ?? ''} />{' '}
                <Tag color={(msg as any).healed ? 'purple' : 'default'}>{(msg as any).healed ? t('caseDetail.healed') : msg.status}</Tag>
              </span>
            ),
            desc: parts.length ? parts.join(' · ') : undefined,
          },
        ]);
      } else if (msg.type === 'run:done') {
        setRunning(false);
        const u = (msg as any).usage as TokenUsage | undefined;
        setLogItems((prev) => [
          ...prev,
          {
            color: msg.status === 'PASSED' ? 'green' : 'red',
            title: <strong>{t('caseDetail.runEnd', { status: String(msg.status) })}</strong>,
            desc: u ? (
              <>
                {t('caseDetail.usageText', { total: fmtToken(u.totalTokens), cached: fmtToken(u.cachedTokens) })}
                <CacheRatePie cached={u.cachedTokens} input={u.inputTokens} total={u.totalTokens} />
              </>
            ) : undefined,
          },
        ]);
        load();
        // 若正在查看本次运行的明细，同步刷新
        if (msg.runId && selRunIdRef.current === msg.runId) selectRun(String(msg.runId));
      }
    });
  }, [load, selectRun, t]);

  const selectScript = (s: Script) => setSelScriptId(s.id);

  const saveAsVersion = async () => {
    if (!caseId) return;
    await http.post(`/api/test-cases/${caseId}/scripts`, { steps: editSteps });
    message.success(t('caseDetail.savedNewVersion'));
    load();
  };

  const save = async () => {
    if (!selScriptId) return;
    await http.put(`/api/scripts/${selScriptId}`, { steps: editSteps });
    message.success(t('caseDetail.saved'));
    load();
  };

  // 导出当前脚本为 .testcase 文件（JSON），可在「用例列表」页导入回传。
  const exportScript = () => {
    if (!selScript) return;
    const payload = {
      format: 'testcase',
      version: 1,
      title: data?.title ?? t('projectCases.unnamedCase'),
      description: data?.description ?? '',
      naturalLanguage: data?.naturalLanguage ?? '',
      steps: editSteps,
      rawCode: selScript.rawCode ?? '',
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = (data?.title ?? 'case').replace(/[\\/:*?"<>|]/g, '_');
    a.download = `${safeName}-v${selScript.version}.testcase`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    message.success(t('caseDetail.exportedTestcase'));
  };

  const runSteps = async (steps: TestStep[], scriptId?: string) => {
    if (!caseId || !steps.length) {
      message.warning(t('caseDetail.noRunnableSteps'));
      return;
    }
    setRunning(true);
    setLogItems([]);
    setTab('runs');
    setSelRunId(null);
    setRunDetail(null);
    const { jobId } = await http.post<{ jobId: string }>('/api/runs', { testCaseId: caseId, scriptId, steps, selfHeal: true, headless, loginConfigId });
    jobIdRef.current = jobId;
  };

  if (!data) return <div>{t('caseDetail.loading')}</div>;
  const selScript = data.scripts.find((s) => s.id === selScriptId);

  const scriptCols: ColumnsType<Script> = [
    { title: t('common.version'), dataIndex: 'version', width: 70, render: (v) => <Tag color="blue">v{v}</Tag> },
    { title: t('common.stepCount'), width: 60, render: (_v, r) => r.steps.length },
    { title: t('common.createdAt'), dataIndex: 'createdAt', width: 136, render: (v) => new Date(v as string).toLocaleString() },
    {
      title: t('common.actions'),
      width: 88,
      render: (_v, r) => (
        <Space>
          <Button size="small" type="primary" ghost icon={<PlayCircleOutlined />} onClick={() => runSteps(r.steps, r.id)}>{t('common.run')}</Button>
        </Space>
      ),
    },
  ];

  const runCols: ColumnsType<Run> = [
    { title: t('common.status'), dataIndex: 'status', width: 72, render: (v) => <RunStatusTag status={v} /> },
    {
      title: t('common.version'),
      width: 64,
      render: (_v, r) => {
        const v = data.scripts.find((s) => s.id === r.scriptId)?.version;
        return v != null ? <Tag color="blue">v{v}</Tag> : '-';
      },
    },
    {
      title: t('common.tokenUsage'),
      width: 120,
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
    { title: t('common.startTime'), dataIndex: 'startedAt', width: 88, render: (v) => (v ? new Date(v as string).toLocaleString() : '-') },
    { title: t('common.endTime'), dataIndex: 'finishedAt', width: 88, render: (v) => (v ? new Date(v as string).toLocaleString() : '-') },
    {
      title: t('common.actions'),
      width: 44,
      render: (_v, r) => (
        <span onClick={(e) => e.stopPropagation()}>
          <Popconfirm title={t('caseDetail.deleteRunConfirm')} onConfirm={() => deleteRun(r.id)}>
            <Button size="small" type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </span>
      ),
    },
  ];

  return (
    // 整页定高不撑开外层滚动：剩余高度全部给 Tabs 内容区，表格在各自区域内滚
    <div className="flex h-[calc(100vh-40px)] flex-col">
      <div className="mb-4 flex shrink-0 items-center gap-2">
        <Button icon={<ArrowLeftOutlined />} onClick={() => nav(`/projects/${data.project.id}`)}></Button>
        <h2 className="m-0 text-xl">{data.title}</h2>
      </div>

      <Card className="mb-4 shrink-0">
        <Descriptions size="small" column={2}>
          <Descriptions.Item label={t('caseDetail.project')}>{data.project.name}</Descriptions.Item>
          <Descriptions.Item label={t('caseDetail.baseUrl')}>{data.project.baseUrl || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('caseDetail.description')} span={2}>{data.description || '-'}</Descriptions.Item>
        </Descriptions>
        <Space className="mt-3" wrap>
          <Button type="primary" onClick={() => nav(`/cases/${caseId}/generate`)}><ThunderboltOutlined className="mr-1.5" />{t('caseDetail.aiGenerate')}</Button>
          <Button type="primary" onClick={() => nav(`/cases/${caseId}/record`)}><VideoCameraOutlined className="mr-1.5" />{t('caseDetail.manualRecord')}</Button>
          <Button type="primary" disabled={!selScript} onClick={() => selScript && runSteps(selScript.steps, selScript.id)}><PlayCircleOutlined className="mr-1.5" />{t('caseDetail.runCurrent')}</Button>
          
          <span>
            <Switch checked={headless} onChange={setHeadless} /> {t('caseDetail.headless')}
          </span>
          <span>
            {t('generate.loginConfig')}
            <Select
              size="small"
              allowClear
              placeholder={t('common.none')}
              value={loginConfigId}
              onChange={setLoginConfigId}
              className="!ml-1.5 !w-[160px]"
              options={data.project.loginConfigs?.map((c) => ({ value: c.id, label: c.name + (c.isDefault ? t('common.defaultTag') : '') }))}
            />
          </span>
        </Space>
      </Card>

      {running && (
        <Card
          size="small"
          className="mb-4 shrink-0"
          title={
            <span className="inline-flex items-center gap-3">
              <span>{t('caseDetail.runProgress')}</span>
              <Button size="small" danger icon={<StopOutlined />} onClick={() => jobIdRef.current && ws.cancel(jobIdRef.current)}>
                {t('caseDetail.stopRun')}
              </Button>
            </span>
          }
        >
          <RunLog items={logItems} />
        </Card>
      )}

      <Tabs
        className="flex-1 min-h-0 tabs-fill"
        activeKey={tab}
        onChange={setTab}
        items={[
          {
            key: 'scripts',
            label: t('caseDetail.scriptsTab'),
            children: (
              <div className="flex h-full min-h-0 gap-4">
                <div className="flex w-[360px] shrink-0 flex-col min-h-0">
                  <SortableTable
                    rowKey="id"
                    size="small"
                    className="auto-height-table"
                    scroll={{ y: 'max-content' }}
                    dataSource={data.scripts}
                    columns={scriptCols}
                    onRow={(r) => ({ onClick: () => selectScript(r) })}
                    rowClassName={(r) => (r.id === selScriptId ? 'ant-table-row-selected' : '')}
                  />
                </div>
                <div className="flex min-w-[600px] flex-1 flex-col min-h-0">
                  {selScript ? (
                    <>
                      <Space className="mb-2 shrink-0" wrap>
                        <div className="flex h-8 items-center justify-center rounded-md border border-accent bg-accent-subtle px-2.5 text-accent">v{selScript.version}</div>
                        <Button icon={<SaveOutlined />} onClick={save}>{t('common.save')}</Button>
                        <Button icon={<SaveOutlined />} onClick={saveAsVersion}>{t('caseDetail.saveAsVersion')}</Button>
                        <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => runSteps(editSteps, selScript.id)}>{t('common.run')}</Button>
                        <Button icon={<DownloadOutlined />} onClick={exportScript}>{t('common.export')}</Button>
                      </Space>
                      <StepsTable fill steps={editSteps} onChange={setEditSteps} envVarKeys={data.project.envVars?.map((v) => v.key)} pickStartUrl={data.project.baseUrl} pickLoginConfigId={loginConfigId} pickLoginConfigs={data.project.loginConfigs} pickProjectId={data.project.id} projectId={data.project.id} />
                    </>
                  ) : (
                    <div className="text-ink-2">{t('caseDetail.noScriptHint')}</div>
                  )}
                </div>
              </div>
            ),
          },
          {
            key: 'runs',
            label: t('caseDetail.runsTab'),
            children: (
              <div className="flex h-full min-h-0 gap-4">
                <div className="flex w-[480px] shrink-0 flex-col min-h-0">
                  <Space className="mb-2 shrink-0" wrap>
                    <span className="text-ink-2">{t('common.total', { count: data.runs.length })}</span>
                    <Popconfirm
                      title={t('caseDetail.clearConfirm')}
                      description={t('caseDetail.irreversible')}
                      okText={t('caseDetail.clear')}
                      okButtonProps={{ danger: true }}
                      cancelText={t('common.cancel')}
                      onConfirm={clearRuns}
                    >
                      <Button size="small" danger icon={<DeleteOutlined />} disabled={!data.runs.length}>
                        {t('caseDetail.clearRecords')}
                      </Button>
                    </Popconfirm>
                  </Space>
                  <SortableTable
                    rowKey="id"
                    size="small"
                    className="auto-height-table"
                    scroll={{ y: 'max-content' }}
                    dataSource={data.runs}
                    columns={runCols}
                    onRow={(r) => ({ onClick: () => selectRun(r.id) })}
                    rowClassName={(r) => (r.id === selRunId ? 'ant-table-row-selected' : '')}
                  />
                </div>
                <div className="flex min-w-[500px] flex-1 flex-col min-h-0">
                  {selRunId ? (
                    runDetail ? (
                      <RunDetail
                        key={runDetail.id}
                        runId={runDetail.id}
                        caseTitle={data.title}
                        steps={runDetail.stepResults ?? []}
                        stepUsages={runDetail.meta?.stepUsages}
                        onAdopted={load}
                      />
                    ) : (
                      <div className="text-ink-2">{t('caseDetail.detailLoading')}</div>
                    )
                  ) : (
                    <div className="text-ink-2">{t('caseDetail.selectRunHint')}</div>
                  )}
                </div>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

function RunDetail({ runId, caseTitle, steps, stepUsages, onAdopted }: { runId: string; caseTitle: string; steps: StepResult[]; stepUsages?: Record<number, TokenUsage>; onAdopted: () => void }) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [adopted, setAdopted] = useState<Set<number>>(new Set());
  const [adopting, setAdopting] = useState<number | null>(null);

  // 采纳该自愈步骤的新定位器：覆盖回原脚本对应步骤（原地更新，不新增版本）。
  const adopt = async (stepIndex: number) => {
    setAdopting(stepIndex);
    try {
      const res = await http.post<{ ok: boolean; scriptId: string; version: number; stepIndex: number }>(`/api/runs/${runId}/adopt`, { stepIndex });
      message.success(t('caseDetail.adoptSuccess', { version: res.version, step: stepIndex + 1 }));
      setAdopted((prev) => new Set(prev).add(stepIndex));
      onAdopted();
    } catch (e) {
      message.error(t('caseDetail.adoptFailed', { err: String(e) }));
    } finally {
      setAdopting(null);
    }
  };

  // 仅当存在失败步骤时才渲染展开列，避免全量通过时左侧多出一列空列。
  const hasFailed = steps.some((s) => s.status === 'FAILED');

  return (
    // 撑满运行记录 tab 右侧列：导出按钮行固定，明细表内部滚动（表头固定）
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex shrink-0 justify-end">
        <Dropdown
          menu={{
            items: [
              { key: 'json', label: 'JSON' },
              { key: 'xlsx', label: 'Excel' },
            ],
            onClick: async ({ key }) => {
              const input = { runId, caseTitle, steps, stepUsages };
              try {
                if (key === 'json') exportRunJSON(input);
                else await exportRunExcel(input);
                message.success(t('caseDetail.exported'));
              } catch (e) {
                message.error(t('caseDetail.exportFailed', { err: String(e) }));
              }
            },
          }}
        >
          <Button size="small" icon={<DownloadOutlined />} disabled={!steps.length}>
            {t('common.export')}
          </Button>
        </Dropdown>
      </div>
      <SortableTable
        rowKey="stepIndex"
        size="small"
        className="auto-height-table"
        scroll={{ x: 'max-content', y: 'max-content' }}
        dataSource={steps}
        columns={[
          { title: '#', dataIndex: 'stepIndex', width: 48, render: (v) => v + 1 },
          { title: t('caseDetail.action'), dataIndex: 'action', width: 100, render: (v) => <ActionTag action={v} /> },
          { title: t('common.status'), dataIndex: 'status', width: 100, render: (v) => <StepStatusTag status={v} /> },
          { title: t('caseDetail.healed'), dataIndex: 'healed', width: 70, render: (v) => (v ? <Tag color="green">{t('caseDetail.healedYes')}</Tag> : '-') },
          { title: t('caseDetail.duration'), dataIndex: 'durationMs', width: 90, render: (v) => (v ? `${v}ms` : '-') },
          {
            title: t('common.tokenUsage'),
            width: 150,
            render: (_v, r) => {
              const u = stepUsages?.[r.stepIndex];
              return u ? (
                <span>
                  {fmtToken(u.totalTokens)}
                  {u.cachedTokens ? t('runs.usageText', { cached: fmtToken(u.cachedTokens) }) : ''}
                  <CacheRatePie cached={u.cachedTokens} input={u.inputTokens} total={u.totalTokens} />
                </span>
              ) : (
                '-'
              );
            },
          },
          { title: t('caseDetail.info'), dataIndex: 'message' },
          {
            title: t('common.actions'),
            width: 90,
            render: (_v, r) =>
              r.healed && r.healedLocator ? (
                <Button
                  size="small"
                  type="link"
                  icon={<CheckOutlined />}
                  loading={adopting === r.stepIndex}
                  disabled={adopted.has(r.stepIndex)}
                  onClick={(e) => {
                    e.stopPropagation();
                    adopt(r.stepIndex);
                  }}
                >
                  {adopted.has(r.stepIndex) ? t('caseDetail.adopted') : t('caseDetail.adopt')}
                </Button>
              ) : null,
          },
        ]}
        expandable={hasFailed ? {
          expandedRowRender: (r) => (
            <div className="flex flex-wrap gap-4">
              {r.screenshot ? (
                <div className="min-w-[200px]">
                  <div className="mb-1 font-semibold">{t('caseDetail.screenshot')}</div>
                  <Image src={`${apiBase}/api/screenshots/${r.screenshot}`} width={280} className="max-h-[400px] border border-line-subtle object-contain" />
                </div>
              ) : null}
              {r.consoleLog ? (
                <div className="max-w-[400px] min-w-[240px]">
                  <div className="mb-1 font-semibold">Console</div>
                  <pre className="m-0 max-h-[300px] overflow-auto rounded bg-subtle p-2 text-[11px] whitespace-pre-wrap">
                    {formatLogLines(r.consoleLog)}
                  </pre>
                </div>
              ) : null}
              {r.networkLog ? (
                <div className="max-w-[440px] min-w-[280px]">
                  <div className="mb-1 font-semibold">Network</div>
                  <pre className="m-0 max-h-[300px] overflow-auto rounded bg-subtle p-2 text-[11px] whitespace-pre-wrap">
                    {formatLogLines(r.networkLog)}
                  </pre>
                </div>
              ) : null}
              {!r.screenshot && !r.consoleLog && !r.networkLog ? (
                <div className="text-ink-2">{t('caseDetail.noExtraData')}</div>
              ) : null}
            </div>
          ),
          rowExpandable: (r) => r.status === 'FAILED',
        } : undefined}
      />
    </div>
  );
}

function formatLogLines(json: string): string {
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return json;
    return arr.map((e: any) => {
      if (e.type !== undefined && e.text !== undefined) return `[${e.type}] ${e.text}`;
      if (e.method && e.url) return `${e.method} ${e.status} ${e.url}`;
      return JSON.stringify(e);
    }).join('\n');
  } catch {
    return json;
  }
}
