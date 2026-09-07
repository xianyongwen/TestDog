/**
 * 插件 Playwright 桥（Node 侧）：把真实 Playwright API 以 RPC 绑定形式暴露给页内插件。
 *
 * 插件动作运行在被测页面的浏览器环境里（init script 注入），无法直接持有 Node 侧
 * Playwright 对象；本模块经 exposeBinding 注入单个绑定 `__ttPwRpc`，与 pluginRuntime.ts
 * 的页内代理（window.__ttPw）配对。payload = { p?: 属性路径数组, a?: 参数数组, b?: 句柄 id,
 * elToken?: 元素注册令牌 }，Node 侧按语义分发：
 * - elToken：pw(el) 元素注册。页内先给元素打上临时 data-__tt-pw 标记，Node 侧解析为
 *   page.locator('[data-__tt-pw=…]').first()（注册为 Locator 句柄——完整链式 + auto-wait；
 *   1.61 起 ElementHandle.locator 已移除、绑定参数也不再支持 DOM 节点直传，标记法是
 *   跨进程传元素的现实途径；仅支持主 frame 内元素，标记属性 30s 后由 Node 侧清理）。
 *   后续经 b=句柄 id 续链。
 * - b：句柄续链，在已注册的 Playwright 对象上按路径取属性/调用方法；
 * - 其余：从根对象（page/context/browser）按路径取属性后调用。
 *
 * 结果序列化：原始值/纯对象直接透传；Playwright 对象（Locator/Page/Frame/ElementHandle/
 * Keyboard/Mouse 等）注册为句柄后回传 { __ttHandle, __ttKind }（页内包装成可续链代理）；
 * 抛错（含 Playwright 超时错误）原样 reject 回页面，错误信息可直接指导插件换路径。
 *
 * 使用方：generationService / runnerService / routes/plugins.ts（试运行）/ pluginHarness.ts，
 * 在 connectPwView（或建页）成功后调用 installPluginPwBridge。注入失败不阻塞主流程——
 * 插件内调用 pw 时会收到「桥未注入」的明确报错。
 *
 * 位置说明：放在 scripts/（而非 src/services/）是因为本文件被两处消费——
 * 平台服务侧 import 本模块；pluginDevBundles.ts 以 ?raw 原样嵌入插件开发模板包，
 * 作为 harness/pluginPwBridge.ts 与 pluginHarness.ts 同目录配对（单一事实源，
 * 移动/重构时必须同步检查 src/utils/pluginDevBundles.ts）。
 * 仅依赖 playwright（server 与模板包均直接声明该依赖）。
 */
import type { BrowserContext, Page } from 'playwright';

/**
 * 句柄 worthy 的 Playwright 对象：按构造函数名识别（playwright 不在运行时导出类值，
 * 无法 instanceof；1.61 实测构造名为去连字符加数字后缀的变体：_Locator / Keyboard2 / _Page …，
 * 归一化后匹配白名单。升级 playwright 时跑一遍冒烟确认名单仍命中）。
 */
const PW_HANDLE_NAMES = new Set([
  'Locator',
  'FrameLocator',
  'Page',
  'Frame',
  'BrowserContext',
  'Browser',
  'ElementHandle',
  'JSHandle',
  'Keyboard',
  'Mouse',
  'Touchscreen',
  'Request',
  'Response',
  'WebSocket',
  'Route',
  'Worker',
  'Dialog',
  'Download',
]);

const isPwObject = (v: any): boolean => {
  if (!v || typeof v !== 'object') return false;
  const name = String(v.constructor?.name ?? '')
    .replace(/[^A-Za-z0-9]/g, '')
    .replace(/\d+$/, '');
  return PW_HANDLE_NAMES.has(name);
};

/** 页内 RPC 绑定名（与 pluginRuntime.ts 的页内代理保持同步，勿单方修改）。 */
export const PW_RPC_BINDING = '__ttPwRpc';
/** pw(el) 元素注册用的临时标记属性（页内打上 → Node 解析为句柄 → 页内立即移除）。 */
export const PW_EL_TOKEN_ATTR = 'data-__tt-pw';

/** 句柄缓存上限（FIFO 淘汰）：Locator 类句柄可随时重新解析，淘汰仅影响旧引用。 */
const MAX_HANDLES = 500;

