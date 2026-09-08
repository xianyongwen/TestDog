import { executeLocatorAction, waitForBrowserAssertion } from './browserExecution';
import { chromium, type Page, type ConsoleMessage, type Response, type WebSocket } from 'playwright';
import path from 'node:path';
import { prisma } from '../db';
import { Prisma } from '../../generated/prisma/client';
import { publish, registerCancel, unregisterCancel } from '../ws/hub';
import type { Locator, TestStep } from '../shared/testScript';
import { substituteAll, resolveSystemVars } from '../shared/envVars';
import { readViewport, type ViewportSize } from '../shared/viewport';
import { createRunBrowser, closeSession } from './stagehandManager';
import { probeConnectivity, resolveProbeTarget } from './connectivityProbe';
import { CANDIDATE_SCRIPT } from './locatorCandidateScript';
import { enabledInpageScripts } from './pluginStore';
import { buildPluginInitScript } from './pluginRuntime';
import { installPluginPwBridge } from '../../scripts/pluginPwBridge';
import { resolveQuery, semanticizeLocator, stripTransientStateCss } from './locatorVerifier';
import { getScreenshotDir } from '../config';
import { initUsage, getUsage, clearUsage, type TokenUsage } from './tokenUsage';

export interface RunParams {
  testCaseId: string;
  scriptId?: string;
  steps: TestStep[];
  selfHeal?: boolean;
  headless?: boolean; // 无头模式：不弹出浏览器窗口（批量运行固定开启）
  loginConfigId?: string; // 登录配置：以已登录状态（storageState）创建浏览器上下文
}

/** 采集到的网络响应条目；body 为异步回填的响应体（文本类响应，截断 20KB）。 */
type NetworkEntry = { url: string; method: string; status: number; statusText: string; body?: string };

/** 采集到的 WebSocket 帧条目。direction：sent=客户端发出，received=服务端推送。 */
type WsEntry = { url: string; direction: 'sent' | 'received'; payload: string };

/** 取用例所属项目 id（插件注入按项目预设编排；用例无项目时返回 null 回落全量）。 */
async function projectOfTestCase(testCaseId: string): Promise<string | null> {
  const tc = await prisma.testCase.findUnique({ where: { id: testCaseId }, select: { projectId: true } });
  return tc?.projectId ?? null;
}

/** 取用例所属项目配置的浏览器窗口尺寸（未配置时 null = 默认 1920×1080）。 */
async function viewportOfTestCase(testCaseId: string): Promise<ViewportSize | null> {
  const tc = await prisma.testCase.findUnique({
    where: { id: testCaseId },
    select: { project: { select: { viewport: true } } },
  });
  return readViewport(tc?.project?.viewport);
}

/** 取用例所属项目的环境变量为 { key: value } 映射（运行时替换 {{key}} 用）。 */
async function loadEnvMap(testCaseId: string): Promise<Record<string, string>> {
  const tc = await prisma.testCase.findUnique({
    where: { id: testCaseId },
    select: { project: { select: { envVars: true } } },
  });
  const map: Record<string, string> = {};
  for (const v of tc?.project?.envVars ?? []) map[v.key] = v.value;
  return map;
}

/**
 * 向回放上下文注入登录态：若指定登录配置，则把其 storageState 的 cookies + localStorage
 * 注入到 connectOverCDP 拿到的默认 context（connectOverCDP 不能 newContext）。
 * 未指定/不存在/解析失败时退化为未登录，并在 logs 中告警。
 */
async function applyLoginState(context: any, loginConfigId: string | undefined, logs: string[]): Promise<void> {
  let storageState: unknown;
  if (loginConfigId) {
    const cfg = await prisma.loginConfig.findUnique({ where: { id: loginConfigId }, select: { storageState: true, name: true } });
    if (!cfg) {
      logs.push(`[警告] 登录配置 ${loginConfigId} 不存在，以未登录状态运行`);
    } else {
      // Prisma Json 字段读出即为已解析对象；兼容历史字符串。
      storageState = typeof cfg.storageState === 'string' ? safeJsonParse(cfg.storageState) : cfg.storageState;
      if (!storageState) {
        logs.push(`[警告] 登录配置「${cfg.name}」状态为空，以未登录状态运行`);
      } else {
        const origins = ((storageState as any)?.origins ?? []).map((o: any) => o.origin).filter(Boolean);
        const cookies = (storageState as any)?.cookies?.length ?? 0;
        logs.push(`[登录配置] 已加载「${cfg.name}」（来源: ${origins.join(', ') || '无'}，Cookie: ${cookies}）`);
      }
    }
  } else {
    logs.push('[登录配置] 未选择，以未登录状态运行');
  }

  // storageState 的 origins[].localStorage 是 Playwright 的 [{ name, value }] 数组，
  // 按映射遍历会把 name/value 以数字键写进 localStorage，登录态丢失（实测 "[object Object]"）。
  const ss = storageState as { cookies?: any[]; origins?: { origin: string; localStorage?: { name: string; value: string }[] }[] };
  if (ss?.cookies?.length) await context.addCookies(ss.cookies);
  const lsOrigins = (ss?.origins ?? []).filter((o) => o?.origin && Array.isArray(o?.localStorage) && o.localStorage.length);
  if (lsOrigins.length) {
    await context.addInitScript(
      (data: { origin: string; localStorage: { name: string; value: string }[] }[]) => {
        const origin = (data ?? []).find((o) => (globalThis as any).location.origin === o.origin);
        if (origin?.localStorage) {
          for (const { name, value } of origin.localStorage) localStorage.setItem(name, String(value));
        }
      },
      lsOrigins,
    );
  }
}

