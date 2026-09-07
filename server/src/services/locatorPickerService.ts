import { chromium, type Browser, type Page } from 'playwright';
import { prisma } from '../db';
import { browserLaunchOptions, DEFAULT_VIEWPORT } from '../browser';
import type { Locator } from '../shared/testScript';
import type { ViewportSize } from '../shared/viewport';
import { readViewport } from '../shared/viewport';
import { PICKER_SCRIPT } from './pickerScript';
import { verifyCandidates, type VerifyResult } from './locatorVerifier';
import { enabledInpageScripts } from './pluginStore';
import { buildPluginInitScript } from './pluginRuntime';
import type { PickCandidate } from './locatorCandidateScript';
export type { PickScope, PickCandidate } from './locatorCandidateScript';

/** 拾取会话：启动一个 headed 浏览器打开目标页，注入拾取脚本，用户点击元素后返回定位器。 */
interface PickSession {
  browser: Browser;
  page: Page;
  state: 'pending' | 'done' | 'cancelled' | 'error';
  locator?: Locator;
  error?: string;
  closed: boolean;
  timer?: NodeJS.Timeout;
  ttl?: NodeJS.Timeout;
}

const sessions = new Map<string, PickSession>();

const POLL_INTERVAL_MS = 200;
const SESSION_TTL_MS = 10 * 60 * 1000; // 兜底：超时自动关闭，避免泄漏浏览器进程

function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

/**
 * 拾取浏览器窗口尺寸解析：显式 projectId（用例详情/生成页等已知项目上下文）优先，
 * 其次登录配置所属项目；项目存在但未配置 → 默认 1920×1080；两处均无 → null（默认）。
 */
async function resolvePickViewport(projectId?: string, loginConfigId?: string): Promise<ViewportSize | null> {
  if (projectId) {
    const p = await prisma.project.findUnique({ where: { id: projectId }, select: { viewport: true } });
    if (p) return readViewport(p.viewport);
  }
  if (loginConfigId) {
    const cfg = await prisma.loginConfig.findUnique({
      where: { id: loginConfigId },
      select: { project: { select: { viewport: true } } },
    });
    if (cfg) return readViewport(cfg.project?.viewport);
  }
  return null;
}

/** 启动拾取会话：打开目标 URL，注入拾取脚本，随后由用户点击元素。 */
export async function startPick(pickId: string, url: string, loginConfigId?: string, projectId?: string): Promise<void> {
  // 登录态：复用登录配置的 storageState（cookie + localStorage），不存在则退化为未登录
  let storageState: unknown;
  if (loginConfigId) {
    const cfg = await prisma.loginConfig.findUnique({ where: { id: loginConfigId }, select: { storageState: true } });
    if (cfg?.storageState) {
      storageState = typeof cfg.storageState === 'string' ? safeJsonParse(cfg.storageState) : cfg.storageState;
    }
  }
  const viewport = await resolvePickViewport(projectId, loginConfigId);

  let browser: Browser | undefined;
  try {
    // 窗口与视口同尺寸：launch 的 --window-size 由 browserLaunchOptions 按 viewport 生成
    browser = await chromium.launch({ ...browserLaunchOptions({ headless: false, viewport: viewport ?? undefined }) });
    const context = storageState ? await browser.newContext({ storageState: storageState as any, viewport: viewport ?? DEFAULT_VIEWPORT }) : await browser.newContext({ viewport: viewport ?? DEFAULT_VIEWPORT });
    const page = await context.newPage();
    // 插件注入（拾取无项目上下文，回落全部插件）：运行时框架+插件脚本先行，随后才是拾取脚本
    const pluginScripts = await enabledInpageScripts();
    if (pluginScripts.length) await page.addInitScript(buildPluginInitScript(pluginScripts));
    await page.addInitScript(PICKER_SCRIPT);
    await page.goto(url, { timeout: 30000, waitUntil: 'domcontentloaded' });

    const session: PickSession = { browser, page, state: 'pending', closed: false };
    sessions.set(pickId, session);

    // 用户直接关掉浏览器窗口 -> 视为取消
    browser.on('disconnected', () => {
      void finalize(pickId, { state: 'cancelled' });
    });

    // 轮询页面里的拾取结果（点击后由脚本写入 window.__testToolPick__）
    session.timer = setInterval(() => {
      void (async () => {
        const s = sessions.get(pickId);
        if (!s || s.state !== 'pending' || s.closed) return;
        let val: unknown = null;
        try {
          val = await s.page.evaluate(() => (globalThis as any).__testToolPick__ ?? null);
        } catch {
          return; // 页面导航/关闭中，忽略本轮
        }
        if (!val || typeof val !== 'object') return;
        const v = val as { type?: string; candidates?: PickCandidate[] };
        if (v.type === 'preview') {
          // 预览：用真实 Playwright 验证候选并把结果回写页面，让预览栏显示最终会落库的定位器（预览即所见）
          // 注意：预览栏读取 __testToolPickResult__.locator，须以 { locator } 包装，直接写 Locator 对象会恒判失败
          const result = await verifyLocators(s.page, v.candidates ?? []);
          await s.page
            .evaluate((loc) => {
              (globalThis as any).__testToolPickResult__ = { locator: loc };
            }, result.locator ?? null)
            .catch(() => {});
        } else if (v.type === 'pick') {
          const result = await verifyLocators(s.page, v.candidates ?? []);
          if (result.locator) await finalize(pickId, { state: 'done', locator: result.locator });
          else
            await finalize(pickId, {
              state: 'error',
              error: `未能生成唯一可用的定位器（已检查：${result.tried.join('，')}），请重试或换一个元素`,
            });
        } else if (v.type === 'cancel') {
          await finalize(pickId, { state: 'cancelled' });
        }
      })();
    }, POLL_INTERVAL_MS);

    session.ttl = setTimeout(() => {
      void finalize(pickId, { state: 'cancelled' });
    }, SESSION_TTL_MS);
  } catch (e) {
    if (browser) {
      try {
        await browser.close();
      } catch {
        /* 忽略 */
      }
    }
    throw e;
  }
}