/** pw(el) 打标属性保留时长：动作限时 10s（红线），留足余量后清理，避免长期污染被测页 DOM。 */
const PW_EL_TOKEN_TTL_MS = 30_000;

const installed = new WeakSet<object>();

/** 在 BrowserContext（覆盖其下所有页）或单个 Page 上安装桥；同一目标幂等。 */
export async function installPluginPwBridge(target: BrowserContext | Page): Promise<void> {
  if (installed.has(target)) return;
  const handles = new Map<number, unknown>();
  let nextId = 1;
  const keep = (v: unknown): number => {
    const id = nextId++;
    handles.set(id, v);
    if (handles.size > MAX_HANDLES) {
      const oldest = handles.keys().next().value;
      if (oldest !== undefined) handles.delete(oldest);
    }
    return id;
  };

  const serialize = (v: any): any => {
    if (v === undefined) return null;
    if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
    if (typeof v === 'bigint') return String(v);
    if (isPwObject(v)) return { __ttHandle: keep(v), __ttKind: String(v.constructor?.name ?? 'PlaywrightObject') };
    try {
      return JSON.parse(JSON.stringify(v));
    } catch {
      return String(v);
    }
  };

  const invoke = async (source: any, payload: any): Promise<any> => {
    // pw(el) 元素注册：按临时标记定位，注册为 Locator（完整链式 + auto-wait）。
    // 标记属性保留 PW_EL_TOKEN_TTL_MS 供重解析（动作限时 10s，留足余量），到时 Node 侧清理
    if (payload?.elToken != null) {
      if (!source?.page) throw new Error('pw(el) 元素注册失败：桥来源缺少 page');
      const token = String(payload.elToken).replace(/[^a-zA-Z0-9]/g, '');
      const sel = `[${PW_EL_TOKEN_ATTR}="${token}"]`;
      const root = source.page.locator(sel).first();
      const timer = setTimeout(() => {
        root
          .elementHandle()
          .then((el: any) => (el ? el.evaluate((e: any) => e.removeAttribute(PW_EL_TOKEN_ATTR)) : undefined))
          .catch(() => {
            /* 元素已失联则无需清理 */
          });
      }, PW_EL_TOKEN_TTL_MS);
      (timer as any).unref?.();
      return serialize(root);
    }
    const path: string[] = Array.isArray(payload?.p) ? payload.p.map(String) : [];
    const args: any[] = Array.isArray(payload?.a) ? payload.a : [];
    let cur: any;
    let owner: any;
    let start: number;
    if (payload?.b != null) {
      // 句柄续链：从已注册的 Playwright 对象上继续取属性/调用方法
      cur = handles.get(Number(payload.b));
      if (!cur) throw new Error('pw 句柄已失效（缓存被淘汰或连接已更换），请重新定位后再操作');
      owner = cur;
      start = 0;
      if (!path.length) throw new Error('pw 无效调用：句柄对象不可直接调用，请调用其方法（如 .click() / .count()）');
    } else {
      const roots: Record<string, any> = {};
      if (source?.page) roots.page = source.page;
      if (source?.context) roots.context = source.context;
      if (source?.browser) roots.browser = source.browser;
      const rootName = path[0];
      if (!(rootName in roots)) {
        throw new Error(`pw 未知根对象：${rootName}（可用：${Object.keys(roots).join(' / ') || '无'}）`);
      }
      cur = roots[rootName];
      owner = roots;
      start = 1;
    }
    for (let i = start; i < path.length; i++) {
      owner = cur;
      cur = cur?.[path[i]];
      if (cur === undefined || cur === null) {
        throw new Error(`pw 路径不存在：${path.slice(0, i + 1).join('.')}（pw(el) 返回 Locator，可用 locator/count/click/fill/textContent/filter/nth/evaluate 等；Node 侧函数参数不可跨桥传递，evaluate 请传字符串表达式）`);
      }
    }
    if (typeof cur !== 'function') {
      throw new Error(`pw 目标不是方法：${path.join('.')}（属性链末端必须以方法调用收尾）`);
    }
    return serialize(await cur.apply(owner, args));
  };

  await target.exposeBinding(PW_RPC_BINDING, async (source: any, payload: any) => invoke(source, payload));
  installed.add(target);
}