function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

/**
 * 把单个步骤里的占位符替换为真实值（深拷贝，不改原对象）。统一写法 {{name[:N]}}：
 * 环境变量优先（项目显式定义覆盖内置），其次系统变量（运行期内置名单）；
 * 旧写法 ${name[:N]} 作为历史脚本兼容仍会替换。替换 instruction 供自愈重新定位用；
 * url/value/locator/assertion.expected 供执行用。未定义的变量保留 {{name}} 字面量
 * 并计入 missing，便于运行前告警。sysVars 由调用方在运行开始时求值一次。
 */
function substituteStep(
  step: TestStep,
  vars: Record<string, string>,
  sysVars: Record<string, string>,
  missing: Set<string>,
): TestStep {
  const s: TestStep = { ...step };
  const sub = (t: string | undefined | null): string | undefined => substituteAll(t, vars, sysVars, missing);
  s.instruction = sub(s.instruction);
  s.url = sub(s.url);
  s.value = sub(s.value);
  if (s.locator) {
    s.locator = { ...s.locator };
    s.locator.value = sub(s.locator.value) ?? s.locator.value;
    if (s.locator.name != null) s.locator.name = sub(s.locator.name) ?? s.locator.name;
    // scope（弹层容器定位器）里的值同样替换，否则 {{baseUrl}} 等占位符会原样进入查询
    if (s.locator.scope) {
      s.locator.scope = { ...s.locator.scope };
      s.locator.scope.value = sub(s.locator.scope.value) ?? s.locator.scope.value;
      if (s.locator.scope.name != null) s.locator.scope.name = sub(s.locator.scope.name) ?? s.locator.scope.name;
    }
  }
  if (s.assertion) {
    s.assertion = { ...s.assertion };
    s.assertion.expected = sub(s.assertion.expected);
    s.assertion.jsonPath = sub(s.assertion.jsonPath);
  }
  return s;
}

/** 模块①② 统一回放引擎：playwright-core 确定性执行，失败可自愈降级；启动前先对首个 goto 的 URL 做连通性探测（快速失败）。
 *  返回最终状态；探测失败返回 PROBE_FAILED 哨兵（不 reject），供批量运行终止整批。 */
