import { chromium } from 'playwright';
import { PICKER_SCRIPT } from './src/services/pickerScript.ts';
const Database = (await import('better-sqlite3')).default;
const db = new Database('dev.db', { readonly: true });
const row = db.prepare(`SELECT storageState FROM loginConfig WHERE name='登录配置 1'`).get();
const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: JSON.parse(row.storageState) });
const page = await ctx.newPage();
await page.addInitScript(PICKER_SCRIPT);
await page.goto('http://103.236.93.60:33515/crm/interaction', { timeout: 45000, waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500);
console.log('picker 注入:', await page.evaluate(() => ({ picker: !!window.__testToolPickInstalled__, cand: !!window.__ttCandidatesInstalled__ })));
// 注册监听器看 altKey
await page.evaluate(() => {
  document.addEventListener('click', (e) => { console.log('CLICK', e.altKey, e.target && e.target.tagName); }, true);
});
const btn = page.getByTestId('interaction-create-btn').first();
const box = await btn.boundingBox();
await page.mouse.move(box.x + box.width - 30, box.y + box.height / 2);
await page.keyboard.down('Alt');
await page.mouse.down({ button: 'left' });
await page.mouse.up({ button: 'left' });
await page.keyboard.up('Alt');
await page.waitForTimeout(600);
console.log('点击后:', await page.evaluate(() => ({ pick: (globalThis).__testToolPick__, el: (globalThis).__testToolPickEl__ ? (globalThis).__testToolPickEl__.tagName : null })));
await browser.close();
