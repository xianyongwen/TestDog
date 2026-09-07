// 探测 antd v6/v5 弹层归属关联：aria-controls/aria-owns ↔ 弹层 id；及未选中态 content 结构
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const storageState = JSON.parse(readFileSync('/tmp/login-state.json', 'utf-8'));
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ storageState });
const page = await ctx.newPage();
await page.goto('http://localhost:8090/', { waitUntil: 'networkidle' });
await page.click('li:has-text("客户列表")');
await page.waitForTimeout(800);
await page.click('button:has-text("新建客户")');
await page.waitForTimeout(800);

const r = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((res) => { setTimeout(res, ms); });
  const out = {};
  // 未选中态的 content 结构
  const el0 = document.querySelectorAll('.ant-modal .ant-select')[0];
  out.unselectedHTML = el0.innerHTML.slice(0, 500);
  // 打开行业弹层
  const editor = el0;
  const selectorEl = editor.querySelector('.ant-select-selector') || editor;
  selectorEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  selectorEl.click();
  for (let i = 0; i < 50; i++) {
    await sleep(100);
    const d = [...document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')].find(d => d.querySelector('.ant-select-item'));
    if (d) {
      out.dropdownId = d.id || null;
      out.dropdownAria = { label: d.getAttribute('aria-label'), expanded: d.getAttribute('aria-expanded') };
      const input = editor.querySelector('input');
      out.inputAttrs = {};
      for (const a of ['aria-controls', 'aria-owns', 'aria-expanded', 'aria-haspopup', 'id']) out.inputAttrs[a] = input?.getAttribute(a);
      // 多个 select 时其它 input 的 aria-controls(对照)
      out.allInputs = [...document.querySelectorAll('.ant-modal .ant-select input')].map(i => ({ id: i.id, ac: i.getAttribute('aria-controls'), ao: i.getAttribute('aria-owns') }));
      break;
    }
  }
  return out;
});
console.log(JSON.stringify(r, null, 2));
await browser.close();
