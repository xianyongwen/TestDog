/// <reference lib="dom" />
import type { Page, Locator } from 'playwright-core';
import { scrollSchema, type ScrollOptions } from '../shared/testScript';

/** Generation and replay use identical DOM scrolling, never synthesize wheel events. */
export async function executeScroll(page: Page, locator: Locator | undefined, input: ScrollOptions, signal?: AbortSignal) {
  const scroll = scrollSchema.parse(input);
  signal?.throwIfAborted();
  if (scroll.target !== 'page' && !locator) throw new Error('滚动目标缺少定位器');
  if (scroll.target === 'page' && locator) throw new Error('页面滚动不设置定位器');
  if (locator && (await locator.count() !== 1 || !await locator.isVisible())) throw new Error('滚动目标必须唯一且可见');
  const axis = scroll.axis ?? 'y';
  const read = (el: Element | null) => {
    if (!el) throw new Error('页面没有滚动根节点');
    const items = [];
    for (let node: Element | null = el; node; node = node.parentElement) {
      items.push({ left: node.scrollLeft, top: node.scrollTop,
        maxX: Math.max(0, node.scrollWidth - node.clientWidth), maxY: Math.max(0, node.scrollHeight - node.clientHeight), rtl: getComputedStyle(node).direction === 'rtl' });
    }
    return items;
  };
  // Page callbacks cannot reference Node closures; use a locator for the document scrolling element.
  const rootHandle = scroll.target === 'page' ? await page.evaluateHandle(() => document.scrollingElement) : undefined;
  const state = () => locator ? locator.evaluate(read, undefined, { timeout: 1000 }) : rootHandle!.evaluate(read);
  try {
    const before = await state();
    signal?.throwIfAborted();
    if (scroll.mode === 'intoView') {
      await locator!.scrollIntoViewIfNeeded({ timeout: 10000 });
    } else {
      const move = (el: Element | null, args: { mode: string; axis: string; distance: number; container: boolean }) => {
        if (!el) throw new Error('页面没有滚动根节点');
        const style = getComputedStyle(el);
        if (args.container && !/^(auto|scroll|overlay)$/.test(args.axis === 'x' ? style.overflowX : style.overflowY))
          throw new Error('目标不是该方向的滚动容器，请选择实际滚动区域');
        const max = args.axis === 'x' ? Math.max(0, el.scrollWidth - el.clientWidth) : Math.max(0, el.scrollHeight - el.clientHeight);
        const end = args.axis === 'x' && style.direction === 'rtl' ? -max : max;
        const current = args.axis === 'x' ? el.scrollLeft : el.scrollTop;
        const to = args.mode === 'by' ? current + args.distance : args.mode === 'toEnd' ? end : 0;
        el.scrollTo({ [args.axis === 'x' ? 'left' : 'top']: to, behavior: 'instant' });
      };
      const args = { mode: scroll.mode, axis, distance: scroll.distance ?? 0, container: scroll.target === 'container' };
      if (locator) await locator.evaluate(move, args);
      else await rootHandle!.evaluate(move, args);
    }
    // Bounded settling only; reaching today's end does not assert that async data is exhausted.
    let after = before;
    let unchanged = 0;
    let observed = false;
    try {
      after = await state();
      observed = true;
      for (let i = 0; i < 20 && unchanged < 2 && !signal?.aborted; i++) {
        await new Promise(resolve => setTimeout(resolve, 50));
        const next = await state();
        unchanged = JSON.stringify(next) === JSON.stringify(after) ? unchanged + 1 : 0;
        after = next;
      }
    } catch {
      // A virtual list can replace its container after scrolling. The completed action still needs recording.
      observed = false;
    }
    const moved = before.some((position, i) => position.left !== after[i]?.left || position.top !== after[i]?.top);
    const position = after[0];
    const current = axis === 'x' ? position.left : position.top;
    const end = axis === 'x' ? position.maxX * (position.rtl ? -1 : 1) : position.maxY;
    return { before, after, moved, observed, settled: unchanged >= 2,
      ...(observed && scroll.target !== 'element' ? { atStart: Math.abs(current) < 1, atEnd: Math.abs(current - end) < 1 } : {}) };
  } finally { await rootHandle?.dispose(); }
}