export async function runScript(jobId: string, params: RunParams): Promise<string> {
  const selfHeal = params.selfHeal !== false;
  const headless = params.headless === true;
  const run = await prisma.testRun.create({
    data: {
      testCaseId: params.testCaseId,
      scriptId: params.scriptId,
      status: 'RUNNING',
      startedAt: new Date(),
    },
  });
  publish({ type: 'run:start', jobId, runId: run.id, testCaseId: params.testCaseId });

  const logs: string[] = [];
  const stepUsages: Record<number, TokenUsage> = {};
  let pwBrowser: any; // playwright connectOverCDP 连接（回放 + 事件采集用）
  let stagehand: any; // Stagehand 实例（自愈 act/observe 用，与 pwBrowser 共用同一浏览器）
  let shPage: any; // 回放页的 Stagehand 视图（自愈直接在此页 act，看到真实失败现场）
  let useSelfHeal = selfHeal;
  let cancelled = false;
  let probeFailed = false; // 连通性探测失败标记：外层 catch 据此返回 PROBE_FAILED 哨兵

  try {
    initUsage(jobId);
    // 运行前按项目环境变量替换脚本里的 {{key}}，并按系统变量替换 {{systemTime}} 等内置变量
    // （系统变量在运行开始求值一次，保证同一次运行内 fill 写入与断言用同一时间戳）；
    // 执行与自愈用替换后的值；断言失败信息用原始指令（占位符），避免把真实值写进运行记录。
    // 旧写法 ${systemTime} 作为历史脚本兼容同样被替换（见 substituteAll）。
    // （此块自回放准备之后前移到浏览器启动之前：连通性探测需要替换后的首个 goto URL）
    const envMap = await loadEnvMap(params.testCaseId);
    const sysVars = resolveSystemVars(
      params.steps.flatMap((s) => [s.instruction, s.url, s.value, s.locator?.value, s.locator?.name, s.locator?.scope?.value, s.locator?.scope?.name, s.assertion?.expected, s.assertion?.jsonPath]),
    );
    const missingVars = new Set<string>();
    const resolvedSteps = params.steps.map((s) => substituteStep(s, envMap, sysVars, missingVars));
    if (missingVars.size) logs.push(`[警告] 未定义的环境变量：${[...missingVars].join('、')}`);

    // 取消注册前移到探测之前：探测最长 10s，此窗口内用户取消也应生效（cancelRun 会落库并推送 run:done）
    registerCancel(jobId, () => {
      cancelled = true;
      cancelRun(jobId, run.id, logs, stepUsages, async () => {
        if (pwBrowser) { try { await pwBrowser.close(); } catch { /* 忽略 */ } }
        await closeSession(jobId);
      });
    });

    // 连通性探测（运行前快速失败）：首个 goto 的目标不可达时不必启动浏览器。
    // 失败经外层 catch 统一落库/推送（run:done 仅此一处发布），以 PROBE_FAILED 哨兵返回供批量终止。
    const probeTarget = resolveProbeTarget(resolvedSteps);
    if (probeTarget) {
      try {
        const probeStatus = await probeConnectivity(probeTarget);
        if (probeStatus != null) logs.push(`[连通性探测] GET ${probeTarget} → ${probeStatus}`);
      } catch (e) {
        if (cancelled) return 'CANCELLED'; // 取消与探测失败竞态：cancelRun 已收尾，不再覆盖
        probeFailed = true;
        throw e;
      }
    }
    if (cancelled) return 'CANCELLED'; // 探测期间收到取消：cancelRun 已落库并推送 run:done，直接返回（不启动浏览器）
    // 项目级窗口尺寸：读取后注入浏览器启动（与登录配置同为项目级运行配置）
    const viewport = await viewportOfTestCase(params.testCaseId);
    if (viewport) logs.push(`[浏览器窗口] 按项目配置使用 ${viewport.width}×${viewport.height}`);
    // 方案A：回放浏览器由 Stagehand 启动（其页面扩展 world 完整），playwright 经 connectOverCDP
    // 复用同一浏览器做确定性回放 + console/network/ws 事件采集。自愈在「同一页」上 act。
    const rb = await createRunBrowser(jobId, { usageKey: jobId, headless, viewport });
    stagehand = rb.stagehand;
    pwBrowser = await chromium.connectOverCDP(`http://127.0.0.1:${rb.cdpPort}`);

    // 建回放页：Stagehand newPage 建的是扩展的 blank.html（扩展 world 注入在此页，act/observe 才能工作）。
    // chrome-launcher 的初始 about:blank 是噪音页，用 playwright 按 URL 关掉，只保留扩展页作为回放页。
    const sctx = stagehand.browser.context;
    shPage = await sctx.newPage();
    const pwContext = pwBrowser.contexts()[0];
    for (const p of await pwContext.pages()) {
      if ((await p.url()).startsWith('about:')) {
        try { await p.close(); } catch { /* 忽略 */ }
      }
    }
    // 此时唯一页面即 Stagehand 建的回放页（playwright 与 Stagehand 是同一底层标签）
    const page: Page = (await pwContext.pages())[0];
    await applyLoginState(pwContext, params.loginConfigId, logs);

    // 回放页由 Stagehand 脚本打开（Target.createTarget），Chrome 视其为「脚本打开的窗口」，
    // 会响应 window.close() 真正关掉标签；普通用户打开的标签页上 Chrome 会忽略 window.close()。
    // 目标应用在菜单导航时会触发 Chrome 原生调用 window.close()（非应用源码调用——调试器确认
    // 调用来自原生代码、无 JS 调用栈，纯 Playwright 下同样触发但被忽略），一旦关掉回放页，
    // 后续步骤全部报 "Target page, context or browser has been closed"。注入空操作保住页面
    // （init script 每次导航后重跑，任何 app 代码之前生效）。
    await pwContext.addInitScript(() => {
      (globalThis as any).close = () => {};
    });
    // 候选脚本常驻回放页：自愈语义化路径依赖 window.__tt*（语义化入口内也有守卫式注入兜底）。
    // 插件注入（preset 编排）：buildPluginInitScript 内部先运行时框架、后成员插件——
    // 插件脚本依赖 __ttPluginRuntimeInstalled__ 守卫，顺序颠倒会静默跳过注册（勿改）。
    // CANDIDATE_SCRIPT 头部虽含运行时框架，但 addInitScript 按注入顺序执行：
    // 若裸插件脚本先于它注入，插件注册会被守卫静默拦截，回放 plugin 步骤必报「插件未注入」。
    const pluginScripts = await enabledInpageScripts(await projectOfTestCase(params.testCaseId));
    if (pluginScripts.length) {
      await pwContext.addInitScript(buildPluginInitScript(pluginScripts));
      // Playwright 桥：页内插件动作经 pw.* 以 RPC 调真实 Playwright API（失败不阻塞回放，动作内报「桥未注入」）
      try {
        await installPluginPwBridge(pwContext);
      } catch (e) {
        logs.push(`[警告] Playwright 桥注入失败，插件内 pw 不可用：${String(e)}`);
      }
    }
    await pwContext.addInitScript(CANDIDATE_SCRIPT);

    // 步骤级 console / network 采集（累积整次运行，失败步骤取当前快照）
    const consoleEntries: { type: string; text: string }[] = [];
    const networkEntries: NetworkEntry[] = [];
    const wsEntries: WsEntry[] = [];
    page.on('console', (msg: ConsoleMessage) => {
      consoleEntries.push({ type: msg.type(), text: msg.text() });
    });
    page.on('response', (res: Response) => {
      try {
        const entry: NetworkEntry = {
          url: res.url(),
          method: res.request().method(),
          status: res.status(),
          statusText: res.statusText(),
        };
        networkEntries.push(entry);
        // 异步读取响应体回填（仅文本类响应；body 只能读一次，失败静默）。
        const ct = res.headers()['content-type'] ?? '';
        if (ct === '' || /(json|text|html|xml|javascript|form-urlencoded)/i.test(ct)) {
          res
            .text()
            .then((body) => {
              entry.body = body.length > 20000 ? body.slice(0, 20000) + '…[截断]' : body;
            })
            .catch(() => {
              /* 无 body 或连接已关闭 */
            });
        }
      } catch {
        /* 忽略已关闭的请求 */
      }
    });

    // WebSocket 帧采集：framesent=客户端发出，framereceived=服务端推送
    page.on('websocket', (ws: WebSocket) => {
      const url = ws.url();
      ws.on('framesent', (frame: { payload: string | Buffer }) => {
        wsEntries.push({ url, direction: 'sent', payload: String(frame.payload) });
      });
      ws.on('framereceived', (frame: { payload: string | Buffer }) => {
        wsEntries.push({ url, direction: 'received', payload: String(frame.payload) });
      });
    });

    let allPass = true;
    for (let i = 0; i < resolvedSteps.length; i++) {
      if (cancelled) break;
      const step = resolvedSteps[i];
      const orig = params.steps[i];
      const started = Date.now();
      let status = 'PASSED';
      let message: string | undefined;
      let healed = false;
      let healedLocator: Locator | undefined;

      try {
        await executeStep(page, step, networkEntries, wsEntries);
      } catch (e) {
        if (useSelfHeal && !cancelled && step.instruction && step.locator?.strategy !== 'response' && step.locator?.strategy !== 'websocket') {
          const before = { ...getUsage(jobId) };
          try {
            const outcome = await selfHealStep(stagehand, shPage, page, step);
            healed = outcome.healed;
            healedLocator = outcome.locator;
          } catch {
            healed = false;
          }
          const after = getUsage(jobId);
          stepUsages[i] = {
            inputTokens: after.inputTokens - before.inputTokens,
            outputTokens: after.outputTokens - before.outputTokens,
            totalTokens: after.totalTokens - before.totalTokens,
            cachedTokens: after.cachedTokens - before.cachedTokens,
          };
        }
        if (healed) {
          status = 'PASSED';
          message = '已自愈（智能体重新定位）';
        } else {
          status = 'FAILED';
          message = step.action === 'assert'
            ? `断言失败：${orig.instruction ?? ''}（${String(e)}）`
            : String(e);
          allPass = false;
        }
      }

      const durationMs = Date.now() - started;

      // 失败步骤：截图 + 采集 console / network
      let screenshot: string | undefined;
      let consoleLog: string | undefined;
      let networkLog: string | undefined;
      if (status === 'FAILED') {
        try {
          screenshot = await captureScreenshot(page, run.id, i);
        } catch {
          /* 截图失败不影响主流程 */
        }
        consoleLog = consoleEntries.length > 0 ? JSON.stringify(consoleEntries) : undefined;
        networkLog = networkEntries.length > 0 ? JSON.stringify(networkEntries) : undefined;
      }

      await prisma.stepResult.create({
        data: { runId: run.id, stepIndex: i, action: step.action, status, message, durationMs, healed, healedLocator: healedLocator ?? Prisma.DbNull, screenshot, consoleLog, networkLog },
      });
      publish({ type: 'run:step', jobId, runId: run.id, index: i, status, message, durationMs, healed, usage: stepUsages[i] });
      logs.push(`[${i}] ${step.action} → ${status}${healed ? '(自愈)' : ''}${message ? `：${message}` : ''}`);
    }

    if (cancelled) return 'CANCELLED'; // cancelRun 已落库并推送 run:done

    const usage = { ...getUsage(jobId) };
    await prisma.testRun.update({
      where: { id: run.id },
      data: { status: allPass ? 'PASSED' : 'FAILED', finishedAt: new Date(), logs: logs.join('\n'), meta: { usage, stepUsages } as any },
    });
    publish({ type: 'run:done', jobId, runId: run.id, status: allPass ? 'PASSED' : 'FAILED', usage });
    return allPass ? 'PASSED' : 'FAILED';
  } catch (e) {
    if (cancelled) return 'CANCELLED'; // 取消与失败竞态：cancelRun 已落库并推送 run:done，不再覆盖
    const usage = { ...getUsage(jobId) };
    await prisma.testRun.update({
      where: { id: run.id },
      data: { status: 'ERROR', finishedAt: new Date(), logs: [...logs, String(e)].join('\n'), meta: { usage, stepUsages } as any },
    });
    publish({ type: 'run:done', jobId, runId: run.id, status: 'ERROR', message: String(e), usage });
    return probeFailed ? 'PROBE_FAILED' : 'ERROR';
  } finally {
    unregisterCancel(jobId);
    clearUsage(jobId);
    // 先关 playwright 连接，再关 Stagehand 会话（连同其启动的浏览器）
    if (pwBrowser) {
      try {
        await pwBrowser.close();
      } catch {
        /* 忽略 */
      }
    }
    if (stagehand) {
      await closeSession(jobId);
    }
  }
}

