import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
await page.addInitScript(() => { (window as any).__x = 1; });
await page.setContent('<div>hi</div>');
console.log('after setContent:', await page.evaluate(() => (window as any).__x));
await browser.close();
