import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { browserLaunchOptions } from '../src/browser';
import { PICKER_SCRIPT } from '../src/services/pickerScript';
import { verifyLocators } from '../src/services/locatorPickerService';

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch(browserLaunchOptions({ headless: true }));
});

afterAll(async () => {
  await browser?.close();
});

/** 复刻 locatorPickerService 的 preview 分支：验证候选 → 回写 __testToolPickResult__。 */
async function runPreviewVerify(page: Page): Promise<unknown> {
  const s = (await page.evaluate(() => (globalThis as any).__testToolPick__)) as { type?: string; candidates?: any[] } | null;
  if (!s || s.type !== 'preview') return null;
  const result = await verifyLocators(page, s.candidates ?? []);
  await page
    .evaluate((loc) => {
      (globalThis as any).__testToolPickResult__ = { locator: loc };
    }, result.locator ?? null)
    .catch(() => {});
  return result;
}

/** 读取预览栏状态栏的渲染文本（与 pickerScript 内 200ms 轮询一致）。 */
async function previewBarText(page: Page): Promise<string> {
  return (await page.evaluate(() => {
    const res = (globalThis as any).__testToolPickResult__;
    (globalThis as any).__testToolPickResult__ = null;
    if (!res || typeof res !== 'object') return '';
    return res.locator
      ? '将拾取：' + (globalThis as any).__ttLocDesc(res.locator) + '（Playwright 验证通过）'
      : '无唯一可用定位器，将回退 css/xpath';
  })) as string;
}

describe('拾取预览回写形状（__testToolPickResult__ 应为 { locator }）', () => {
  it('唯一 testid 元素：verify 通过且预览栏显示「将拾取：testid=…（Playwright 验证通过）」', async () => {
    const page = await browser.newPage();
    await page.addInitScript(PICKER_SCRIPT);
    await page.setContent('<button data-testid="save-btn">保存</button>');
    await page.evaluate(PICKER_SCRIPT);
    // 与 pickerScript 的 Alt+点击一致：把元素置为待确认并发出 preview 消息
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="save-btn"]') as HTMLElement;
      const win = globalThis as any;
      win.__testToolPickEl__ = el;
      win.__testToolPickUrl__ = location.href;
      const a = win.__ttAnalyze(el);
      win.__testToolPick__ = { type: 'preview', candidates: a.candidates };
    });

    const result = await runPreviewVerify(page);
    expect(result).toBeTruthy();
    expect((result as any)!.locator).toMatchObject({ strategy: 'testid', value: 'save-btn' });

    const bar = await previewBarText(page);
    expect(bar).toContain('将拾取：testid=save-btn');
    expect(bar).toContain('Playwright 验证通过');
    await page.close();
  });

  it('验证失败时预览栏显示回退提示（res.locator 为 null）', async () => {
    const page = await browser.newPage();
    await page.addInitScript(PICKER_SCRIPT);
    await page.setContent('<button>无 testid</button>');
    await page.evaluate(PICKER_SCRIPT);
    await page.evaluate(() => {
      const el = document.querySelector('button') as HTMLElement;
      const win = globalThis as any;
      win.__testToolPickEl__ = el;
      win.__testToolPickUrl__ = location.href;
      // 构造必然失败的候选：目标已摘除 + 不存在的 testid
      win.__testToolPick__ = { type: 'preview', candidates: [{ strategy: 'testid', value: 'does-not-exist' }] };
      el.remove();
    });
    const result = await runPreviewVerify(page);
    expect(result).toBeTruthy();
    expect((result as any)!.locator).toBeUndefined();
    const bar = await previewBarText(page);
    expect(bar).toBe('无唯一可用定位器，将回退 css/xpath');
    await page.close();
  });
});