/**
 * 批量运行：按顺序逐个用例回放（固定无头模式）。每个用例优先使用
 * scriptIds[testCaseId] 指定的版本；未指定时取最新版本。
 * 进度经 WS 推送：batch:case（每个用例开始/结束）+ run:step（步骤级，复用 runScript）+ batch:done（汇总）。
 * 单个用例被取消（CANCELLED）时终止整个批量；任一用例连通性探测失败（PROBE_FAILED）同样终止，
 * 剩余用例标记 SKIPPED（探测失败=目标环境不可达，重跑其余用例必然同样失败）。
 */
export async function runBatch(
  jobId: string,
  testCaseIds: string[],
  opts: { selfHeal?: boolean; loginConfigId?: string; scriptIds?: Record<string, string> } = {},
): Promise<void> {
  const total = testCaseIds.length;
  const summary: { testCaseId: string; title: string; status: string }[] = [];

  for (let i = 0; i < testCaseIds.length; i++) {
    const testCaseId = testCaseIds[i];
    const tc = await prisma.testCase.findUnique({
      where: { id: testCaseId },
      include: { scripts: { orderBy: { version: 'desc' } } },
    });
    const title = tc?.title ?? testCaseId;
    // 优先级：本次批量显式指定的 scriptIds[testCaseId] → 用例保存的默认版本 defaultScriptId → 最新版本。
    const requestedId = opts.scriptIds?.[testCaseId] ?? tc?.defaultScriptId ?? undefined;
    const script = tc?.scripts.find((s) => s.id === requestedId) ?? tc?.scripts[0];
    const steps = ((script?.steps as TestStep[] | undefined) ?? []) as TestStep[];

    if (!tc || !script || !steps.length) {
      publish({ type: 'batch:case', jobId, testCaseId, title, index: i, total, status: 'SKIPPED', message: '没有可运行的脚本' });
      summary.push({ testCaseId, title, status: 'SKIPPED' });
      continue;
    }

    publish({ type: 'batch:case', jobId, testCaseId, title, index: i, total, status: 'RUNNING' });
    const status = await runScript(jobId, {
      testCaseId,
      scriptId: script.id,
      steps,
      selfHeal: opts.selfHeal,
      loginConfigId: opts.loginConfigId,
      headless: true, // 批量运行固定无头
    });
    // PROBE_FAILED 是内部哨兵：探测失败=目标环境不可达，重跑其余用例必然同样失败，
    // 直接终止批量并把剩余用例标记 SKIPPED；对外一律转成 ERROR，原始哨兵字符串不下发 UI。
    if (status === 'PROBE_FAILED') {
      publish({ type: 'batch:case', jobId, testCaseId, title, index: i, total, status: 'ERROR', message: '连通性探测失败，已终止批量运行' });
      summary.push({ testCaseId, title, status: 'ERROR' });
      const restIds = testCaseIds.slice(i + 1);
      if (restIds.length) {
        const rows = await prisma.testCase.findMany({ where: { id: { in: restIds } }, select: { id: true, title: true } });
        const titleOf = new Map(rows.map((r) => [r.id, r.title]));
        for (let j = i + 1; j < testCaseIds.length; j++) {
          const rid = testCaseIds[j];
          const rtitle = titleOf.get(rid) ?? rid;
          publish({ type: 'batch:case', jobId, testCaseId: rid, title: rtitle, index: j, total, status: 'SKIPPED', message: '已跳过：连通性探测失败' });
          summary.push({ testCaseId: rid, title: rtitle, status: 'SKIPPED' });
        }
      }
      break; // batch:done 由循环后统一推送
    }
    publish({ type: 'batch:case', jobId, testCaseId, title, index: i, total, status });
    summary.push({ testCaseId, title, status });

    if (status === 'CANCELLED') break; // 用户取消当前用例 → 终止整个批量
  }

  publish({ type: 'batch:done', jobId, summary });
}

