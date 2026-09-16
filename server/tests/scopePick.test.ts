import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { verifyLocators } from '../src/services/locatorPickerService';
import { resolveQuery } from '../src/services/locatorVerifier';
import { locatorScopeSchema } from '../src/shared/testScript';

vi.mock('../src/db', () => ({ prisma: {} }));
let browser: Browser;
beforeAll(async () => { browser = await chromium.launch({ headless: true }); });
afterAll(async () => { await browser?.close(); });

it('picks a unique scope even when its original locator depends on a dialog', async () => {
  const page = await browser.newPage();
  try {
    await page.setContent('<div role="dialog"><section data-testid="attachments">One</section></div><div role="dialog"><section data-testid="attachments">Two</section></div>');
    await page.evaluate(() => { (globalThis as any).__testToolPickEl__ = (globalThis as any).document.querySelectorAll('section')[1]; });
    const result = await verifyLocators(page, [{ strategy: 'testid', value: 'attachments', scope: { strategy: 'role', value: 'dialog', role: 'dialog' } }], true);
    expect(result.locator?.scope).toBeUndefined();
    const scope = locatorScopeSchema.parse(result.locator);
    expect(await resolveQuery(page, scope).count()).toBe(1);
    expect(await resolveQuery(page, scope).textContent()).toBe('Two');
  } finally { await page.close(); }
});

it('keeps semantic scope locators when they already uniquely identify the picked container', async () => {
  const page = await browser.newPage();
  try {
    await page.setContent('<div role="dialog" aria-label="编辑附件">Files</div>');
    await page.evaluate(() => { (globalThis as any).__testToolPickEl__ = (globalThis as any).document.querySelector('div'); });
    const result = await verifyLocators(page, [{ strategy: 'role', value: 'dialog', role: 'dialog', name: '编辑附件' }], true);
    expect(result.locator).toEqual({ strategy: 'role', value: 'dialog', role: 'dialog', name: '编辑附件' });
  } finally { await page.close(); }
});

it('checks target uniqueness inside the configured scope and preserves it', async () => {
  const page = await browser.newPage();
  try {
    await page.setContent('<section data-testid="first"><button>保存</button></section><section data-testid="second"><button>保存</button></section>');
    await page.evaluate(() => { (globalThis as any).__testToolPickEl__ = (globalThis as any).document.querySelectorAll('button')[1]; });
    const scope = { strategy: 'testid' as const, value: 'second' };
    const result = await verifyLocators(page, [{ strategy: 'role', role: 'button', value: 'button', name: '保存', scope: { strategy: 'role', value: 'dialog', role: 'dialog' } }], false, scope);
    expect(result.locator).toEqual({ strategy: 'role', value: 'button', role: 'button', name: '保存', scope });
  } finally { await page.close(); }
});

it('uses relative CSS when semantic candidates are duplicated inside the scope', async () => {
  const page = await browser.newPage();
  try {
    await page.setContent('<section id="area"><button>保存</button><button>保存</button></section>');
    await page.evaluate(() => { (globalThis as any).__testToolPickEl__ = (globalThis as any).document.querySelectorAll('button')[1]; });
    const scope = { strategy: 'css' as const, value: '#area' };
    const result = await verifyLocators(page, [{ strategy: 'text', value: '保存' }], false, scope);
    expect(result.locator).toMatchObject({ strategy: 'css', scope });
    const query = resolveQuery(resolveQuery(page, scope), result.locator!);
    expect(await query.count()).toBe(1);
    expect(await query.evaluate((el: any) => el === el.parentElement.lastElementChild)).toBe(true);
  } finally { await page.close(); }
});

it('rejects targets outside the scope even with an absolute XPath candidate', async () => {
  const page = await browser.newPage();
  try {
    await page.setContent('<section id="area"><button>保存</button></section><button id="outside">保存</button>');
    await page.evaluate(() => { (globalThis as any).__testToolPickEl__ = (globalThis as any).document.querySelector('#outside'); });
    const result = await verifyLocators(page, [{ strategy: 'text', value: '保存' }, { strategy: 'xpath', value: '/html/body/button' }], false, { strategy: 'css', value: '#area' });
    expect(result.locator).toBeUndefined();
  } finally { await page.close(); }
});

it('rejects missing or ambiguous configured scopes', async () => {
  const page = await browser.newPage();
  try {
    await page.setContent('<section><button data-testid="save">保存</button></section><section></section>');
    await page.evaluate(() => { (globalThis as any).__testToolPickEl__ = (globalThis as any).document.querySelector('button'); });
    for (const value of ['#missing', 'section']) {
      const result = await verifyLocators(page, [{ strategy: 'testid', value: 'save' }], false, { strategy: 'css', value });
      expect(result.locator).toBeUndefined();
      expect(result.tried[0]).toContain('作用域=');
    }
  } finally { await page.close(); }
});
