import { getConfig, isConfigured, DEFAULT_SPLIT_SYSTEM_PROMPT } from '../config';
import type { TestScript, TestStep } from '../shared/testScript';
import {
  createSession,
  createSessionWithStorageState,
  sessionPage,
  createGatewayClient,
  getSession,
  friendlyBrowserLaunchError,
  onSessionBrowserClosed,
} from './stagehandManager';
import { prisma } from '../db';
import { getUsage, initUsage, ensureUsage } from './tokenUsage';
import { appendStep, upsertLog, STEP_TYPE } from './generationLogService';
import { pub, activeLogIds } from './generation/logBridge';
import { awaitPlanConfirm, cancelSessionGc, createJobRuntime, releaseJob } from './generation/jobControl';
import {
  buildEnvVarHint,
  createStepEmitter,
  createSubstituter,
  finalizeGenJob,
  loadGenAttachments,
  loadLoginStorageState,
  loadProjectViewport,
  setupGenPage,
} from './generation/sessionSetup';
import { preSplit, splitSystemWithVocab } from './generation/preSplit';
import { runGenerationLoop } from './generation/generationLoop';

export { pauseJob, confirmPlan, assistStep } from './generation/jobControl';
export type { GenerateParams, ContinueParams, PlanStep, AssistDecision } from './generation/types';
import type { ContinueParams, GenerateParams, PlanStep } from './generation/types';

/**
 * 模块①：自然语言 → 预拆分步骤计划 → 用户确认 → 逐步用 act/observe 定位执行（人在回路）。
 * 进度经 WS：gen:status / gen:plan（等待确认）/ gen:assist（定位失败三选一）/ gen:assist-status
 * / gen:tool（实时工具轨迹）/ gen:step（脚本步骤）/ gen:done / gen:error。
 */