/** 将当前页面截图保存为 PNG，返回文件名。 */
async function captureScreenshot(page: Page, runId: string, stepIndex: number): Promise<string> {
  const dir = getScreenshotDir();
  const filename = `${runId}_${stepIndex}.png`;
  await page.screenshot({ path: path.join(dir, filename), type: 'png', fullPage: true });
  return filename;
}

/** 在 root（page 或已命中的容器定位器）内解析一条定位查询：共享实现见 locatorVerifier.resolveQuery。 */
function buildLocator(page: Page, loc: Locator | undefined) {
  if (!loc) throw new Error('步骤缺少定位器');
  // 作用域定位器（如模态框）：先命中容器，再在容器内执行主定位，避免 body 下弹层序号漂移
  const root = loc.scope ? resolveQuery(page, loc.scope) : page;
  return resolveQuery(root, loc);
}

/** 回放定位器解析：css 步骤 0 命中时剔除瞬态状态类重试一次（count() 立即返回，不等待）。
 *  兼容历史步骤：生成期 css 兜底可能编入交互态类（checked/selected/open/loading…），
 *  回放该步的页面初始态必不命中；剔除后唯一命中则改用剔除版，避免 10s 超时后必然落入自愈。
 *  剔除后多命中（状态类是唯一区分项）时维持原定位器，交由超时→自愈按指令重新定位。 */
