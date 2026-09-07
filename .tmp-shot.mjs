import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

async function probe(name) {
  console.log(name, JSON.stringify(await page.evaluate(() => {
    const hdr = document.querySelectorAll('.tabs-fill .ant-table-header')[0];
    const body = document.querySelectorAll('.tabs-fill .ant-table-body')[0];
    return {
      docScrollH: document.documentElement.scrollHeight,
      winH: window.innerHeight,
      hasFixedHeader: !!hdr && hdr.offsetHeight > 0,
      headerTop: hdr ? Math.round(hdr.getBoundingClientRect().top) : null,
      bodyScrollTop: body ? Math.round(body.scrollTop) : null,
      bodyScrollable: body ? body.scrollHeight > body.clientHeight : null,
      bodyHOverflow: body ? body.scrollWidth > body.clientWidth : null,
    };
  })));
}

// 脚本版本 tab（10 个版本）
await page.goto('http://localhost:1420/#/cases/cmsrov8nc000099bwk7w2hlk1', { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
const left = await page.evaluate(() => document.querySelectorAll('.tabs-fill .ant-table-body')[0]);
await page.evaluate(() => { const b = document.querySelectorAll('.tabs-fill .ant-table-body')[0]; if (b) b.scrollTop = b.scrollHeight; });
await page.waitForTimeout(300);
await probe('scripts:');
await page.screenshot({ path: '/tmp/tcd2-scripts.png' });

// 运行记录 tab（21 条记录），不选运行 → 只渲染左表
await page.goto('http://localhost:1420/#/cases/cmrusmrzj000htgbweslqh3qj?tab=runs', { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
await page.evaluate(() => { const b = document.querySelectorAll('.tabs-fill .ant-table-body')[0]; if (b) b.scrollTop = b.scrollHeight; });
await page.waitForTimeout(300);
await probe('runs:');
await page.screenshot({ path: '/tmp/tcd2-runs.png' });
await browser.close();