export function getPick(pickId: string): { status: string; locator?: Locator; error?: string } | undefined {
  const s = sessions.get(pickId);
  if (!s) return undefined;
  return { status: s.state, locator: s.locator, error: s.error };
}

export async function cancelPick(pickId: string): Promise<void> {
  const s = sessions.get(pickId);
  if (!s) return;
  if (s.state === 'pending' && !s.closed) {
    await finalize(pickId, { state: 'cancelled' });
  } else if (!s.closed) {
    s.closed = true;
    try {
      await s.browser.close();
    } catch {
      /* 忽略 */
    }
  }
}

async function finalize(pickId: string, result: { state: 'done' | 'cancelled' | 'error'; locator?: Locator; error?: string }): Promise<void> {
  const s = sessions.get(pickId);
  if (!s || s.closed) return;
  s.closed = true;
  s.state = result.state;
  s.locator = result.locator;
  s.error = result.error;
  if (s.timer) clearInterval(s.timer);
  if (s.ttl) clearTimeout(s.ttl);
  try {
    await s.browser.close();
  } catch {
    /* 忽略 */
  }
  // 保留会话记录供前端读取结果，短时后清理
  setTimeout(() => sessions.delete(pickId), 60_000);
}

/**
 * 验证用户拾取到的候选定位器（薄封装，验证逻辑在共享 locatorVerifier.verifyCandidates）：
 * count===1 且命中元素与用户点击的元素是同一节点；目标已被 SPA 重渲染替换（引用脱离文档）时，
 * 若 URL 未变则退化为仅按唯一性采信。返回首个通过的候选。
 */
export async function verifyLocators(page: Page, candidates: PickCandidate[]): Promise<VerifyResult> {
  const target = await page.evaluateHandle(() => (globalThis as any).__testToolPickEl__ ?? null).catch(() => null);
  if (!target) return { tried: ['目标元素已失效'] };

  const targetInfo = (await target
    .evaluate((n: any) => (n && n.nodeType === 1 ? { connected: n.isConnected } : null))
    .catch(() => null)) as { connected: boolean } | null;
  if (!targetInfo) {
    await target.dispose().catch(() => {});
    return { tried: ['目标元素已失效'] };
  }
  // 目标已脱离文档：仅在 URL 未变时允许按唯一性降级采信（避免跨导航误匹配）
  let fallback = false;
  if (!targetInfo.connected) {
    const pickUrl = await page.evaluate(() => (globalThis as any).__testToolPickUrl__ ?? '').catch(() => '');
    fallback = !!pickUrl && page.url() === pickUrl;
  }

  const res = await verifyCandidates(page, target, candidates, { fallback, enableRecompute: !fallback });
  await target.dispose().catch(() => {});
  return res;
}