async function resolveStepLocator(page: Page, step: TestStep) {
  const loc = buildLocator(page, step.locator);
  if (step.locator?.strategy !== 'css') return loc;
  try {
    if ((await loc.count()) > 0) return loc;
  } catch {
    return loc; // 查询异常走常规超时/自愈
  }
  const stripped = stripTransientStateCss(step.locator.value);
  if (!stripped || stripped === step.locator.value) return loc;
  try {
    const strippedLoc = buildLocator(page, { ...step.locator, value: stripped });
    return (await strippedLoc.count()) === 1 ? strippedLoc : loc;
  } catch {
    return loc;
  }
}

async function executeStep(page: Page, step: TestStep, networkEntries: NetworkEntry[], wsEntries: WsEntry[]): Promise<void> {
  switch (step.action) {
    case 'goto':
      if (!step.url) throw new Error('goto 缺少 url');
      await page.goto(step.url);
      break;
    case 'click':
    case 'fill':
    case 'press':
    case 'check':
    case 'select':
      await executeLocatorAction(await resolveStepLocator(page, step), step, 10000);
      break;
    case 'assert':
      await runAssertion(page, step, networkEntries, wsEntries);
      break;
    case 'wait':
      await page.waitForTimeout(step.value ? Number(step.value) : 1000);
      break;
    case 'plugin': {
      // 语义动作步骤回放：按语义动作名重走匹配链（页内 resolveChain 按「detect 命中 && 注册了该动作」
      // 过滤，顺序即 preset 注入优先级）；生成期 pluginId 仅作优先尝试提示（已不存在的旧提示自动跳过）。
      // 翻页/等待类闭环逻辑在页内实现（状态相关步数无法静态落库）。
      // 插件链全败 → 原生交互兜底（与生成期分发器同策略）→ 仍失败抛给通用自愈。
      const pa = step.pluginAction;
      if (!pa?.action) throw new Error('plugin 步骤缺少 pluginAction（action）');
      // resolveStepLocator 内含 css 0 命中时的瞬态状态类剔除重试（历史步骤兼容）
      let handle = step.locator
        ? await (await resolveStepLocator(page, step)).elementHandle({ timeout: 10000 }).catch(() => null)
        : null;
      const runChainInPage = page.evaluate(
        async ([act, target, actionArgs, hintId]: any[]) => {
          const reg = (globalThis as any).__ttPluginRegistry__;
          if (!reg) throw new Error('页面未注入插件运行时：请检查项目的组件预设');
          const el = target && target.isConnected ? target : null;
          if (!el && !actionArgs?.allowNoElement) throw new Error('目标元素未命中且未声明 allowNoElement');
          // 链顺序：pluginId 提示优先（生成期命中者），其余成员按 preset 优先级
          const chain: any[] = el ? reg.resolveChain(el, act) : [];
          const ordered: string[] = [...(hintId ? [hintId] : []), ...chain.map((c: any) => c.id).filter((id: string) => id !== hintId)];
          const attempted: string[] = [];
          let last = '';
          for (const pid of ordered) {
            attempted.push(pid);
            try {
              const r = await reg.invokeAction(pid, act, el, actionArgs ?? {});
              // 运行时已归一化三态（string→success / throw→failed / 对象→显式）：
              // failed → 链上下一个；success/uncertain（fn 成功但后验自身异常）按回放成功处理
              if (r && typeof r === 'object' && r.status === 'failed') {
                last = r.message || last;
                continue;
              }
              return typeof r === 'object' && r != null ? String(r.message ?? '') : String(r ?? '');
            } catch (e) {
              last = String((e && (e as any).message) || e);
            }
          }
          throw new Error(`语义动作 ${act} 在插件链上全部失败（尝试：${attempted.join(' → ') || '无匹配插件'}）。${last}`);
        },
        [pa.action, handle, pa.args ?? {}, pa.pluginId ?? null] as any,
      );
      try {
        // Node 侧超时兜底（页内动作应自限；链重试 + 外层保险 30s）
        await Promise.race([
          runChainInPage,
          new Promise((_, reject) => setTimeout(() => reject(new Error(`语义动作 ${pa.action} 插件链执行超时（30s）`)), 30000)),
        ]);
      } catch (chainErr) {
        // 原生交互兜底（与生成期分发器同策略）；仍失败抛原始链错误 → 通用自愈
        try {
          if (!step.locator) throw chainErr;
          // 与上方 handle 同源（含瞬态状态类剔除），避免原始 css 0 命中时白等超时
          const fallbackLoc = await resolveStepLocator(page, step);
          // select 动作的原生兜底：对原生 <select> 走 selectOption
          if (pa.action === 'select' && step.value != null) {
            await fallbackLoc.selectOption(step.value, { timeout: 10000 });
          } else if (step.value != null) {
            await fallbackLoc.fill(step.value, { timeout: 10000 });
            await page.keyboard.press('Enter');
          } else {
            await fallbackLoc.click({ timeout: 10000 });
          }
        } catch {
          throw chainErr;
        }
      }
      break;
    }
    case 'raw':
      // 原始代码行：MVP 跳过（已在前端提示）
      break;
    default:
      throw new Error(`未知动作：${step.action}`);
  }
}

