/**
 * 页内插件运行时框架（零依赖 IIFE，注入被测页面）：
 * - `window.__ttPluginRegistry__.register({ id, detect, candidates, annotate, actions })` 四插槽注册；
 * - `resolveChain(el, action)` 匹配链解析：detect 命中且注册了该动作的插件，按注册顺序（= preset 优先级）返回；
 * - `invokeAction(pluginId, action, el, args)` 转发器：结果归一化为三态协议
 *   （string→success / throw→failed / {status,message}→显式三态），成功后执行动作可选 verify 后验；
 *   平台外壳（生成期语义动作分发器 / 回放期重放）统一入口；
 * - `invokeVerify(pluginId, action, el, args)` 仅后验入口（fill 优先路径用：验输入是否真实提交，不运行动作本体）；
 * - `detectAll / candidatesFor / annotateFor / listActions` 供 snapshot/候选生成/试运行收集使用；
 * - `window.__ttPw` Playwright 桥代理（第三参 pw 传给动作/后验）：属性链按需经
 *   `__ttPwRpc` 绑定转发到 Node 侧真实 Playwright API（配合 services/pluginPwBridge.ts），
 *   桥未注入（如裸 polyfill 环境）时调用报错提示。
 *
 * 设计约束：
 * - 幂等守卫（__ttPluginRuntimeInstalled__），可安全随 init script / addInitScript 重复注入；
 * - 异常隔离：单个插件插槽抛错不污染主链路（捕获后忽略，candidates 静默跳过）；
 * - 重复注册同 id 忽略（保持首次，保证优先级稳定）。
 */