export async function generate(jobId: string, params: GenerateParams): Promise<void> {
  if (!isConfigured()) {
    pub({ type: 'gen:error', jobId, message: '请先在「设置」中配置网关地址与密钥' });
    return;
  }
  const cfg = getConfig();
  initUsage(jobId);

  // 创建生成记录：upsertLog 允许同 jobId 续接；返回 logId 后所有 pub() 都会自动写入。
  const logId = await upsertLog(jobId, {
    projectId: params.projectId ?? null,
    testCaseId: params.testCaseId ?? null,
    nl: params.nl ?? '',
    startUrl: params.startUrl ?? null,
    status: 'RUNNING',
  });
  if (logId) activeLogIds.set(jobId, logId);
  if (logId) {
    appendStep(logId, {
      type: STEP_TYPE.USER_INPUT,
      message: params.nl ?? '',
      args: {
        startUrl: params.startUrl ?? null,
        attachments: params.attachments ?? [],
        loginConfigId: params.loginConfigId ?? null,
        projectId: params.projectId ?? null,
        testCaseId: params.testCaseId ?? null,
      },
    });
  }

  const job = createJobRuntime(jobId);
  const { abortCtrl } = job;

  try {
    const envMap = params.envMap ?? {};
    const envVarHint = buildEnvVarHint(envMap);

    // -- 附件：归一化内容（文本提取 / 图片原始图）随用户输入一起发送给模型；图片以多模态直发主模型 --
    const modelVision = cfg.openaiModelVision;
    const att = loadGenAttachments(jobId, params.attachments ?? []);
    if (!att) return;
    const { text: attachmentText, images: attachmentImages } = att;

    // -- 启动浏览器（登录配置 → 已登录态会话；项目配置的窗口尺寸一并注入）--
    let stagehand: any;
    let pwBrowser: any = null; // 精确验证用的 playwright 连接（与 stagehand 同一浏览器）
    let pwPage: any = null;
    const viewport = await loadProjectViewport(params.projectId);
    if (viewport) pub({ type: 'gen:status', jobId, message: `[浏览器窗口] 按项目配置使用 ${viewport.width}×${viewport.height}` });
    try {
      if (params.loginConfigId) {
        const login = await loadLoginStorageState(params.loginConfigId);
        pub({ type: 'gen:status', jobId, message: login.ok ? `[登录配置] 已加载「${login.name}」，以已登录状态生成` : `[登录配置] ${login.name}，以未登录状态生成` });
        stagehand = login.ok ? await createSessionWithStorageState(jobId, login.storageState, viewport) : await createSession(jobId, { viewport });
      } else {
        stagehand = await createSession(jobId, { viewport });
      }
    } catch (e) {
      if (job.isCancelled()) return;
      pub({ type: 'gen:error', jobId, message: `启动浏览器失败：${friendlyBrowserLaunchError(e)}`, usage: getUsage(jobId) });
      return;
    }
    // 用户手动关闭浏览器 -> 取消生成流程（closeSession 主动关闭前已解除该回调，不会误触发）
    onSessionBrowserClosed(jobId, () => job.cancel('浏览器已被关闭，生成已取消'));

    const steps: TestStep[] = [];
    const { sub } = createSubstituter(envMap, Date.now());
    const emit = createStepEmitter(jobId, steps, () => 0);

    try {
      const page = await sessionPage(stagehand);
      if (!page) throw new Error('浏览器页面不可用');
      const setup = await setupGenPage(jobId, page, params.projectId);
      if (setup.error) {
        if (!job.isCancelled()) pub({ type: 'gen:error', jobId, message: setup.error, usage: getUsage(jobId) });
        return;
      }
      pwBrowser = setup.pwBrowser;
      pwPage = setup.pwPage;

      // 起始页：自动导航并记录为第 0 步（保持「生成脚本必带 goto」的行为）
      if (params.startUrl) {
        const realUrl = sub(params.startUrl) ?? params.startUrl;
        await page.goto(realUrl);
        await emit({ kind: 'navigate', action: 'goto', url: params.startUrl, instruction: '打开起始页', description: '打开起始页' });
        pub({ type: 'gen:tool', jobId, index: 1, step: { actionLabel: 'goto', actionDetail: `url=${params.startUrl}`, result: `已导航到 ${await page.url()}` } });
      }

      const client = createGatewayClient(jobId);

      // ---- Phase A：预拆分 ----
      let pageCtx = '';
      if (params.startUrl) {
        try {
          pageCtx = `\n\n【当前页面】标题：${(await page.title()) || '(无标题)'}；URL：${await page.url()}`;
        } catch {
          /* 页面不可用则省略 */
        }
      }

      const systemContent = cfg.splitSystemPrompt || DEFAULT_SPLIT_SYSTEM_PROMPT;
      const userContent = `【测试目标】\n${params.nl}${attachmentText}${params.startUrl ? `\n\n起始地址：${params.startUrl}` : ''}${pageCtx}`;
      const split = await preSplit(client, cfg.openaiModel, await splitSystemWithVocab(systemContent, params.projectId), userContent, envVarHint, cfg.reasoningEffort, logId, jobId, attachmentImages);
      if (job.isCancelled()) return;
      const plan = split.steps;
      if (!plan || !plan.length) {
        pub({ type: 'gen:error', jobId, message: '预拆分未得到有效步骤，请补充更详细的描述后重试', usage: getUsage(jobId) });
        return;
      }

      const confirmed = await awaitPlanConfirm(jobId, plan, split.usage);
      if (job.isCancelled()) return;
      if (!confirmed || !confirmed.length) {
        if (!job.isCancelled()) pub({ type: 'gen:error', jobId, message: '未收到计划确认或等待超时', usage: getUsage(jobId) });
        return;
      }
      pub({ type: 'gen:status', jobId, message: `大纲已确认（${confirmed.length} 步参考），开始智能体生成…` });

      // ---- Phase B：function call 循环（LLM 在回路自主选择工具；动作成功即语义化落库）----
      // 大纲降级为软约束（拼进 system）；后续循环由 continueGenerate（续跑/常规继续）承接。
      const loopResult = await runGenerationLoop({
        jobId,
        page,
        stagehand,
        pwPage,
        client,
        cfg,
        modelVision,
        envMap,
        envVarHint,
        sub,
        emit,
        steps,
        goalText: `${params.nl}${attachmentText}${params.startUrl ? `\n起始地址：${params.startUrl}` : ''}`,
        outline: confirmed,
        projectId: params.projectId ?? null,
        logId,
        isCancelled: job.isCancelled,
        signal: abortCtrl.signal,
      });
      // 暂停：持久化循环状态（messages + 上下文），「继续生成」可 resumeLoop 读回续跑
      if (job.isPaused() && loopResult.messages.length) {
        await prisma.generationLog
          .update({
            where: { jobId },
            data: {
              loopState: {
                messages: loopResult.messages,
                goalText: `${params.nl}${attachmentText}`,
                envVarHint,
                outline: confirmed,
                projectId: params.projectId ?? null,
              } as any,
            },
          })
          .catch(() => {});
      }
      if (job.isCancelled()) return;
      if (!loopResult.ok) return;

      if (job.isCancelled()) return;
      if (!steps.length) {
        pub({ type: 'gen:error', jobId, message: '未生成任何步骤', usage: getUsage(jobId) });
        return;
      }
      const script: TestScript = { name: '生成脚本', steps };
      pub({ type: 'gen:done', jobId, script, usage: getUsage(jobId) });
    } catch (e) {
      if (!job.isCancelled()) pub({ type: 'gen:error', jobId, message: `执行失败：${String(e)}`, usage: getUsage(jobId) });
    } finally {
      // 停止（非取消）时保留浏览器会话供「继续生成」复用，超时由 GC 定时器回收
      await finalizeGenJob(jobId, { paused: job.isPaused(), pwBrowser, logId });
    }
  } finally {
    // 暂停（非取消）时保留 usage 累计与会话，供「继续生成」在同一 jobId 上接着累计；
    // 清理（pauseHandlers/waits/cancel/usage）交给接管任务的 continueGenerate 处理，
    // 否则 generate 的延迟 finally 可能清掉 continue 已重新初始化的 usage，导致步骤 token 全为 0。
    releaseJob(jobId, job.isPaused());
  }
}