async function runAssertion(page: Page, step: TestStep, networkEntries: NetworkEntry[], wsEntries: WsEntry[]): Promise<void> {
  const a = step.assertion;
  if (!a) throw new Error('断言缺少条件');
  // 接口响应断言：locator.strategy='response'，不经过 buildLocator。
  if (step.locator?.strategy === 'response') {
    await runResponseAssertion(step.locator.value, a, networkEntries);
    return;
  }
  // WebSocket 断言：locator.strategy='websocket'，不经过 buildLocator。
  if (step.locator?.strategy === 'websocket') {
    await runWebsocketAssertion(step.locator.value, a, wsEntries);
    return;
  }
  // 无定位器的历史 hidden 断言保持兼容。
  if (a.type === 'hidden' && !step.locator) return;
  const loc = step.locator && a.type !== 'url' ? buildLocator(page, step.locator) : undefined;
  await waitForBrowserAssertion({ page, locator: loc, type: a.type, expected: a.expected, timeoutMs: 10000 });
}

/**
 * 接口响应断言：按 URL 关键词匹配运行中最近一次命中的响应，
 * 对其状态码 / 响应体包含文本 / 响应体 JSON 字段值做断言。
 */
async function runResponseAssertion(
  urlMatch: string | undefined,
  a: NonNullable<TestStep['assertion']>,
  networkEntries: NetworkEntry[],
): Promise<void> {
  if (!urlMatch) throw new Error('接口响应断言缺少 URL 匹配串');
  const needBody = a.type === 'response_body' || a.type === 'response_json';
  const matched = await findMatchedResponse(urlMatch, needBody, networkEntries);
  if (!matched) throw new Error(`未找到匹配「${urlMatch}」的接口响应`);

  if (a.type === 'response_status') {
    const expected = a.expected?.trim();
    if (expected && !String(matched.status).includes(expected)) {
      throw new Error(`状态码断言失败：实际 ${matched.status}，期望含「${expected}」`);
    }
    return;
  }
  if (a.type === 'response_body') {
    const body = matched.body ?? '';
    if (a.expected && !body.includes(a.expected)) {
      throw new Error(`响应体断言失败：响应体未包含「${a.expected}」`);
    }
    return;
  }
  // response_json
  if (matched.body === undefined) throw new Error('响应体未采集到，无法按 JSON 字段断言');
  let json: unknown;
  try {
    json = JSON.parse(matched.body);
  } catch {
    throw new Error('响应体非合法 JSON，无法按字段断言');
  }
  const actual = getByPath(json, a.jsonPath ?? '');
  if (a.expected != null && String(actual) !== a.expected) {
    throw new Error(`JSON 字段断言失败：字段「${a.jsonPath}」实际「${String(actual)}」，期望「${a.expected}」`);
  }
}

/** 倒序查找匹配 URL 的响应；轮询等待响应到达（最多 ~5s），needBody 时额外等待异步回填的 body。 */
async function findMatchedResponse(
  urlMatch: string,
  needBody: boolean,
  networkEntries: NetworkEntry[],
): Promise<NetworkEntry | undefined> {
  const find = (requireBody: boolean) =>
    [...networkEntries].reverse().find((e) => e.url.includes(urlMatch) && (!requireBody || e.body !== undefined));
  let matched = find(needBody);
  for (let i = 0; i < 100 && !matched; i++) {
    await new Promise((r) => setTimeout(r, 50));
    matched = find(needBody);
  }
  return matched ?? find(false);
}