export const PLUGIN_RUNTIME_SCRIPT = String.raw`(() => {
  if (window.__ttPluginRuntimeInstalled__) return;
  window.__ttPluginRuntimeInstalled__ = true;
  // 插件通用轮询辅助：每 interval 调 fn()，返回真值即 resolve；超时 reject（动作内等弹层/DOM 刷新用）
  window.__ttPickWait = function (fn, timeout, interval) {
    return new Promise(function (resolve, reject) {
      const started = Date.now();
      const step = parseInt(interval, 10) > 0 ? parseInt(interval, 10) : 100;
      const t = setInterval(function () {
        let v = null;
        try { v = fn(); } catch (e) { v = null; }
        if (v) { clearInterval(t); resolve(v); return; }
        if (Date.now() - started > (parseInt(timeout, 10) || 5000)) {
          clearInterval(t);
          reject(new Error('等待超时（' + (parseInt(timeout, 10) || 5000) + 'ms）'));
        }
      }, step);
    });
  };
  const plugins = [];
  const byId = new Map();
  const registry = {
    register(def) {
      try {
        if (!def || typeof def !== 'object' || !def.id) return;
        if (byId.has(def.id)) return;
        const p = {
          id: String(def.id),
          detect: typeof def.detect === 'function' ? def.detect : null,
          candidates: typeof def.candidates === 'function' ? def.candidates : null,
          annotate: typeof def.annotate === 'function' ? def.annotate : null,
          actions: def.actions && typeof def.actions === 'object' ? def.actions : {},
        };
        plugins.push(p);
        byId.set(def.id, p);
      } catch (e) {
        console.warn('[tt-plugin] register failed:', def && def.id, e);
      }
    },
    /** 逐插件探测：返回命中列表 [{id, version?}]（detect 可返回布尔或 {matched, version}）。 */
    detectAll(el) {
      const hits = [];
      for (const p of plugins) {
        if (!p.detect) continue;
        try {
          const r = p.detect(el);
          if (r) hits.push({ id: p.id, version: r && typeof r === 'object' ? r.version : undefined });
        } catch (e) {
          /* 插件异常隔离 */
        }
      }
      return hits;
    },
    /** 收集各插件的候选增强，附 pluginId 标记（供平台 verifyCandidates 管线验证）。 */
    candidatesFor(el) {
      const out = [];
      for (const p of plugins) {
        if (!p.candidates) continue;
        try {
          const cs = p.candidates(el);
          if (Array.isArray(cs)) {
            for (const c of cs) {
              if (c && c.strategy && typeof c.value === 'string') out.push(Object.assign({}, c, { pluginId: p.id }));
            }
          }
        } catch (e) {
          /* 插件异常隔离 */
        }
      }
      return out;
    },
    /** 各插件的语义标注文本拼接（snapshot 增注用）。 */
    annotateFor(el) {
      const parts = [];
      for (const p of plugins) {
        if (!p.annotate) continue;
        try {
          const t = p.annotate(el);
          if (t) parts.push('[' + p.id + '] ' + t);
        } catch (e) {
          /* 插件异常隔离 */
        }
      }
      return parts.join(' ');
    },
    /** 匹配链解析：detect(el) 命中且 actions 含该动作（fn 可调用）的插件，按注册顺序（= preset 注入优先级）返回。 */
    resolveChain(el, action) {
      const out = [];
      if (!action || typeof action !== 'string') return out;
      for (const p of plugins) {
        if (!p.detect) continue;
        const def = p.actions ? p.actions[action] : null;
        const hasFn = typeof def === 'function' || (def && typeof def.fn === 'function');
        if (!hasFn) continue;
        try {
          const r = p.detect(el);
          const matched = r === true || !!(r && typeof r === 'object' && r.matched);
          if (matched) out.push({ id: p.id, variant: r && typeof r === 'object' ? r.variant : undefined });
        } catch (e) {
          /* 插件异常隔离 */
        }
      }
      return out;
    },
    /** 动作转发入口：平台外壳（生成期分发器 / 回放期重放）统一调用，结果归一化为三态协议（不抛错）：
     *  string 返回→success（向后兼容）、throw→failed、{status,message}→显式三态；
     *  成功后执行动作可选 verify 页内后验（不过视同 failed 交链上下一插件，后验自身异常视同 uncertain）。 */
    async invokeAction(pluginId, action, el, args) {
      const p = byId.get(pluginId);
      if (!p) return { status: 'failed', message: '插件未注入：' + pluginId };
      const def = p.actions ? p.actions[action] : null;
      // 允许 actions[name] 为函数或 {fn, doc, preferFill, verify} 对象两种形态
      const impl = typeof def === 'function' ? def : (def && typeof def.fn === 'function' ? def.fn : null);
      if (!impl) return { status: 'failed', message: '插件 ' + pluginId + ' 未注册动作：' + action };
      let out;
      try {
        const raw = await impl(el, args, window.__ttPw);
        if (raw && typeof raw === 'object' && typeof raw.status === 'string') {
          const st = raw.status === 'success' || raw.status === 'failed' ? raw.status : 'uncertain';
          out = { status: st, message: raw.message == null ? '' : String(raw.message) };
          if (typeof raw.resolvedValue === 'string') out.resolvedValue = raw.resolvedValue;
        } else {
          out = { status: 'success', message: raw == null ? '' : String(raw) };
        }
      } catch (e) {
        return { status: 'failed', message: String((e && e.message) || e) };
      }
      if (out.status === 'success' && def && typeof def === 'object' && typeof def.verify === 'function') {
        try {
          const verifyArgs = typeof out.resolvedValue === 'string' ? { ...args, value: out.resolvedValue } : args;
          const ok = await def.verify(el, verifyArgs, window.__ttPw);
          if (!ok) out = { status: 'failed', message: (out.message ? out.message + '；' : '') + '动作后验未通过（终态与预期不符）' };
        } catch (ve) {
          out = { status: 'uncertain', message: (out.message ? out.message + '；' : '') + '后验执行异常：' + String((ve && ve.message) || ve) };
        }
      }
      return out;
    },
    /** 仅执行动作声明的页内后验（fill 优先路径用：验证输入是否真实提交，不运行动作本体）。
     *  返回 true/false；null = 无 verify 声明或后验异常（调用方回退帧哈希口径，不能当成功）。 */
    async invokeVerify(pluginId, action, el, args) {
      const p = byId.get(pluginId);
      if (!p) return null;
      const def = p.actions ? p.actions[action] : null;
      if (!def || typeof def !== 'object' || typeof def.verify !== 'function') return null;
      try {
        return !!(await def.verify(el, args, window.__ttPw));
      } catch (e) {
        return null;
      }
    },
    /** 已注册插件与其动作元数据清单（试运行回写/管理页展示用）：对象形态声明携带 doc/label/preferFill。 */
    listActions() {
      const out = [];
      for (const p of plugins) {
        const names = p.actions ? Object.keys(p.actions) : [];
        if (!names.length) continue;
        const metas = names.map(function (name) {
          const def = p.actions ? p.actions[name] : null;
          if (!def || typeof def !== 'object') return { name: name };
          const meta = { name: name };
          if (typeof def.doc === 'string' && def.doc) meta.doc = def.doc;
          if (typeof def.label === 'string' && def.label) meta.label = def.label;
          if (def.preferFill) meta.preferFill = true;
          return meta;
        });
        out.push({ id: p.id, actions: metas });
      }
      return out;
    },
    count() {
      return plugins.length;
    },
  };
  window.__ttPluginRegistry__ = registry;
  // —— Playwright 桥（页内代理）：与 Node 侧 services/pluginPwBridge.ts 的绑定配对 ——
  // 每个远程节点是 thenable 的 Proxy（包住最近一次调用的结果 Promise）：
  // - await（then）→ 结果解包：{__ttHandle} 句柄包装为可续链新节点，原始值/纯对象原样返回；
  // - 属性访问 → 惰性路径节点，「调用」时才发一次 RPC（{p:路径, a:参数, b:句柄id}）；
  //   有中间调用时先 await 其句柄再续链——pw.page.locator('.x').click() 与
  //   pw(el).locator('.i').click() 两种链式写法均成立（与真实 Playwright 同构）。
  function __ttPwIsHandle(r) {
    return !!(r && typeof r === 'object' && typeof r.__ttHandle === 'number');
  }
  // 句柄的「就绪视图」：可继续链式调用；刻意不响应 then/catch/finally——Promise 适配
  // 以「结果是否 thenable」终止，若把节点本身作为 fulfillment 值会被再次适配，
  // 每次又产出新节点 → 微任务无限递归（页面假死）。await 视图得到视图自身。
  function __ttPwHandleView(r) {
    return new Proxy({}, {
      get(t, prop) {
        if (typeof prop !== 'string' || prop === 'then' || prop === 'catch' || prop === 'finally') return undefined;
        return __ttPwNode(Promise.resolve(r), [prop], Promise.resolve(r));
      },
    });
  }
  function __ttPwNode(wire, path, baseWire) {
    const fn = function (...args) {
      let exec;
      if (!path.length && args.length === 1 && args[0] instanceof Element) {
        // 根调用 pw(el)：给元素打临时标记 → Node 侧解析为作用域 Locator 并延时清理标记
        if (typeof window.__ttPwRpc !== 'function') throw new Error('Playwright 桥未注入（__ttPwRpc 缺失）：pw 仅在平台外壳（生成/回放/插件试运行/harness）内可用');
        const token = 'ttpw' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
        try {
          args[0].setAttribute('data-__tt-pw', token);
        } catch (e) {
          throw new Error('pw(el) 元素注册失败：元素不支持打标（须为主 frame 内的 Element）');
        }
        exec = window.__ttPwRpc({ elToken: token });
      } else {
        exec = (async function () {
          let bid = null;
          if (baseWire) {
            const b = await baseWire;
            if (b !== undefined) {
              if (__ttPwIsHandle(b)) bid = b.__ttHandle;
              else throw new Error('pw 链式调用中断：前一步返回的是原始值/纯对象，其上无法继续链式调用方法');
            }
          }
          if (typeof window.__ttPwRpc !== 'function') throw new Error('Playwright 桥未注入（__ttPwRpc 缺失）：pw 仅在平台外壳（生成/回放/插件试运行/harness）内可用');
          return window.__ttPwRpc({ p: path, a: args, b: bid });
        })();
      }
      return __ttPwNode(exec, [], exec);
    };
    return new Proxy(fn, {
      get(target, prop) {
        if (typeof prop !== 'string') return undefined;
        if (prop === 'then') {
          return function (res, rej) {
            return Promise.resolve(wire).then(function (r) {
              return __ttPwIsHandle(r) ? __ttPwHandleView(r) : r;
            }).then(res, rej);
          };
        }
        if (prop === 'catch') return function (rej) { return Promise.resolve(wire).catch(rej); };
        if (prop === 'finally') return function (f) { return Promise.resolve(wire).finally(f); };
        if (prop === 'toJSON') return undefined;
        return __ttPwNode(wire, path.concat(prop), baseWire);
      },
    });
  }
  // 根节点：baseWire = undefined 哨兵（无基），属性链从根对象（page/context）起算
  window.__ttPw = __ttPwNode(Promise.resolve(undefined), [], Promise.resolve(undefined));
})();`;

/** 拼接「运行时框架 + 各插件源码」为单一 init script（守卫保证重复注入为 no-op）。 */
/** 单个待注入插件：id 为平台插件名（全库唯一，注入前写入 window.__ttPluginId__），code 为入口源码。 */
export interface PluginInjectItem {
  id: string;
  code: string;
}

export function buildPluginInitScript(plugins: PluginInjectItem[]): string {
  return [
    PLUGIN_RUNTIME_SCRIPT,
    ...plugins.map((p) => {
      const idLiteral = JSON.stringify(p.id);
      // 源码约定：求值「插件定义对象」的表达式。平台封装 register 并注入 id（平台 id 优先），
      // 源码内的辅助函数/共享状态用 IIFE 表达式返回对象实现。
      return [
        `window.__ttPluginId__ = ${idLiteral};`,
        `window.__ttPluginRegistry__.register(Object.assign((\n${p.code}\n) || {}, { id: ${idLiteral} }));`,
      ].join('\n');
    }),
  ].join('\n;\n');
}
