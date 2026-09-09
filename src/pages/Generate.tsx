import { useEffect, useRef, useState } from 'react';
import { Button, Card, Input, InputNumber, Radio, Space, App, Alert, Select, Tag, Modal, Tooltip } from 'antd';
import { ArrowLeftOutlined, ThunderboltOutlined, SaveOutlined, PlusOutlined, DeleteOutlined, HolderOutlined, InfoCircleOutlined, FullscreenOutlined, FullscreenExitOutlined, PaperClipOutlined, LoadingOutlined, PlayCircleOutlined, PauseOutlined, CloseCircleOutlined, RollbackOutlined, RobotOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { http } from '../api/client';
import { ws } from '../api/ws';
import type { TestStep } from '@shared/testScript';
import { STEP_ACTION_LABEL } from '@shared/constants';
import StepsTable from '../components/StepsTable';
import RunLog, { type LogItem } from '../components/RunLog';
import AttachmentUpload, { AttachmentChips, type AttachmentItem, type AttachmentUploadHandle } from '../components/AttachmentUpload';
import { fmtToken, type TokenUsage } from '../utils/token';
import CacheRatePie from '../components/CacheRatePie';

interface CaseInfo { id: string; title: string; project: { id: string; name: string; baseUrl?: string; envVars?: { key: string }[]; loginConfigs?: { id: string; name: string; isDefault: boolean }[] } }

interface PlanStep {
  id?: string; // 前端拖拽排序用
  kind: 'action' | 'assert';
  instruction: string;
  action?: string;
  url?: string;
  value?: string;
  key?: string;
  assertion?: { type?: string; expected?: string; urlMatch?: string; jsonPath?: string };
}

/** 计划行的拖拽容器：手柄可发起拖拽，其余内容不受影响。 */
function SortablePlanRow({ id, index, children }: { id: string; index: number; children: React.ReactNode }) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      className={`mb-2 flex items-start gap-2${isDragging ? ' relative z-[9999] rounded bg-accent-subtle outline-1 outline-dashed outline-accent' : ''}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <span
        ref={setActivatorNodeRef}
        {...listeners}
        className="cursor-grab touch-none pt-[7px] text-ink-3 select-none"
        title={t('projectCases.dragSort')}
      >
        <HolderOutlined />
      </span>
      <span className="w-[22px] pt-1.5 text-center text-[13px] text-ink-2">{index}</span>
      {children}
    </div>
  );
}

const ASSERT_TYPES = (t: TFunction) => [
  { value: 'visible', label: t('generate.assertTypes.visible') },
  { value: 'hidden', label: t('generate.assertTypes.hidden') },
  { value: 'text', label: t('generate.assertTypes.text') },
  { value: 'url', label: t('generate.assertTypes.url') },
  { value: 'response_status', label: t('generate.assertTypes.response_status') },
  { value: 'response_body', label: t('generate.assertTypes.response_body') },
  { value: 'response_json', label: t('generate.assertTypes.response_json') },
  { value: 'ws_received', label: t('generate.assertTypes.ws_received') },
];

export default function Generate() {
  const { caseId } = useParams();
  const { t } = useTranslation();
  const nav = useNavigate();
  const { message } = App.useApp();
  const [info, setInfo] = useState<CaseInfo | null>(null);
  const [nl, setNl] = useState('');
  const [startUrl, setStartUrl] = useState('');
  const [loginConfigId, setLoginConfigId] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<TestStep[]>([]);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [done, setDone] = useState(false);
  /** 结束态（区别于运行中/等待中的终态）：done=成功 error=出错 cancelled=已取消 stopped=已停止（可继续）。 */
  const [endState, setEndState] = useState<'none' | 'done' | 'error' | 'cancelled' | 'stopped'>('none');
  const [usage, setUsage] = useState<TokenUsage | null>(null);
  /** 轨迹头部实时累积的 token 消耗：gen:tool/gen:plan 为单次调用增量（累加），gen:done/gen:error 直接对齐任务累计。 */
  const [liveUsage, setLiveUsage] = useState<TokenUsage | null>(null);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [plan, setPlan] = useState<PlanStep[] | null>(null);
  /** 计划确认后进入执行的步骤（只读预览用，区别于逐步生成的实际脚本步骤）。 */
  const [confirmedPlan, setConfirmedPlan] = useState<PlanStep[] | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [assist, setAssist] = useState<{ stepIndex: number; kind: string; instruction: string; canManual: boolean } | null>(null);
  const [redescText, setRedescText] = useState('');
  /** 定位失败弹框当前选中的处理方式。 */
  const [assistMode, setAssistMode] = useState<'ai-fix' | 'redescribe' | 'manual' | 'revoke' | 'skip'>('ai-fix');
  /** 撤销最后 N 步（N>=1）。 */
  const [revokeCount, setRevokeCount] = useState(1);
  const [revokeNl, setRevokeNl] = useState('');
  /** WS 闭包里读取最新 steps（初始化撤销范围默认值用）。 */
  const stepsRef = useRef<TestStep[]>([]);
  const [manualHint, setManualHint] = useState(false);
  const [chatHidden, setChatHidden] = useState(false);
  const [stepsHidden, setStepsHidden] = useState(false);
  const jobIdRef = useRef<string | null>(null);
  const loginInitedRef = useRef(false);
  const attachRef = useRef<AttachmentUploadHandle>(null);

  const assertTypes = ASSERT_TYPES(t);

  /** 累加一条 WS 消息携带的增量（服务端 gen:tool / gen:plan 的 usage 均为单次调用增量）。 */
  const accLiveUsage = (u?: TokenUsage) =>
    setLiveUsage((p) =>
      u
        ? {
            inputTokens: (p?.inputTokens ?? 0) + u.inputTokens,
            outputTokens: (p?.outputTokens ?? 0) + u.outputTokens,
            totalTokens: (p?.totalTokens ?? 0) + u.totalTokens,
            cachedTokens: (p?.cachedTokens ?? 0) + u.cachedTokens,
          }
        : p,
    );

  useEffect(() => {
    if (!caseId) return;
    http.get<any>(`/api/test-cases/${caseId}`).then((d) => {
      setInfo(d);
      setStartUrl(d.project.baseUrl || '');
    });
  }, [caseId]);

  // 首次加载后默认选中项目的默认登录配置（仅初始化一次，允许用户清空）
  useEffect(() => {
    if (info && !loginInitedRef.current) {
      loginInitedRef.current = true;
      setLoginConfigId(info.project.loginConfigs?.find((c) => c.isDefault)?.id);
    }
  }, [info]);

  // 步骤清空后恢复两个面板，避免全屏状态下按钮消失无法还原
  useEffect(() => {
    if (steps.length === 0) {
      setChatHidden(false);
      setStepsHidden(false);
    }
  }, [steps.length]);

  // 同步给 WS 闭包可读的最新步骤
  useEffect(() => {
    stepsRef.current = steps;
  }, [steps]);

  useEffect(() => {
    return ws.on((msg) => {
      if (!jobIdRef.current || msg.jobId !== jobIdRef.current) return;
      if (msg.type === 'gen:status') {
        setLogs((p) => [...p, { color: 'blue', title: String(msg.message ?? '') }]);
      } else if (msg.type === 'gen:tool') {
        const st = (msg.step as any) ?? {};
        const u = msg.usage as TokenUsage | undefined;
        const parts = [String(st.actionDetail ?? ''), String(st.result ?? '')].filter(Boolean);
        accLiveUsage(u);
        setLogs((p) => [...p, { color: 'blue', title: <span>{t('generate.tool')} <Tag>{st.actionLabel ?? ''}</Tag></span>, desc: parts.length ? parts.join(' · ') : undefined, usage: u ? { total: u.totalTokens, cached: u.cachedTokens, input: u.inputTokens } : undefined }]);
      } else if (msg.type === 'gen:plan') {
        setPlan(((msg.steps as PlanStep[]) ?? []).map((s, i) => ({ ...s, id: s.id ?? `p${i}` })));
        const u = msg.usage as TokenUsage | undefined;
        accLiveUsage(u);
        setLogs((p) => [
          ...p,
          {
            color: 'blue',
            title: <strong>{t('generate.planDone')}</strong>,
            desc: u ? (
              <>
                {t('generate.usageDetail', {
                  total: fmtToken(u.totalTokens),
                  input: fmtToken(u.inputTokens),
                  output: fmtToken(u.outputTokens),
                  cached: u.cachedTokens ? t('generate.cachedHint', { cached: fmtToken(u.cachedTokens) }) : '',
                })}
                <CacheRatePie cached={u.cachedTokens} input={u.inputTokens} total={u.totalTokens} />
              </>
            ) : undefined,
          },
        ]);
      } else if (msg.type === 'gen:assist') {
        setAssist({ stepIndex: msg.stepIndex as number, kind: String(msg.kind ?? ''), instruction: String(msg.instruction ?? ''), canManual: Boolean(msg.canManual) });
        setAssistMode('ai-fix');
        setRevokeNl('');
        setRevokeCount(Math.max(1, stepsRef.current.length));
      } else if (msg.type === 'gen:revoke') {
        const from = msg.from as number;
        const to = msg.to as number;
        setSteps((prev) => prev.filter((_, idx) => idx + 1 < from || idx + 1 > to));
        setLogs((p) => [...p, { color: 'orange', title: t('generate.revoked', { from, to }) }]);
      } else if (msg.type === 'gen:assist-status') {
        if (msg.status === 'manual') setManualHint(true);
        setLogs((p) => [...p, { color: 'blue', title: String(msg.message ?? '') }]);
      } else if (msg.type === 'gen:step') {
        setSteps((prev) => {
          const next = [...prev];
          const idx = msg.index as number;
          next[idx] = msg.step as TestStep;
          return next;
        });
        setManualHint(false);
        setLogs((p) => [...p, { color: (msg.step as any)?.error ? 'orange' : 'green', title: t('generate.stepInfo', { index: msg.index, instruction: (msg.step as any)?.instruction ?? '' }), desc: (msg.step as any)?.locator ? t('generate.locatorInfo', { strategy: (msg.step as any).locator.strategy, value: (msg.step as any).locator.value }) : undefined }]);
      } else if (msg.type === 'gen:revise') {
        // 模型修订了已落步骤（改参数/删冗余）：base 之前的前缀是用户可见的基础步骤（续跑），后半整表替换
        const base = (msg.base as number) ?? 0;
        setSteps((prev) => [...prev.slice(0, base), ...(((msg.steps as TestStep[]) ?? []) as TestStep[])]);
        setLogs((p) => [...p, { color: 'orange', title: t('generate.stepsRevised', { count: ((msg.ops as unknown[]) ?? []).length }) }]);
      } else if (msg.type === 'gen:done') {
        setBusy(false);
        setDone(true);
        setEndState('done');
        setSteps(msg.script.steps as TestStep[]);
        setUsage(msg.usage ?? null);
        setLiveUsage((msg.usage as TokenUsage) ?? null);
        setLogs((p) => [...p, { color: 'green', title: <strong>{t('generate.genDone', { count: msg.script.steps.length })}</strong> }]);
      } else if (msg.type === 'gen:paused') {
        setBusy(false);
        setAssist(null);
        setManualHint(false);
        setPlan(null);
        setDone(false);
        setEndState('stopped');
        setLogs((p) => [...p, { color: 'orange', title: <strong>{t('generate.pausedTitle')}</strong>, desc: t('generate.pausedDesc') }]);
      } else if (msg.type === 'gen:error') {
        setBusy(false);
        setAssist(null);
        setManualHint(false);
        setDone(false);
        setEndState(String(msg.message ?? '').includes('取消') ? 'cancelled' : 'error');
        setUsage(msg.usage ?? null);
        if (msg.usage) setLiveUsage(msg.usage as TokenUsage); // 终态以服务端任务累计为准（含未推送增量的 AI 修正等调用）
        const missing = (msg.missingAttachments as string[] | undefined) ?? [];
        if (missing.length) {
          setAttachments((prev) => prev.filter((a) => !a.id || !missing.includes(a.id)));
          message.warning(t('generate.removedAttachments', { count: missing.length }));
        } else {
          message.error(String(msg.message ?? t('generate.genFailed')));
        }
        const u = msg.usage as TokenUsage | undefined;
        setLogs((p) => [...p, { color: 'red', title: <strong>{t('generate.error')}</strong>, desc: (
          <>
            {msg.message}
            {u && (
              <>
                {' · '}
                {t('caseDetail.usageText', { total: fmtToken(u.totalTokens), cached: fmtToken(u.cachedTokens) })}
                <CacheRatePie cached={u.cachedTokens} input={u.inputTokens} total={u.totalTokens} />
              </>
            )}
          </>
        ) }]);
      }
    });
  }, [message, t]);

  const start = async () => {
    if (!caseId) return;
    if (!nl.trim()) {
      message.warning(t('generate.needNl'));
      return;
    }
    if (attachments.some((a) => a.status === 'uploading')) {
      message.warning(t('generate.uploadingAttachments'));
      return;
    }
    const sent = nl;
    const attDesc = attachments.length ? t('generate.attachmentList', { names: attachments.map((a) => a.name).join('、') }) : undefined;
    // 先置 busy 再发请求：await 期间按钮即禁用，避免双击重复触发
    setBusy(true);
    const res = await http.post<{ jobId?: string; error?: string }>('/api/generate', {
      nl,
      startUrl,
      projectId: info?.project?.id,
      testCaseId: caseId,
      loginConfigId,
      attachments: attachments.filter((a) => a.status === 'done' && a.id).map((a) => a.id),
    });
    if (res.error || !res.jobId) {
      setBusy(false);
      message.error(res.error ?? t('generate.genFailed'));
      return;
    }
    jobIdRef.current = res.jobId;
    setDone(false);
    setEndState('none');
    setSteps([]);
    setLogs([]);
    setUsage(null);
    setLiveUsage(null);
    setPlan(null);
    setConfirmedPlan(null);
    setAssist(null);
    setManualHint(false);
    setRedescText('');
    // 轨迹记录本次发送的用户消息；清空输入框与附件（附件只清前端 UI，服务端副本由本次任务消费/过期清理）
    setLogs([{ color: 'var(--tk-accent)', title: <strong>{t('generate.userInput', { text: sent })}</strong>, desc: attDesc }]);
    setNl('');
    attachments.forEach((a) => {
      if (a.preview) URL.revokeObjectURL(a.preview);
    });
    setAttachments([]);
  };

  const cancel = () => {
    if (jobIdRef.current) {
      ws.cancel(jobIdRef.current);
      setBusy(false);
      setAssist(null);
      setManualHint(false);
      setEndState('cancelled'); // 同步归一按钮状态，不依赖 WS 事件到达时机
      setDone(false);
    }
  };

  /** 暂停：中断执行但保留浏览器会话，后续可「继续生成」追加步骤（状态由 gen:paused 事件统一处理）。 */
  const pauseGen = async () => {
    if (!jobIdRef.current || !busy) return;
    const res = await http.post<{ ok?: boolean; error?: string }>(`/api/generate/${jobIdRef.current}/pause`);
    if (res.error) message.error(res.error);
  };

  /** 停止后继续生成：把当前（可能已手动调整的）步骤作为基底，用追加描述在同一浏览器会话里生成剩余步骤。 */
  const continueRun = async () => {
    if (!jobIdRef.current) return;
    if (!nl.trim()) {
      message.warning(t('generate.needAppend'));
      return;
    }
    if (attachments.some((a) => a.status === 'uploading')) {
      message.warning(t('generate.uploadingAttachmentsShort'));
      return;
    }
    const sent = nl;
    const attDesc = attachments.length ? t('generate.attachmentList', { names: attachments.map((a) => a.name).join('、') }) : undefined;
    // 先置 busy 再发请求：await 期间「继续生成」即隐藏，避免双击重复触发
    setBusy(true);
    const res = await http.post<{ ok?: boolean; error?: string }>(`/api/generate/${jobIdRef.current}/continue`, {
      nl,
      projectId: info?.project?.id,
      testCaseId: caseId,
      attachments: attachments.filter((a) => a.status === 'done' && a.id).map((a) => a.id),
      baseSteps: steps,
    });
    if (res.error) {
      setBusy(false);
      setEndState('stopped'); // 仍在暂停态，可重试继续
      message.error(res.error);
      return;
    }
    setDone(false);
    setEndState('none');
    setPlan(null);
    setAssist(null);
    setManualHint(false);
    setUsage(null);
    setLogs((p) => [...p, { color: 'var(--tk-accent)', title: <strong>{t('generate.userInput', { text: sent })}</strong>, desc: attDesc }]);
    setNl('');
    attachments.forEach((a) => {
      if (a.preview) URL.revokeObjectURL(a.preview);
    });
    setAttachments([]);
  };

  const cancelPlan = () => {
    cancel();
    setPlan(null);
  };

  const confirmRun = async () => {
    if (!jobIdRef.current || !plan) return;
    const valid = plan.filter((p) => p.instruction.trim());
    if (!valid.length) {
      message.warning(t('generate.planEmpty'));
      return;
    }
    const res = await http.post<{ ok?: boolean; error?: string }>(`/api/generate/${jobIdRef.current}/confirm`, { steps: valid });
    if (res.error) {
      message.error(res.error);
      return;
    }
    setConfirmedPlan(valid);
    setPlan(null);
    setBusy(true);
  };

  const assistSend = async (decision: 'redescribe' | 'ai-fix' | 'manual' | 'skip') => {
    if (!jobIdRef.current) return;
    if (decision === 'redescribe' && !redescText.trim()) {
      message.warning(t('generate.redescribeEmpty'));
      return;
    }
    const res = await http.post<{ ok?: boolean; error?: string }>(`/api/generate/${jobIdRef.current}/assist`, {
      decision,
      instruction: decision === 'redescribe' ? redescText.trim() : undefined,
    });
    if (res.error) {
      message.error(res.error);
      return;
    }
    setAssist(null);
    setRedescText('');
    if (decision === 'manual') setManualHint(true);
  };

  /** 撤销步骤：删除已生成的最后 N 步；服务端删范围并广播 gen:revoke 收缩列表，模型收到引导文本后基于当前页面重做。 */
  const revokeSend = async () => {
    if (!jobIdRef.current || !assist) return;
    const total = stepsRef.current.length;
    const n = Math.max(1, Math.min(revokeCount, total));
    const res = await http.post<{ ok?: boolean; error?: string }>(`/api/generate/${jobIdRef.current}/assist`, {
      decision: 'revoke',
      from: total - n + 1,
      to: total,
      nl: revokeNl.trim() || undefined,
    });
    if (res.error) {
      message.error(res.error);
      return;
    }
    setAssist(null);
    setRevokeNl('');
  };

  const updatePlan = (i: number, patch: Partial<PlanStep>) => {
    setPlan((p) => (p ? p.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) : p));
  };
  const addPlanStep = () =>
    setPlan((p) => (p ? [...p, { id: crypto.randomUUID(), kind: 'action', instruction: '', action: 'click' }] : p));
  const removePlanStep = (i: number) => setPlan((p) => (p ? p.filter((_, idx) => idx !== i) : p));
  const planSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onPlanDragEnd = ({ active, over }: { active: { id: unknown }; over: { id: unknown } | null }) => {
    setPlan((p) => {
      if (!p || !over || active.id === over.id) return p;
      const from = p.findIndex((s) => s.id === active.id);
      const to = p.findIndex((s) => s.id === over.id);
      if (from < 0 || to < 0) return p;
      return arrayMove(p, from, to);
    });
  };

  const save = async () => {
    if (!caseId || !steps.length) return;
    await http.post(`/api/test-cases/${caseId}/scripts`, { steps });
    message.success(t('generate.savedNewVersion'));
    nav(`/cases/${caseId}`);
  };

  /** 人工介入面板：内联在执行轨迹末尾随轨迹滚动，不再弹窗遮挡轨迹。 */
  const assistPanel = assist ? (
    <div className="mx-2.5 mb-2.5 rounded-lg border border-warning bg-elevated p-3 shadow-sm">
      <div className="mb-3 rounded-md border-l-[3px] border-l-warning bg-warning-subtle px-3 py-2.5">
        <Tag color="orange">{t('generate.stepKind', { index: assist?.stepIndex, kind: assist?.kind === 'assert' ? t('generate.assert') : t('generate.action') })}</Tag>
        <div className="mt-1.5 text-[13px] leading-[1.6] break-all">{assist?.instruction}</div>
      </div>
      <Radio.Group
        className="mb-3 flex w-full [&_.ant-radio-button-wrapper]:flex-1 [&_.ant-radio-button-wrapper]:text-center"
        optionType="button"
        buttonStyle="solid"
        value={assistMode}
        onChange={(e) => setAssistMode(e.target.value)}
        options={[
          { value: 'ai-fix', label: t('generate.aiFix') },
          { value: 'redescribe', label: t('generate.redescribe') },
          ...(assist?.canManual ? [{ value: 'manual' as const, label: t('generate.manual') }] : []),
          { value: 'revoke', label: t('generate.revoke'), disabled: steps.length === 0 },
          { value: 'skip', label: t('generate.skip') },
        ]}
      />
      <div className="flex flex-col gap-2.5">
        {assistMode === 'ai-fix' && (
          <>
            <div className="text-xs leading-[1.6] text-ink-2">{t('generate.aiFixHint')}</div>
            <Button type="primary" block icon={<RobotOutlined />} onClick={() => assistSend('ai-fix')}>{t('generate.aiFixRetry')}</Button>
          </>
        )}
        {assistMode === 'redescribe' && (
          <>
            <div className="text-xs leading-[1.6] text-ink-2">{t('generate.redescribeHint')}</div>
            <Input.TextArea
              rows={3}
              value={redescText}
              onChange={(e) => setRedescText(e.target.value)}
              placeholder={t('generate.redescribePlaceholder')}
            />
            <Button type="primary" block onClick={() => assistSend('redescribe')}>{t('generate.redescribeRetry')}</Button>
          </>
        )}
        {assistMode === 'manual' && (
          <>
            <div className="text-xs leading-[1.6] text-ink-2">{t('generate.manualHint')}</div>
            <Button type="primary" block onClick={() => assistSend('manual')}>{t('generate.manualDo')}</Button>
          </>
        )}
        {assistMode === 'revoke' && (
          <>
            <div className="text-xs leading-[1.6] text-ink-2">{t('generate.revokeHint')}</div>
            <div className="flex items-center gap-2">
              <InputNumber
                min={1}
                max={Math.max(1, steps.length)}
                value={revokeCount}
                onChange={(v) => {
                  const n = Math.max(1, Math.min(Number(v) || 1, steps.length));
                  setRevokeCount(n);
                }}
              />
              <span className="ml-auto text-xs whitespace-nowrap text-ink-2">{t('generate.revokeCount', { count: Math.min(revokeCount, steps.length), total: steps.length })}</span>
            </div>
            <Input.TextArea
              rows={2}
              value={revokeNl}
              onChange={(e) => setRevokeNl(e.target.value)}
              placeholder={t('generate.revokePlaceholder')}
            />
            <Button type="primary" danger block icon={<RollbackOutlined />} onClick={revokeSend}>{t('generate.revokeRegen')}</Button>
          </>
        )}
        {assistMode === 'skip' && (
          <>
            <div className="text-xs leading-[1.6] text-ink-2">{t('generate.skipHint')}</div>
            <Button block onClick={() => assistSend('skip')}>{t('generate.skipStep')}</Button>
          </>
        )}
      </div>
      <div className="mt-3 flex justify-end border-t border-line-subtle pt-2.5">
        <Button danger type="text" onClick={cancel}>{t('generate.cancelAll')}</Button>
      </div>
    </div>
  ) : null;

  return (
    <div className="flex flex-col">
      <header className="mb-4 flex shrink-0 items-center gap-2">
        <Button icon={<ArrowLeftOutlined />} onClick={() => nav(`/cases/${caseId}`)}></Button>
        <h2 className="m-0 flex items-center text-xl">
          {t('generate.title', { suffix: info ? ` · ${info.title}` : '' })}
          <Tooltip
            title={
              <span>
                <div>{t('generate.help1')}</div>
                <div className="mt-1">{t('generate.help2')}</div>
              </span>
            }
          >
            <InfoCircleOutlined className="ml-2 cursor-help text-[15px] text-ink-2" />
          </Tooltip>
        </h2>
      </header>

      <div className="flex h-[calc(100vh-120px)] min-h-[460px] gap-4">
        {/* 左：生成的步骤 */}
        {steps.length > 0 && !stepsHidden && (
          <div className="flex min-h-0 min-w-0 flex-[1.2] flex-col">
              <Card
                size="small"
                className="flex min-h-0 flex-1 flex-col [&_.ant-card-body]:min-h-0 [&_.ant-card-body]:flex-1 [&_.ant-card-body]:overflow-auto"
                title={
                  <span>
                    {t('generate.generatedSteps', { count: steps.length })}
                    {usage && (
                      <span className="ml-2 text-xs font-normal text-ink-2">
                        {t('generate.usageText', {
                          total: fmtToken(usage.totalTokens),
                          input: fmtToken(usage.inputTokens),
                          output: fmtToken(usage.outputTokens),
                          cached: fmtToken(usage.cachedTokens),
                        })}
                        <CacheRatePie cached={usage.cachedTokens} input={usage.inputTokens} total={usage.totalTokens} />
                      </span>
                    )}
                  </span>
                }
                extra={
                  <Tooltip title={t('generate.expandRestore')}>
                    <Button
                      type="text"
                      size="small"
                      icon={chatHidden ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                      onClick={() => setChatHidden((v) => !v)}
                    />
                  </Tooltip>
                }
              >
              <StepsTable
                steps={steps}
                onChange={setSteps}
                envVarKeys={info?.project.envVars?.map((v) => v.key)}
                pickStartUrl={startUrl}
                pickLoginConfigId={loginConfigId}
                pickLoginConfigs={info?.project.loginConfigs}
                pickProjectId={info?.project?.id}
                projectId={info?.project?.id}
              />
            </Card>
          </div>
        )}

        {/* 右：消息框 + 输入对话框 */}
        {!chatHidden && (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-line-subtle">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-elevated">
            <div className="flex items-center justify-between border-b border-line-subtle px-4 py-2 text-sm font-semibold">
              <span className="inline-flex items-center gap-2">
                {t('generate.trace')}
                {/* 运行状态：等待用户介入 > 运行中 > 终态 */}
                {plan ? (
                  <Tag color="gold">{t('generate.waitingPlan')}</Tag>
                ) : assist ? (
                  <Tag color="orange">{t('generate.waitingHuman')}</Tag>
                ) : manualHint ? (
                  <Tag color="orange">{t('generate.waitingManual')}</Tag>
                ) : busy ? (
                  <Tag color="processing" icon={<LoadingOutlined spin />}>{t('generate.running')}</Tag>
                ) : endState === 'stopped' ? (
                  <Tag color="orange">{t('generate.pausedContinue')}</Tag>
                ) : endState === 'done' ? (
                  <Tag color="success">{t('generate.done')}</Tag>
                ) : endState === 'error' ? (
                  <Tag color="error">{t('generate.error')}</Tag>
                ) : endState === 'cancelled' ? (
                  <Tag>{t('generate.cancelled')}</Tag>
                ) : null}
                {liveUsage && (
                  <Tooltip
                    title={
                      <span>
                        {t('generate.usageText', {
                          total: fmtToken(liveUsage.totalTokens),
                          input: fmtToken(liveUsage.inputTokens),
                          output: fmtToken(liveUsage.outputTokens),
                          cached: fmtToken(liveUsage.cachedTokens),
                        })}
                        <CacheRatePie cached={liveUsage.cachedTokens} input={liveUsage.inputTokens} total={liveUsage.totalTokens} />
                      </span>
                    }
                  >
                    <span className="cursor-help text-xs font-normal text-ink-2">
                      {t('generate.liveUsage', { total: fmtToken(liveUsage.totalTokens) })}
                    </span>
                  </Tooltip>
                )}
              </span>
              <Space size={4}>
                {confirmedPlan && confirmedPlan.length > 0 && (
                  <Tooltip title={t('generate.stepListTooltip')}>
                    <Button type="text" size="small" icon={<UnorderedListOutlined />} onClick={() => setPreviewOpen(true)}>
                      {t('generate.stepList')}
                    </Button>
                  </Tooltip>
                )}
                {steps.length > 0 && (
                  <Tooltip title={t('generate.expandRestore')}>
                    <Button
                      type="text"
                      size="small"
                      icon={stepsHidden ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                      onClick={() => setStepsHidden((v) => !v)}
                    />
                  </Tooltip>
                )}
              </Space>
            </div>
            <RunLog items={logs} className="min-h-0 flex-1 overflow-y-auto" emptyText={t('generate.traceEmpty')} footer={assistPanel} scrollSignal={assist ? `${assist.stepIndex}:${assist.kind}` : null} />
          </div>

          {manualHint && (
            <Alert
              type="warning"
              showIcon
              className="mb-3"
              message={t('generate.manualAlert')}
              description={t('generate.manualAlertDesc')}
            />
          )}

          <div className="shrink-0 border-t border-line-subtle bg-elevated p-3">
            <AttachmentUpload ref={attachRef} attachments={attachments} onChange={setAttachments} max={5}>
              <Space direction="vertical" className="w-full" size={12}>
                <div className='flex gap-2.5'>
                  <Tooltip title={t('generate.addAttachment')}>
                    <Button icon={<PaperClipOutlined />} onClick={() => attachRef.current?.pick()} className="shrink-0" />
                  </Tooltip>
                  <Input placeholder={t('common.baseUrlUrl')} value={startUrl} onChange={(e) => setStartUrl(e.target.value)} />
                  <Space className="shrink-0">
                    <span className="text-[13px]">{t('generate.loginConfig')}</span>
                    <Select
                      allowClear
                      placeholder={t('common.none')}
                      value={loginConfigId}
                      onChange={setLoginConfigId}
                      className="!w-[220px]"
                      options={info?.project.loginConfigs?.map((c) => ({ value: c.id, label: c.name + (c.isDefault ? t('common.defaultTag') : '') }))}
                    />
                  </Space>
                </div>
                <Input.TextArea
                  rows={2}
                  placeholder={
                    endState === 'stopped'
                      ? t('generate.stoppedPlaceholder')
                      : t('generate.normalPlaceholder')
                  }
                  value={nl}
                  onChange={(e) => setNl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !busy) {
                      e.preventDefault();
                      start();
                    }
                  }}
                  onPaste={(e) => {
                    const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.size > 0);
                    if (files.length) {
                      e.preventDefault();
                      attachRef.current?.addFiles(files);
                    }
                  }}
                />
                <div className="flex w-full items-center gap-2">
                  <div className="flex flex-1">
                    <AttachmentChips items={attachments} onRemove={(a) => attachRef.current?.remove(a)} />
                  </div>
                  <div className="flex gap-2.5">
                    {!busy && endState !== 'stopped' && <Button type="primary" disabled={attachments.some((a) => a.status === 'uploading')} onClick={start}><ThunderboltOutlined className="mr-1.5" />{t('generate.send')}</Button>}
                    {endState === 'stopped' && !busy && <Button type="primary" disabled={attachments.some((a) => a.status === 'uploading')} onClick={continueRun}><PlayCircleOutlined className="mr-1.5" />{t('generate.continueGen')}</Button>}
                    {busy && <Button type="primary" onClick={pauseGen}><PauseOutlined className="mr-1.5" />{t('generate.pause')}</Button>}
                    {busy && <Button type="primary" onClick={cancel}><CloseCircleOutlined className="mr-1.5" />{t('generate.cancel')}</Button>}
                    {(endState === 'done' || endState === 'stopped' || endState === 'cancelled') && steps.length > 0 && <Button type="primary" onClick={save}><SaveOutlined className="mr-1.5" />{t('generate.saveScript')}</Button>}
                  </div>
                </div>
              </Space>
            </AttachmentUpload>
          </div>
        </div>
        )}
      </div>

      <Modal
        open={!!plan}
        title={t('generate.planTitle', { count: plan?.length ?? 0 })}
        width="min(90%, 1200px)"
        closable={false}
        maskClosable={false}
        footer={null}
      >
        {plan && (
          <div className="max-h-[60vh] overflow-y-auto">
            <DndContext sensors={planSensors} onDragEnd={onPlanDragEnd}>
              <SortableContext items={plan.map((s) => s.id as string)} strategy={verticalListSortingStrategy}>
                {plan.map((p, i) => (
                  <SortablePlanRow key={p.id} id={p.id as string} index={i + 1}>
                    <Select
                      value={p.kind}
                      className="!w-[76px]"
                      onChange={(v) => updatePlan(i, { kind: v })}
                      options={[{ value: 'action', label: t('generate.planKindAction') }, { value: 'assert', label: t('generate.planKindAssert') }]}
                    />
                    <Input.TextArea
                      autoSize={{ minRows: 1 }}
                      value={p.instruction}
                      onChange={(e) => updatePlan(i, { instruction: e.target.value })}
                      placeholder={t('generate.planInstructionPlaceholder')}
                      className="flex-1"
                    />
                    {p.kind === 'action' && p.action === 'goto' && (
                      <Input placeholder="URL" value={p.url ?? ''} onChange={(e) => updatePlan(i, { url: e.target.value })} className="!w-[180px]" />
                    )}
                    {p.kind === 'action' && p.action === 'wait' && (
                      <Input placeholder={t('stepsTable.waitMs')} value={p.value ?? ''} onChange={(e) => updatePlan(i, { value: e.target.value })} className="!w-[90px]" />
                    )}
                    {p.kind === 'action' && p.action === 'fill' && (
                      <Input placeholder={t('stepsTable.fillValue')} value={p.value ?? ''} onChange={(e) => updatePlan(i, { value: e.target.value })} className="!w-[120px]" />
                    )}
                    {p.kind === 'assert' && (
                      <>
                        <Select
                          value={p.assertion?.type ?? 'visible'}
                          className="!w-[140px]"
                          onChange={(v) => updatePlan(i, { assertion: { ...(p.assertion ?? {}), type: v } })}
                          options={assertTypes}
                        />
                        <Input
                          placeholder="expected / urlMatch"
                          value={p.assertion?.expected ?? ''}
                          onChange={(e) => updatePlan(i, { assertion: { ...(p.assertion ?? {}), expected: e.target.value } })}
                          className="!w-[180px]"
                        />
                      </>
                    )}
                    <Button size="small" icon={<DeleteOutlined />} danger onClick={() => removePlanStep(i)} />
                  </SortablePlanRow>
                ))}
              </SortableContext>
            </DndContext>
            <Space className="mt-2 w-full justify-end">
              <Button icon={<PlusOutlined />} onClick={addPlanStep}>{t('generate.planAddStep')}</Button>
              <Button type="primary" onClick={confirmRun}><ThunderboltOutlined className="mr-1.5" />{t('generate.startExecute')}</Button>
              <Button danger icon={<CloseCircleOutlined />} onClick={cancelPlan}>{t('common.cancel')}</Button>
            </Space>
          </div>
        )}
      </Modal>

      {/* 已确认步骤预览：只读展示计划确认后进入执行的步骤清单 */}
      <Modal
        open={previewOpen}
        title={t('generate.confirmedTitle', { count: confirmedPlan?.length ?? 0 })}
        width="min(90%, 720px)"
        footer={<Button type="primary" onClick={() => setPreviewOpen(false)}>{t('common.close')}</Button>}
        onCancel={() => setPreviewOpen(false)}
      >
        <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
          {(confirmedPlan ?? []).map((p, i) => {
            let detail: string | undefined;
            if (p.kind === 'assert') {
              const type = assertTypes.find((a) => a.value === p.assertion?.type)?.label ?? p.assertion?.type ?? t('generate.assertTypes.visible');
              detail = [type, p.assertion?.expected ? t('generate.expected', { value: p.assertion.expected }) : undefined, p.assertion?.jsonPath ? t('generate.path', { value: p.assertion.jsonPath }) : undefined]
                .filter(Boolean)
                .join(' · ');
            } else if (p.action) {
              const parts = [
                STEP_ACTION_LABEL[p.action] ?? p.action,
                p.url ? t('generate.urlValue', { value: p.url }) : undefined,
                p.value !== undefined ? t('generate.value', { value: p.value }) : undefined,
                p.key ? t('generate.key', { value: p.key }) : undefined,
              ];
              detail = parts.filter(Boolean).join(' · ');
            }
            return (
              <div key={p.id ?? i} className="flex items-start gap-2 rounded-md border border-line-subtle px-2.5 py-2">
                <span className="w-5 shrink-0 pt-0.5 text-center text-[13px] text-ink-2">{i + 1}</span>
                <Tag color={p.kind === 'assert' ? 'blue' : 'default'}>{p.kind === 'assert' ? t('generate.assert') : t('generate.action')}</Tag>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] leading-[1.6] break-all">{p.instruction}</div>
                  {detail && <div className="mt-1 text-xs text-ink-2 break-all">{detail}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </Modal>

    </div>
  );
}
