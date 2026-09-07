import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { Button, Form, Input, Modal, Space, Tag, App, Select, Tooltip, type ButtonProps } from 'antd';
import { ArrowLeftOutlined, PlusOutlined, DeleteOutlined, PlayCircleOutlined, EditOutlined, ImportOutlined, FolderOpenOutlined, ExportOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { arrayMove } from '@dnd-kit/sortable';
import SortableTable from '../components/SortableTable';
import { rowClickNav } from '../utils/rowNav';
import { http } from '../api/client';
import { ws } from '../api/ws';
import RunLog, { type LogItem } from '../components/RunLog';
import { RunStatusTag } from '../components/StatusTag';
import type { TestStep } from '@shared/testScript';
import { buildZip } from '../utils/zip';
import { exportBatchReport, type RunStepExport } from '../utils/exportRun';
import type { TokenUsage } from '../utils/token';

interface CaseItem {
  id: string;
  title: string;
  status: string;
  _count?: { scripts: number; runs: number };
  createdAt: string;
  scripts?: { id: string; version: number }[];
  /** 批量默认版本（用例列表「批量版本」列选择后保存）。 */
  defaultScriptId?: string | null;
}
interface ProjectInfo { id: string; name: string; baseUrl?: string; testCases: CaseItem[]; loginConfigs?: { id: string; name: string; isDefault: boolean }[] }

interface BatchCase { id: string; title: string; status: string; scriptLabel?: string; message?: string }

interface CaseFull {
  id: string;
  title: string;
  description?: string;
  naturalLanguage?: string;
  scripts: { id: string; version: number; steps: TestStep[]; rawCode?: string }[];
}

const caseStatusColor = (s: string) =>
  s === 'PASSED' ? 'green' : s === 'RUNNING' ? 'blue' : s === 'PENDING' ? 'default' : s === 'SKIPPED' ? 'default' : 'red';

/** 运行详情（GET /api/runs/:id，报告下载用）。 */
interface RunFull {
  id: string;
  status: string;
  createdAt?: string;
  logs?: string;
  stepResults?: RunStepExport[];
  script?: { steps?: TestStep[] } | null;
  meta?: { stepUsages?: Record<number, TokenUsage> } | null;
}

/** 取某用例本次运行的详情：runId 优先；run:start 消息可能早于批量 jobId 返回而漏记，按开始时间兜底取该用例最新运行。 */
async function fetchRunFull(testCaseId: string, runId: string | null | undefined, startAt: number): Promise<RunFull | undefined> {
  if (runId) return http.get<RunFull>(`/api/runs/${runId}`);
  const runs = await http.get<{ id: string; createdAt: string }[]>(`/api/test-cases/${testCaseId}/runs`);
  const hit = runs.find((r) => new Date(r.createdAt).getTime() >= startAt - 1000);
  return hit ? http.get<RunFull>(`/api/runs/${hit.id}`) : undefined;
}

// 文件/文件夹名净化：去掉路径分隔符等非法字符，保留中文。
const sanitizeName = (s: string) => s.replace(/[\\/:*?"<>|]/g, '_').trim();

// 工具栏按钮：列表有选中项时切换为纯图标（tooltip 显示名称）以节省横向空间。
function ToolbarButton({ icon, label, count, compact, ...rest }: ButtonProps & { icon: ReactNode; label: string; count?: number; compact: boolean }) {
  const title = count != null ? `${label} ${count}` : label;
  const btn = (
    <Button icon={icon} {...rest}>
      {!compact && title}
      {compact && count != null && <span className="text-xs">{count}</span>}
    </Button>
  );
  // 禁用态按钮不接收鼠标事件，包一层 span 保证 tooltip 仍能弹出
  return compact ? (
    <Tooltip title={title}>{rest.disabled ? <span className="inline-flex">{btn}</span> : btn}</Tooltip>
  ) : (
    btn
  );
}

// ---- 拖拽排序逻辑：SortableTable 组件已封装手柄列/DndContext，这里只需处理落库与回滚 ----

export default function ProjectCases() {
  const { projectId } = useParams();
  const { t } = useTranslation();
  const nav = useNavigate();
  const { message } = App.useApp();
  const [data, setData] = useState<ProjectInfo | null>(null);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const [editing, setEditing] = useState<CaseItem | null>(null);
  const [editForm] = Form.useForm();

  const caseStatusText = (s: string) =>
    ({ PENDING: t('status.run.PENDING'), RUNNING: t('status.run.RUNNING'), SKIPPED: t('status.step.SKIPPED') } as Record<string, string>)[s] ?? s;

  // 批量运行（无头）
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchCases, setBatchCases] = useState<BatchCase[]>([]);
  const [batchLogs, setBatchLogs] = useState<LogItem[]>([]);
  const batchJobRef = useRef<string | null>(null);
  const [batchDone, setBatchDone] = useState(false);
  const [reportExporting, setReportExporting] = useState(false);
  // 各用例对应的运行记录 id（来自 run:start WS 消息），报告下载用
  const batchRunIdsRef = useRef<Record<string, string>>({});
  // 本次批量开始时间（run:start 可能早于 jobId 返回而漏记，下载报告时按此时间兜底查运行记录）
  const batchStartAtRef = useRef(0);

  // 单用例运行（只显示运行记录，不含用例列表）
  const [singleOpen, setSingleOpen] = useState(false);
  const [singleRunning, setSingleRunning] = useState(false);
  const [singleDone, setSingleDone] = useState(false);
  const [singleLogs, setSingleLogs] = useState<LogItem[]>([]);
  const [singleTitle, setSingleTitle] = useState('');
  const singleJobRef = useRef<string | null>(null);
  // 报告下载用：run:start 记录的运行 id、最终状态、开始时间、用例信息
  const singleRunIdRef = useRef<string | null>(null);
  const singleStatusRef = useRef('');
  const singleStartAtRef = useRef(0);
  const singleCaseRef = useRef<{ id: string; title: string } | null>(null);

  // 批量运行选用的脚本版本：testCaseId -> scriptId（未选择的用例默认跑最新版本）
  const [selectedScripts, setSelectedScripts] = useState<Record<string, string>>({});

  // 登录配置（批量运行用）
  const [loginConfigId, setLoginConfigId] = useState<string | undefined>(undefined);
  const loginInitedRef = useRef(false);

  // 导入 .testcase
  const singleInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  // 批量导出 .testcase
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) return;
    try {
      const d = await http.get<ProjectInfo>(`/api/projects/${projectId}`);
      setData(d);
      // 回填各用例保存的批量默认版本
      setSelectedScripts(
        Object.fromEntries(
          d.testCases.map((tc) => [tc.id, tc.defaultScriptId ?? ''] as const).filter(([, v]) => v),
        ),
      );
    } catch (e) {
      message.error(t('projectCases.loadFailed', { err: String(e) }));
    }
  }, [projectId, message, t]);

  useEffect(() => {
    load();
  }, [load]);

  // 首次加载后默认选中项目的默认登录配置（仅初始化一次，允许用户清空）
  useEffect(() => {
    if (data && !loginInitedRef.current) {
      loginInitedRef.current = true;
      setLoginConfigId(data.loginConfigs?.find((c) => c.isDefault)?.id);
    }
  }, [data]);

  // WS：批量运行 / 单用例运行进度（batch:case / run:step / batch:done）
  useEffect(() => {
    return ws.on((msg) => {
      if (batchJobRef.current && msg.jobId === batchJobRef.current) {
        if (msg.type === 'run:start') {
          const { runId, testCaseId } = msg;
          if (runId && testCaseId) batchRunIdsRef.current[testCaseId] = runId;
        } else if (msg.type === 'batch:case') {
          const { testCaseId, title, status, index, total } = msg as any;
          setBatchCases((prev) => prev.map((c) => (c.id === testCaseId ? { ...c, status, message: msg.message ?? c.message } : c)));
          setBatchLogs((prev) => [
            ...prev,
            status === 'RUNNING'
              ? { color: 'blue', title: <strong>{t('projectCases.caseStart', { title, index: index + 1, total })}</strong> }
              : { color: caseStatusColor(status), title: t('projectCases.caseEnd', { title, status: caseStatusText(status) }) },
          ]);
        } else if (msg.type === 'run:step') {
          setBatchLogs((prev) => [
            ...prev,
            {
              color: msg.status === 'PASSED' ? 'green' : msg.status === 'FAILED' ? 'red' : 'blue',
              title: (
                <span className="text-xs">
                  {t('projectCases.step', { index: msg.index })} {msg.healed ? <Tag color="green">{t('caseDetail.healed')}</Tag> : null} {msg.status}
                </span>
              ),
              desc: msg.message ? String(msg.message) : undefined,
            },
          ]);
        } else if (msg.type === 'batch:done') {
          setBatchRunning(false);
          setBatchDone(true);
          setBatchLogs((prev) => [...prev, { color: 'blue', title: <strong>{t('projectCases.batchRunDone')}</strong> }]);
          load(); // 刷新运行数
        }
      } else if (singleJobRef.current && msg.jobId === singleJobRef.current) {
        if (msg.type === 'run:start') {
          singleRunIdRef.current = msg.runId ?? null;
        } else if (msg.type === 'batch:case') {
          const { title, status } = msg as any;
          if (status !== 'RUNNING') singleStatusRef.current = status;
          setSingleLogs((prev) => [
            ...prev,
            status === 'RUNNING'
              ? { color: 'blue', title: <strong>{t('projectCases.caseStart', { title, index: 1, total: 1 })}</strong> }
              : { color: caseStatusColor(status), title: t('projectCases.caseEnd', { title, status: caseStatusText(status) }) },
          ]);
        } else if (msg.type === 'run:step') {
          setSingleLogs((prev) => [
            ...prev,
            {
              color: msg.status === 'PASSED' ? 'green' : msg.status === 'FAILED' ? 'red' : 'blue',
              title: (
                <span className="text-xs">
                  {t('projectCases.step', { index: msg.index })} {msg.healed ? <Tag color="green">{t('caseDetail.healed')}</Tag> : null} {msg.status}
                </span>
              ),
              desc: msg.message ? String(msg.message) : undefined,
            },
          ]);
        } else if (msg.type === 'batch:done') {
          setSingleRunning(false);
          setSingleDone(true);
          setSingleLogs((prev) => [...prev, { color: 'blue', title: <strong>{t('projectCases.runDone')}</strong> }]);
          load(); // 刷新运行数
        }
      }
    });
  }, [load, t]);

  const submit = async () => {
    try {
      const v = await form.validateFields();
      await http.post(`/api/projects/${projectId}/test-cases`, { title: v.title, description: v.description });
      message.success(t('projectCases.created'));
      setOpen(false);
      form.resetFields();
      load();
    } catch (e) {
      message.error(t('projectCases.createFailed', { err: String(e) }));
    }
  };

  const remove = async (id: string) => {
    try {
      await http.del(`/api/test-cases/${id}`);
      message.success(t('projectCases.deleted'));
      load();
    } catch (e) {
      message.error(t('projectCases.deleteFailed', { err: String(e) }));
    }
  };

  // 批量删除：与单删不同先做 Modal 确认（操作不可逆），再请求后端批量接口。
  const [batchDelOpen, setBatchDelOpen] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const openBatchDelete = () => {
    if (!selectedKeys.length) {
      message.warning(t('projectCases.selectFirst'));
      return;
    }
    setBatchDelOpen(true);
  };
  const confirmBatchDelete = async () => {
    const ids = selectedKeys.map(String);
    if (!ids.length) {
      setBatchDelOpen(false);
      return;
    }
    setBatchDeleting(true);
    try {
      const res = await http.del<{ ok: boolean; count: number }>('/api/test-cases', { ids });
      message.success(t('projectCases.deletedCases', { count: res?.count ?? ids.length }));
      setSelectedKeys([]);
      setBatchDelOpen(false);
      load();
    } catch (e) {
      message.error(t('projectCases.batchDeleteFailed', { err: String(e) }));
    } finally {
      setBatchDeleting(false);
    }
  };

  const openEdit = (r: CaseItem) => {
    setEditing(r);
    editForm.setFieldsValue({ title: r.title });
  };

  const submitEdit = async () => {
    if (!editing) return;
    try {
      const v = await editForm.validateFields();
      await http.put(`/api/test-cases/${editing.id}`, { title: v.title });
      message.success(t('projectCases.updated'));
      setEditing(null);
      load();
    } catch (e) {
      message.error(t('projectCases.updateFailed', { err: String(e) }));
    }
  };

  /** 运行单个用例：使用保存的默认版本，未设置时取最新版本。只显示运行记录，不展示用例列表。 */
  const runCase = async (r: CaseItem) => {
    const sid = selectedScripts[r.id] || r.defaultScriptId;
    setSingleTitle(r.title);
    setSingleLogs([]);
    setSingleRunning(true);
    setSingleDone(false);
    singleRunIdRef.current = null;
    singleStatusRef.current = '';
    singleStartAtRef.current = Date.now();
    singleCaseRef.current = { id: r.id, title: r.title };
    setSingleOpen(true);
    try {
      const scriptIds = sid ? { [r.id]: sid } : {};
      const { jobId } = await http.post<{ jobId: string }>('/api/runs/batch', {
        testCaseIds: [r.id],
        loginConfigId,
        scriptIds,
      });
      singleJobRef.current = jobId;
    } catch (e) {
      setSingleRunning(false);
      message.error(t('projectCases.runStartFailed', { err: String(e) }));
    }
  };

  const startBatch = async () => {
    if (!selectedKeys.length) {
      message.warning(t('projectCases.selectFirst'));
      return;
    }
    const cases = (data?.testCases ?? []).filter((c) => selectedKeys.includes(c.id));
    if (!cases.length) return;
    // 版本列里显式选择的脚本版本；未选择（或选择已失效）的用例由后端退回最新版本。
    const scriptIds: Record<string, string> = {};
    setBatchCases(
      cases.map((c) => {
        const sid = selectedScripts[c.id];
        const v = c.scripts?.find((s) => s.id === sid)?.version;
        if (sid) scriptIds[c.id] = sid;
        return { id: c.id, title: c.title, status: 'PENDING', scriptLabel: v != null ? `v${v}` : t('projectCases.scriptLabel') };
      }),
    );
    setBatchLogs([]);
    setBatchRunning(true);
    setBatchDone(false);
    batchRunIdsRef.current = {};
    batchStartAtRef.current = Date.now();
    setBatchOpen(true);
    try {
      const { jobId } = await http.post<{ jobId: string }>('/api/runs/batch', { testCaseIds: cases.map((c) => c.id), loginConfigId, scriptIds });
      batchJobRef.current = jobId;
    } catch (e) {
      setBatchRunning(false);
      message.error(t('projectCases.batchStartFailed', { err: String(e) }));
    }
  };

  /** 运行结束后导出批量测试报告：逐个取运行详情（步骤/日志/token），生成 Excel。 */
  const downloadBatchReport = async () => {
    if (!batchCases.some((c) => c.status !== 'SKIPPED')) {
      message.warning(t('projectCases.noReportData'));
      return;
    }
    setReportExporting(true);
    try {
      const runIds = batchRunIdsRef.current;
      const runMap: Record<string, RunFull> = {};
      await Promise.all(
        batchCases
          .filter((c) => c.status !== 'SKIPPED')
          .map(async (c) => {
            const r = await fetchRunFull(c.id, runIds[c.id], batchStartAtRef.current);
            if (r) runMap[c.id] = r;
          }),
      );
      await exportBatchReport({
        projectName: data?.name,
        cases: batchCases.map((c) => {
          const r = runMap[c.id];
          return {
            testCaseId: c.id,
            title: c.title,
            status: c.status,
            message: c.message,
            run: r ? { id: r.id, steps: r.stepResults ?? [], scriptSteps: r.script?.steps, logs: r.logs, stepUsages: r.meta?.stepUsages } : undefined,
          };
        }),
      });
      message.success(t('projectCases.reportExported'));
    } catch (e) {
      message.error(t('projectCases.reportExportFailed', { err: String(e) }));
    } finally {
      setReportExporting(false);
    }
  };

  /** 单用例运行结束后导出测试报告（复用批量报告结构，单个用例数据）。 */
  const downloadSingleReport = async () => {
    const c = singleCaseRef.current;
    if (!c) return;
    setReportExporting(true);
    try {
      const r = await fetchRunFull(c.id, singleRunIdRef.current, singleStartAtRef.current);
      await exportBatchReport({
        projectName: c.title,
        reportName: '测试报告',
        cases: [
          {
            testCaseId: c.id,
            title: c.title,
            status: singleStatusRef.current || r?.status || 'PENDING',
            run: r ? { id: r.id, steps: r.stepResults ?? [], scriptSteps: r.script?.steps, logs: r.logs, stepUsages: r.meta?.stepUsages } : undefined,
          },
        ],
      });
      message.success(t('projectCases.reportExported'));
    } catch (e) {
      message.error(t('projectCases.reportExportFailed', { err: String(e) }));
    } finally {
      setReportExporting(false);
    }
  };

  // 导入：读取 .testcase 文件并调用后端导入接口（逐个导入，单个失败不影响其余）。
  const importFiles = async (files: File[]) => {
    const tcFiles = files.filter((f) => f.name.toLowerCase().endsWith('.testcase'));
    if (!tcFiles.length) {
      message.warning(t('projectCases.noTestcaseFiles'));
      return;
    }
    setImporting(true);
    const hide = message.loading(t('projectCases.importing', { count: tcFiles.length }), 0);
    let ok = 0;
    let fail = 0;
    const failedNames: string[] = [];
    for (const f of tcFiles) {
      try {
        const obj = JSON.parse(await f.text());
        await http.post(`/api/projects/${projectId}/test-cases/import`, obj);
        ok++;
      } catch (e) {
        fail++;
        failedNames.push(f.name);
        console.error('导入失败', f.name, e);
      }
    }
    hide();
    setImporting(false);
    if (fail === 0) message.success(t('projectCases.imported', { count: ok }));
    else message.warning(t('projectCases.importResult', { ok, fail, names: failedNames.join('、') }));
    load();
  };

  const onSingleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    await importFiles(files);
  };

  const onFolderChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    await importFiles(files);
  };

  // 批量导出选中的用例为「项目名.zip」，解压后为「项目名/」文件夹，内含各用例的 .testcase。
  const batchExport = async () => {
    const cases = (data?.testCases ?? []).filter((c) => selectedKeys.includes(c.id));
    if (!cases.length) {
      message.warning(t('projectCases.selectFirst'));
      return;
    }
    setExporting(true);
    const hide = message.loading(t('projectCases.exporting'), 0);
    try {
      const details = await Promise.all(cases.map((c) => http.get<CaseFull>(`/api/test-cases/${c.id}`)));
      const folder = sanitizeName(data?.name ?? t('projectCases.project')) || t('projectCases.project');
      const files: { name: string; data: Uint8Array }[] = [];
      const usedNames = new Set<string>();
      let skipped = 0;
      for (const tc of details) {
        const latest = tc.scripts[0]; // scripts 按 version desc 排序，取最新版本
        if (!latest) { skipped++; continue; }
        const payload = {
          format: 'testcase',
          version: 1,
          title: tc.title,
          description: tc.description ?? '',
          naturalLanguage: tc.naturalLanguage ?? '',
          steps: latest.steps,
          rawCode: latest.rawCode ?? '',
        };
        const base = sanitizeName(tc.title) || t('projectCases.unnamedCase');
        let name = `${folder}/${base}.testcase`;
        let n = 2;
        while (usedNames.has(name)) {
          name = `${folder}/${base}-${n}.testcase`;
          n++;
        }
        usedNames.add(name);
        files.push({ name, data: new TextEncoder().encode(JSON.stringify(payload, null, 2)) });
      }
      if (!files.length) {
        message.warning(t('projectCases.noScriptsToExport'));
        return;
      }
      const blob = new Blob([buildZip(files)], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${folder}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      message.success(skipped ? `${t('projectCases.exported', { count: files.length })}${t('projectCases.skippedExport', { count: skipped })}` : t('projectCases.exported', { count: files.length }));
    } catch (e) {
      message.error(t('projectCases.exportFailed', { err: String(e) }));
    } finally {
      hide();
      setExporting(false);
    }
  };

  // 拖拽排序：本地重排后调接口落库，失败回滚到服务端顺序。
  const onSortEnd = async (activeId: React.Key, overId: React.Key) => {
    if (!data || activeId === overId) return;
    const cases = data.testCases;
    const from = cases.findIndex((c) => c.id === activeId);
    const to = cases.findIndex((c) => c.id === overId);
    if (from < 0 || to < 0) return;
    const next = arrayMove(cases, from, to);
    setData({ ...data, testCases: next });
    try {
      await http.put(`/api/projects/${projectId}/test-cases/order`, { ids: next.map((c) => c.id) });
    } catch (e) {
      message.error(t('projectCases.orderSaveFailed', { err: String(e) }));
      load();
    }
  };

  const columns: ColumnsType<CaseItem> = [
    // 标题列用实色 textPrimary：antd 表体默认色是 colorTextBase 88% 透明度，观感偏灰
    { title: t('projectCases.caseTitle'), dataIndex: 'title', render: (v) => <span className="text-ink">{v}</span> },
    // { title: '状态', dataIndex: 'status', width: 90, render: (v) => <Tag>{v === 'DRAFT' ? '草稿' : v === 'ACTIVE' ? '启用' : '归档'}</Tag> },
    { title: t('common.scriptCount'), width: 80, render: (_v, r) => r._count?.scripts ?? 0 },
    { title: t('common.runCount'), width: 80, render: (_v, r) => r._count?.runs ?? 0 },
    {
      title: t('common.version'),
      width: 120,
      render: (_v, r) => {
        const opts = r.scripts ?? [];
        if (!opts.length) return <span className="text-ink-2">-</span>;
        return (
          <Select
            size="small"
            allowClear
            placeholder={t('projectCases.scriptLabel')}
            title={t('projectCases.batchVersionTooltip')}
            value={selectedScripts[r.id]}
            onChange={(v) => {
              const sid = v ?? null;
              // 乐观更新本地选择，同时保存为用例的批量默认版本（失败回滚）
              setSelectedScripts((prev) => {
                const next = { ...prev };
                if (sid) next[r.id] = sid;
                else delete next[r.id];
                return next;
              });
              http.put(`/api/test-cases/${r.id}`, { defaultScriptId: sid }).catch((e) => {
                message.error(t('projectCases.saveVersionFailed', { err: String(e) }));
                setSelectedScripts((prev) => {
                  const next = { ...prev };
                  if (r.defaultScriptId) next[r.id] = r.defaultScriptId;
                  else delete next[r.id];
                  return next;
                });
              });
            }}
            options={opts.map((s) => ({ value: s.id, label: `v${s.version}` }))}
            className="!w-[100px]"
          />
        );
      },
    },
    { title: t('common.createdAt'), dataIndex: 'createdAt', render: (v) => new Date(v as string).toLocaleString() },
    {
      title: t('common.actions'),
      width: 160,
      render: (_v, r) => (
        <Space>
          <Button
            size="small"
            type="text"
            ghost
            icon={<PlayCircleOutlined />}
            title={t('common.run')}
            onClick={() => runCase(r)}
          ></Button>
          <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => remove(r.id)} />
        </Space>
      ),
    },
  ];

  const batchColumns: ColumnsType<BatchCase> = [
    { title: t('projectCases.case'), dataIndex: 'title' },
    { title: t('common.version'), dataIndex: 'scriptLabel', width: 80, render: (v) => (v ? <Tag color="blue">{v}</Tag> : '-') },
    {
      title: t('common.status'),
      dataIndex: 'status',
      width: 110,
      render: (v) =>
        v === 'PASSED' || v === 'FAILED' || v === 'ERROR' || v === 'CANCELLED' ? (
          <RunStatusTag status={v} />
        ) : (
          <Tag color={caseStatusColor(v)}>{caseStatusText(v)}</Tag>
        ),
    },
  ];

  return (
    <div className="flex h-[calc(100vh-40px)] flex-col">
      <div className="mb-4 shrink-0 flex flex-wrap items-center gap-2">
        <Button icon={<ArrowLeftOutlined />} onClick={() => nav('/projects')}></Button>
        <h2 className="m-0 shrink-0 whitespace-nowrap text-xl">{data?.name ?? t('projectCases.project')}{t('projectCases.caseList')}</h2>
        {(() => {
          // 选中用例后按钮切为纯图标（tooltip 显示名称），节省横向空间
          const compact = selectedKeys.length > 0;
          return (
            <>
              <ToolbarButton compact={compact} type="primary" icon={<PlusOutlined />} label={t('projectCases.newCase')} onClick={() => setOpen(true)} />
              {compact && (
                <>
                  <ToolbarButton compact type="primary" disabled={batchRunning} icon={<PlayCircleOutlined />} label={t('projectCases.batchRun')} count={selectedKeys.length} onClick={startBatch} />
                  <ToolbarButton compact type="primary" disabled={exporting} icon={<ExportOutlined />} label={t('projectCases.batchExport')} count={selectedKeys.length} onClick={batchExport} />
                </>
              )}
              <ToolbarButton compact={compact} type="primary" disabled={importing} icon={<ImportOutlined />} label={t('projectCases.importCase')} onClick={() => singleInputRef.current?.click()} />
              <ToolbarButton compact={compact} type="primary" disabled={importing} icon={<FolderOpenOutlined />} label={t('projectCases.batchImport')} onClick={() => folderInputRef.current?.click()} />
              {compact && (
                <ToolbarButton compact danger disabled={batchDeleting} icon={<DeleteOutlined />} label={t('projectCases.batchDelete')} count={selectedKeys.length} onClick={openBatchDelete} />
              )}
            </>
          );
        })()}
        <span className="ml-auto flex shrink-0 items-center whitespace-nowrap">
          {t('projects.loginConfig')}
          <Select
            size="small"
            allowClear
            placeholder={t('common.none')}
            value={loginConfigId}
            onChange={setLoginConfigId}
            className="!ml-1.5 !w-[150px]"
            options={data?.loginConfigs?.map((c) => ({ value: c.id, label: c.name + (c.isDefault ? t('common.defaultTag') : '') }))}
          />
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <SortableTable
          sortable
          rowKey="id"
          dataSource={data?.testCases ?? []}
          columns={columns}
          className="auto-height-table"
          scroll={{ y: 'max-content' }}
          rowSelection={{ selectedRowKeys: selectedKeys, onChange: setSelectedKeys }}
          onRow={(r) => ({ className: 'cursor-pointer', onClick: rowClickNav(nav, `/cases/${r.id}`) })}
          onSortEnd={onSortEnd}
        />
      </div>
      <Modal title={t('projectCases.newCase')} open={open} onOk={submit} onCancel={() => setOpen(false)} okText={t('common.create')} cancelText={t('common.cancel')}>
        <Form form={form} layout="vertical">
          <Form.Item name="title" label={t('projectCases.caseTitle')} rules={[{ required: true, message: t('projectCases.titleRequired') }]}>
            <Input placeholder={t('projectCases.titlePlaceholder')} />
          </Form.Item>
          <Form.Item name="description" label={t('common.description')}>
            <Input.TextArea rows={2} placeholder={t('common.descriptionOptional')} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('projectCases.editCase')}
        open={!!editing}
        onOk={submitEdit}
        onCancel={() => setEditing(null)}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
      >
        <Form form={editForm} layout="vertical">
          <Form.Item name="title" label={t('projectCases.caseTitle')} rules={[{ required: true, message: t('projectCases.titleRequired') }]}>
            <Input placeholder={t('projectCases.titlePlaceholder')} />
          </Form.Item>
        </Form>
      </Modal>

      <input ref={singleInputRef} type="file" accept=".testcase" className="hidden" onChange={onSingleChange} />
      <input
        ref={folderInputRef}
        type="file"
        accept=".testcase"
        multiple
        className="hidden"
        onChange={onFolderChange}
        {...({ webkitdirectory: '', directory: '' } as any)}
      />

      <Modal
        title={t('projectCases.batchDeleteTitle', { count: selectedKeys.length })}
        open={batchDelOpen}
        onOk={confirmBatchDelete}
        onCancel={() => !batchDeleting && setBatchDelOpen(false)}
        okText={t('projectCases.confirmDelete')}
        cancelText={t('common.cancel')}
        okButtonProps={{ danger: true, loading: batchDeleting }}
      >
        <p>{t('projectCases.batchDeleteConfirm')}</p>
        <div className="max-h-60 overflow-auto rounded border border-line-subtle px-2 py-1">
          {(data?.testCases ?? [])
            .filter((c) => selectedKeys.includes(c.id))
            .map((c) => (
              <div key={c.id} className="py-0.5">· {c.title}</div>
            ))}
        </div>
      </Modal>

      <Modal
        title={t('projectCases.runRecordTitle', { title: singleTitle || t('projectCases.case') })}
        open={singleOpen}
        onCancel={() => setSingleOpen(false)}
        maskClosable={false}
        width={760}
        footer={[
          <Button key="report" type="primary" disabled={!singleDone || reportExporting} onClick={downloadSingleReport}>
            {t('projectCases.testReport')}
          </Button>,
          <Button key="cancel" type="primary" disabled={!singleRunning} onClick={() => singleJobRef.current && ws.cancel(singleJobRef.current)}>
            {t('projectCases.cancelRun')}
          </Button>,
          <Button key="close" type="primary" className="ml-2.5" disabled={singleRunning} onClick={() => setSingleOpen(false)}>
            {t('common.close')}
          </Button>,
        ]}
      >
        <div className="max-h-[420px] overflow-auto">
          <RunLog items={singleLogs} emptyText={t('common.waitingOutput')} />
        </div>
      </Modal>

      <Modal
        title={t('projectCases.batchRunModal')}
        open={batchOpen}
        onCancel={() => setBatchOpen(false)}
        maskClosable={false}
        width={860}
        footer={[
          <Button key="report" type="primary" disabled={!batchDone || reportExporting} onClick={downloadBatchReport}>
            {t('projectCases.testReport')}
          </Button>,
          <Button key="cancel" type="primary" disabled={!batchRunning} onClick={() => batchJobRef.current && ws.cancel(batchJobRef.current)}>
            {t('projectCases.cancelBatch')}
          </Button>,
          <Button key="close" type="primary" className="ml-2.5" disabled={batchRunning} onClick={() => setBatchOpen(false)}>
            {t('common.close')}
          </Button>,
        ]}
      >
        <div className="flex gap-4">
          <div className="w-[380px] shrink-0">
            <SortableTable rowKey="id" size="small" dataSource={batchCases} columns={batchColumns} />
          </div>
          <div className="max-h-[420px] flex-1 overflow-auto">
            <RunLog items={batchLogs} emptyText={t('common.waitingOutput')} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