/**
 * 模块①-续：停止后继续生成。复用暂停保留的浏览器会话（同一 jobId），
 * 以「已完成步骤 + 追加描述 + 当前页面截图上下文」拆分剩余步骤，确认后继续执行；
 * gen:done 下发 baseSteps + 新步骤的完整脚本（包含用户在停止期间的手动调整）。
 */
export async function continueGenerate(jobId: string, params: ContinueParams): Promise<void> {
  if (!isConfigured()) {
    pub({ type: 'gen:error', jobId, message: '请先在「设置」中配置网关地址与密钥' });
    return;
  }
  const stagehand = getSession(jobId);
  if (!stagehand) {
    pub({ type: 'gen:error', jobId, message: '浏览器会话已关闭（暂停超过 30 分钟或服务已重启），请重新生成脚本' });
    return;
  }
  // 还在 GC 宽限期内继续：取消会话回收
  cancelSessionGc(jobId);
  const cfg = getConfig();
  // 复用同一 jobId 的累计（暂停时 generate 不清 usage）：继续生成的步骤差分、最终 gen:done 总量都基于全量累计
  ensureUsage(jobId);

  // 续接同 jobId 的 log：清 finishedAt、状态回 RUNNING；并补一条「继续生成」事件
  const continueLogId = await upsertLog(jobId, {
    projectId: params.projectId ?? null,
    testCaseId: params.testCaseId ?? null,
    nl: params.nl ?? '',
    status: 'RUNNING',
  });
  if (continueLogId) activeLogIds.set(jobId, continueLogId);
  if (continueLogId) {
    appendStep(continueLogId, {
      type: STEP_TYPE.USER_INPUT,
      message: `[继续] ${params.nl ?? ''}`,
      args: { attachments: params.attachments ?? [], baseStepCount: params.baseSteps?.length ?? 0 },
    });
  }

  let pwBrowser: any = null; // 精确验证用的 playwright 连接
  let pwPage: any = null;

  const job = createJobRuntime(jobId);
  const { abortCtrl } = job;
  // 用户手动关闭浏览器 -> 取消生成流程（会话由暂停保留，此处 session 已存在，可直接注册）
  onSessionBrowserClosed(jobId, () => job.cancel('浏览器已被关闭，生成已取消'));

  try {
    const envMap = params.envMap ?? {};
    const envVarHint = buildEnvVarHint(envMap);

    const att = loadGenAttachments(jobId, params.attachments ?? []);
    if (!att) return;
    const { text: attachmentText, images: attachmentImages } = att;

    const page = await sessionPage(stagehand);
    if (!page) throw new Error('浏览器页面不可用');
    const setup = await setupGenPage(jobId, page, params.projectId);
    if (setup.error) {
      if (!job.isCancelled()) pub({ type: 'gen:error', jobId, message: setup.error, usage: getUsage(jobId) });
      return;
    }
    pwBrowser = setup.pwBrowser;
    pwPage = setup.pwPage;

    const steps: TestStep[] = [];
    const { sub } = createSubstituter(envMap, Date.now());
    const emit = createStepEmitter(jobId, steps, () => params.baseSteps.length);

    try {
      let title = '';
      let url = '';
      try {
        title = (await page.title()) || '(无标题)';
        url = await page.url();
      } catch {
        /* 页面不可用则省略 */
      }

      const client = createGatewayClient(jobId);

      // —— 续跑模式：读回暂停时保存的 messages 直接继续工具循环（不重新拆分/确认）——
      if (params.resumeLoop) {
        const saved = await prisma.generationLog.findUnique({ where: { jobId }, select: { loopState: true } });
        const st = saved?.loopState as any;
        if (st?.messages?.length) {
          const resumeResult = await runGenerationLoop({
            jobId,
            page,
            stagehand,
            pwPage,
            client,
            cfg,
            modelVision: cfg.openaiModelVision,
            envMap,
            envVarHint,
            sub,
            emit,
            steps,
            goalText: String(st.goalText ?? params.nl),
            outline: Array.isArray(st.outline) ? (st.outline as PlanStep[]) : [],
            // 续跑的大纲是完整原大纲，baseSteps 里已落库的断言计入对齐基数，避免等待步重复补插
            outlineAssertBase: params.baseSteps.filter((s) => s.kind === 'assert').length,
            baseSteps: params.baseSteps,
            projectId: params.projectId ?? null,
            logId: continueLogId,
            isCancelled: job.isCancelled,
            signal: abortCtrl.signal,
            resumeMessages: st.messages,
          });
          if (job.isCancelled()) return;
          if (!resumeResult.ok) return;
          const script: TestScript = { name: '生成脚本', steps: [...params.baseSteps, ...steps] };
          pub({ type: 'gen:done', jobId, script, usage: getUsage(jobId) });
          return;
        }
        pub({ type: 'gen:status', jobId, message: '无可续跑的循环状态，改为常规继续生成' });
      }

      const doneSummary = params.baseSteps
        .map((s, i) => `${i + 1}. [${s.kind === 'assert' ? '断言' : (s.action ?? s.kind)}] ${s.instruction ?? s.description ?? ''}`)
        .join('\n');

      const systemContent = cfg.splitSystemPrompt || DEFAULT_SPLIT_SYSTEM_PROMPT;
      const userContent = `【模式】继续生成。这是一次被中途暂停的测试，浏览器停留在当前页面。已完成步骤保留不动，请只为「从当前页面状态继续」的剩余流程拆分步骤：不要重复已完成步骤，不要输出回到起始页的 goto，计划仍必须以一条断言步骤结尾。\n\n【追加目标】\n${params.nl}${attachmentText}\n\n【已完成步骤】\n${doneSummary || '（无）'}\n\n【当前页面】标题：${title}；URL：${url}`;
      const split = await preSplit(client, cfg.openaiModel, await splitSystemWithVocab(systemContent, params.projectId), userContent, envVarHint, cfg.reasoningEffort, continueLogId, jobId, attachmentImages);
      if (job.isCancelled()) return;
      const plan = split.steps;
      if (!plan || !plan.length) {
        pub({ type: 'gen:error', jobId, message: '追加拆分未得到有效步骤，请补充更详细的描述后重试', usage: getUsage(jobId) });
        return;
      }

      const confirmed = await awaitPlanConfirm(jobId, plan, split.usage);
      if (job.isCancelled()) return;
      if (!confirmed || !confirmed.length) {
        if (!job.isCancelled()) pub({ type: 'gen:error', jobId, message: '未收到计划确认或等待超时', usage: getUsage(jobId) });
        return;
      }
      pub({ type: 'gen:status', jobId, message: `大纲已确认（${confirmed.length} 步参考），继续智能体生成…` });

      // ---- Phase B（续）：function call 循环（LLM 在回路自主选择工具；动作成功即语义化落库）----
      const loopResult = await runGenerationLoop({
        jobId,
        page,
        stagehand,
        pwPage,
        client,
        cfg,
        modelVision: cfg.openaiModelVision,
        envMap,
        envVarHint,
        sub,
        emit,
        steps,
        goalText: `【追加目标】${params.nl}${attachmentText}`,
        outline: confirmed,
        baseSteps: params.baseSteps,
        projectId: params.projectId ?? null,
        logId: continueLogId,
        isCancelled: job.isCancelled,
        signal: abortCtrl.signal,
      });
      if (job.isCancelled()) return;
      if (!loopResult.ok) return;

      if (job.isCancelled()) return;
      if (!steps.length) {
        pub({ type: 'gen:error', jobId, message: '未生成任何新步骤', usage: getUsage(jobId) });
        return;
      }
      const script: TestScript = { name: '生成脚本', steps: [...params.baseSteps, ...steps] };
      pub({ type: 'gen:done', jobId, script, usage: getUsage(jobId) });
    } catch (e) {
      if (!job.isCancelled()) pub({ type: 'gen:error', jobId, message: `执行失败：${String(e)}`, usage: getUsage(jobId) });
    } finally {
      await finalizeGenJob(jobId, { paused: job.isPaused(), pwBrowser, logId: continueLogId });
    }
  } finally {
    // 二次暂停同样保留 usage 累计与会话；清理交给下一次 continueGenerate
    releaseJob(jobId, job.isPaused());
  }
}
