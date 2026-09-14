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