/** 按点分路径取值（支持数组下标，如 data.items.0.id）；缺失返回 undefined。 */
function getByPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  let cur: unknown = obj;
  for (const seg of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

/**
 * WebSocket 断言：按 URL 关键词匹配 WS 连接，对发送/接收消息做断言。
 * jsonPath 有值时按 JSON 字段值断言，否则按 payload 包含文本断言；
 * expected 为空时只要存在匹配方向的消息即通过。任一条匹配帧命中即通过。
 */
async function runWebsocketAssertion(
  urlMatch: string | undefined,
  a: NonNullable<TestStep['assertion']>,
  wsEntries: WsEntry[],
): Promise<void> {
  if (!urlMatch) throw new Error('WebSocket 断言缺少 URL 匹配串');
  const direction = a.type === 'ws_sent' ? 'sent' : 'received';
  const expected = a.expected ?? '';
  const jsonPath = a.jsonPath;
  const match = (payload: string): boolean => {
    if (!expected) return true;
    if (jsonPath) {
      try {
        return String(getByPath(JSON.parse(payload), jsonPath)) === expected;
      } catch {
        return false;
      }
    }
    return payload.includes(expected);
  };
  const found = await findMatchedWsFrame(urlMatch, direction, match, wsEntries);
  if (found) return;
  const last = [...wsEntries].reverse().find((e) => e.url.includes(urlMatch) && e.direction === direction);
  const dirLabel = direction === 'sent' ? '发送' : '接收';
  const hint = last
    ? `，最近一条消息：${last.payload.slice(0, 200)}`
    : `，未采集到匹配「${urlMatch}」的 ${dirLabel} 消息`;
  throw new Error(`WebSocket ${dirLabel}断言失败：未找到包含「${expected}」的消息${hint}`);
}

/** 轮询查找匹配 URL+方向且满足 predicate 的帧，最多等待 ~5s。 */
async function findMatchedWsFrame(
  urlMatch: string,
  direction: 'sent' | 'received',
  predicate: (payload: string) => boolean,
  wsEntries: WsEntry[],
): Promise<WsEntry | undefined> {
  const find = () => wsEntries.find((e) => e.url.includes(urlMatch) && e.direction === direction && predicate(e.payload));
  let matched = find();
  for (let i = 0; i < 100 && !matched; i++) {
    await new Promise((r) => setTimeout(r, 50));
    matched = find();
  }
  return matched;
}

/** 自愈结果：是否自愈成功，以及重新定位得到的新定位器（已语义化，供采纳回原脚本）。 */
interface HealOutcome {
  healed: boolean;
  locator?: Locator;
}

/** 自愈：在同一回放页上用 AI 重新定位执行指令（方案A：回放页即 Stagehand 自建页，world 完整，
 *  看到的 100% 是失败现场——登录态、已填表单、JS 新增 DOM 全都在）。
 *  act/observe 产物（XPath）经语义化（playwright 精确验证唯一 + 同节点）后写回，
 *  避免把不稳定 XPath 种进脚本。page 为与 shPage 同一底层标签的 playwright 视图。 */
async function selfHealStep(stagehand: any, shPage: any, page: Page, step: TestStep): Promise<HealOutcome> {
  if (!step.instruction) return { healed: false };
  const semantic = async (sel: string | undefined): Promise<Locator | undefined> =>
    sel ? semanticizeLocator(page, sel, { mode: 'playwright' }) : undefined;
  try {
    // 断言步：用 observe 重新定位（只查找不执行动作）。找到可见元素才自愈通过；
    // 找不到说明元素确实不存在，保持失败。若改用 act 会去点击/操作元素，既会误判通过又会污染页面状态。
    if (step.action === 'assert') {
      if (step.assertion?.type === 'url') return { healed: false }; // URL 断言为确定性比较，不自愈
      if (step.assertion?.type === 'hidden') return { healed: false }; // 不可见断言：期望元素不存在/隐藏，AI 重新定位会反向操作，不自愈
      const { data: actions } = await stagehand.observe(step.instruction, { page: shPage });
      if (Array.isArray(actions) && actions.length > 0) {
        const locator = await semantic(actions[0]?.selector);
        // text 断言：自愈只重定位，文本包含校验仍要硬做——observe 按指令语义选中的元素未必含期望文本，
        // 不比对会把真实断言失败误报成「已自愈」。语义化产物是描述符，需 buildLocator 还原为 Playwright 定位器；
        // 异常抛给外层 catch → healed:false。
        if (step.assertion?.type === 'text' && step.assertion.expected && locator) {
          const text = (await buildLocator(page, locator).textContent()) ?? '';
          if (!text.includes(step.assertion.expected)) return { healed: false };
        }
        return { healed: true, locator };
      }
      return { healed: false };
    }
    // act 找不到定位器时不抛异常，而是返回 data.success:false 且 actions 为空，
    // 必须据此判失败，否则会误报"已自愈"而步骤其实未执行。
    const res = await stagehand.act(step.instruction, { page: shPage });
    if (res?.data?.success && Array.isArray(res.data.actions) && res.data.actions.length > 0) {
      return { healed: true, locator: await semantic(res.data.actions[0]?.selector) };
    }
    return { healed: false };
  } catch {
    return { healed: false };
  }
}

async function cancelRun(jobId: string, runId: string, logs: string[], stepUsages: Record<number, TokenUsage>, close: () => Promise<void>) {
  try {
    await close();
  } catch {
    /* 忽略 */
  }
  const usage = { ...getUsage(jobId) };
  await prisma.testRun.update({
    where: { id: runId },
    data: { status: 'CANCELLED', finishedAt: new Date(), logs: [...logs, '用户取消'].join('\n'), meta: { usage, stepUsages } as any },
  });
  publish({ type: 'run:done', jobId, runId, status: 'CANCELLED', usage });
}
