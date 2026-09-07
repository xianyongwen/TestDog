/**
 * 视觉帧服务（零依赖，确定性）：
 * - 视口截图 png → sha256 帧哈希（两帧逐字节一致 = 渲染完全稳定，动画/加载已结束）
 * - waitStable：连续 N 帧相等即「页面稳定」，替代固定 blind sleep（组件库动画场景的关键提分项）
 * - effectCheck：动作前后帧哈希对比，判定「点击是否生效」（无变化回灌提示模型换路径）
 *
 * 说明：变化区域 bbox 反查（diff 定位变化范围并映射回元素序号）需要 PNG 解码，
 * 当前以帧哈希二元判定（相等/不等）满足第 0 层需求；区域级 diff 留作后续增强（引入图像库时）。
 */
import { createHash } from 'node:crypto';

const DEFAULT_INTERVAL_MS = 200;
const DEFAULT_MAX_MS = 3000;
const STABLE_REQUIRED = 2; // 连续相等帧数（1 次比较 = 2 帧）

/** 视口截图 png 的 sha256（scale:'css' 保证 dpr=1 语义）。 */
export async function shotHash(pwPage: any): Promise<string> {
  const buf: Buffer = await pwPage.screenshot({ type: 'png', scale: 'css' });
  return createHash('sha256').update(buf).digest('hex');
}

/** 发模型的 JPEG 质量：浏览器内编码完成，1080p 文本场景实测体积约为 PNG 的 1/5 且读字无损。 */
const MODEL_JPEG_QUALITY = 80;

/**
 * 视口截图 base64（see 工具发模型用）：JPEG 有损压缩——同分辨率降质量（恒 384 token
 * 计价模型下 resize 降分辨率是纯损失，故只压质量不缩尺寸）；clip 为可选区域裁剪
 * （小区域裁剪可进一步提升有效清晰度）。
 */
export async function shotBase64(pwPage: any, clip?: { x: number; y: number; width: number; height: number }): Promise<string> {
  const buf: Buffer = await pwPage.screenshot({
    type: 'jpeg',
    quality: MODEL_JPEG_QUALITY,
    scale: 'css',
    ...(clip ? { clip } : {}),
  });
  return buf.toString('base64');
}

/**
 * 稳定等待：每 interval 截一帧，连续 STABLE_REQUIRED 次哈希一致即认为渲染稳定。
 * 返回实际耗时与是否达成稳定（超时兜底返回 false，调用方继续执行不阻塞）。
 */
export async function waitStable(
  pwPage: any,
  opts?: { intervalMs?: number; maxMs?: number },
): Promise<{ stable: boolean; elapsedMs: number }> {
  const interval = Math.max(50, opts?.intervalMs ?? DEFAULT_INTERVAL_MS);
  const max = Math.max(interval, opts?.maxMs ?? DEFAULT_MAX_MS);
  const started = Date.now();
  let prev = await shotHash(pwPage);
  let stable = 0;
  while (Date.now() - started < max) {
    await new Promise((r) => setTimeout(r, interval));
    const cur = await shotHash(pwPage);
    if (cur === prev) {
      if (++stable >= STABLE_REQUIRED - 1) {
        return { stable: true, elapsedMs: Date.now() - started };
      }
    } else {
      stable = 0;
    }
    prev = cur;
  }
  return { stable: false, elapsedMs: Date.now() - started };
}

// ---- 页内信号版稳定等待（零截图） ----
// 背景：帧哈希版每 interval 截一帧，Playwright 截图在有头模式下会注入 caret 隐藏样式 +
// 强制合成器出帧，200ms 轮询时被测页面出现肉眼可见的闪烁。
// 页内版用三个信号等价判定「渲染已稳定」：running 动画为空 + MutationObserver 静默窗
// + 至少 minFrames 个 rAF（挂起渲染已 flush）。帧哈希版保留给 effectCheck 与兜底。

const PAGE_QUIET_MS = 350; // 静默窗：≈帧哈希版的 interval 200ms × 连续 2 帧
const PAGE_MIN_FRAMES = 3;

/**
 * 页内稳定判定脚本（字符串形式——必须如此：ts 力转换器会给函数注入 __name helper，
 * 页面上下文未定义导致 evaluate 必抛异常，静默回退后页内版形同虚设）。
 * 信号：running 动画为空 + MutationObserver 静默窗 + 至少 minFrames 个 rAF。
 * getAnimations 不存在（老内核）时退化为纯静默窗判定。
 */
const PAGE_STABLE_SCRIPT = `(cfg) => new Promise((resolve) => {
  const g = globalThis;
  const doc = g.document;
  let lastMutation = g.performance.now();
  let frames = 0;
  let done = false;
  let rafId = 0;
  const finish = (stable, reason) => {
    if (done) return;
    done = true;
    obs.disconnect();
    g.clearInterval(poll);
    g.cancelAnimationFrame(rafId);
    resolve({ stable, reason });
  };
  const check = () => {
    if (done) return;
    let running = 0;
    try {
      running = doc.getAnimations().filter((a) => a.playState === 'running').length;
    } catch {
      running = 0; // 无 getAnimations：退化为纯静默窗判定
    }
    if (running === 0 && frames >= cfg.minFrames && g.performance.now() - lastMutation >= cfg.quietMs) {
      finish(true);
    }
  };
  const obs = new g.MutationObserver(() => {
    lastMutation = g.performance.now();
  });
  obs.observe(doc.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
  const loop = () => {
    frames++;
    check();
    if (!done) rafId = g.requestAnimationFrame(loop);
  };
  rafId = g.requestAnimationFrame(loop);
  const poll = g.setInterval(check, 100);
  g.setTimeout(() => finish(false, 'timeout'), cfg.maxMs);
})`;

/** 页内稳定等待：整个轮询在页面上下文内完成（单次 evaluate，无 RTT 开销）。
 * 注意必须 IIFE 拼接：本仓库 Playwright 版本对字符串 evaluate 不自动调用返回的函数
 * （`'(x)=>x*2', 21` 返回 undefined），且 ts 函数形式会被转换器注入 __name 而炸。 */
export async function waitStableInPage(
  pwPage: any,
  opts?: { quietMs?: number; maxMs?: number },
): Promise<{ stable: boolean; elapsedMs: number }> {
  const quietMs = Math.max(100, opts?.quietMs ?? PAGE_QUIET_MS);
  const maxMs = Math.max(quietMs, opts?.maxMs ?? DEFAULT_MAX_MS);
  const started = Date.now();
  try {
    const cfgJson = JSON.stringify({ quietMs, maxMs, minFrames: PAGE_MIN_FRAMES });
    const r = (await pwPage.evaluate(`(${PAGE_STABLE_SCRIPT})(${cfgJson})`)) as {
      stable: boolean;
      reason?: string;
    };
    return { stable: r.stable, elapsedMs: Date.now() - started };
  } catch (e) {
    // 页面上下文不可用（导航中 / 已销毁等）：回退帧哈希版。回退打日志——静默降级曾掩盖页内脚本异常
    console.warn('[visualFrame] waitStableInPage 回退帧哈希版:', e instanceof Error ? e.message : e);
    return waitStable(pwPage, { maxMs });
  }
}

/** 动作生效确认：afterHash !== beforeHash 即画面已变化。 */
export function effectChanged(beforeHash: string, afterHash: string): boolean {
  return beforeHash !== afterHash;
}
