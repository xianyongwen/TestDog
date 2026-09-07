/**
 * 1080p 截图读字基线实测（真网关视觉模型）：
 * 生成 1920×1080 密集页面（12×6 表格 + 表单 + 按钮），分别以「原始截图」与「编号标注截图」
 * 发给主模型（openaiModelVision）做读字问答，输出模型回答与预期对照，用于确定标注样式参数。
 * 运行：npx tsx scripts/visionBaseline.ts
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig } from '../src/config';
import { CANDIDATE_SCRIPT } from '../src/services/locatorCandidateScript';
import { buildPluginInitScript } from '../src/services/pluginRuntime';
import { BUILTIN_PLUGIN_DEFS } from '../src/services/componentPlugins/builtin';
import OpenAI from 'openai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// —— 预期数据（供对照）——
const ROWS = 12;
const COLS = ['订单号', '客户', '金额', '状态', '城市', '备注'];
const DATA: string[][] = Array.from({ length: ROWS }, (_, i) => [
  `SO-2026-082${i}${i}`,
  `客户公司${i}号（全称：某某科技第${i}分公司）`,
  `${(i + 1) * 1379}.50`,
  ['已发货', '待付款', '已完成', '已取消'][i % 4],
  ['杭州', '上海', '深圳', '北京', '成都'][i % 5],
  `备注${i}：含特殊字符 <>&" 与长文本片段测试`,
]);
const BUTTONS = ['新建订单', '批量导出', '审核通过', '驳回申请', '打印面单', '邮件通知', '标记完成', '归档'];

function buildPage(): string {
  const rows = DATA.map(
    (r, i) =>
      `<tr><td>${i + 1}</td>${r.map((c) => `<td>${c}</td>`).join('')}<td><button class="mini">编辑</button><button class="mini">删除</button></td></tr>`,
  ).join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font:12px/1.6 -apple-system,sans-serif;margin:24px;}
    table{border-collapse:collapse;font-size:12px}
    td,th{border:1px solid #ccc;padding:4px 8px}
    .toolbar button{margin-right:8px;padding:4px 12px}
    .mini{font-size:11px;padding:2px 6px}
    .hint{color:#888;font-size:11px}
  </style></head><body>
  <h3>订单管理（读字基线测试页）</h3>
  <div class="toolbar">${BUTTONS.map((b) => `<button>${b}</button>`).join('')}</div>
  <table><thead><tr><th>#</th>${COLS.map((c) => `<th>${c}</th>`).join('')}<th>操作</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="hint">提示行：本页共 ${ROWS} 行数据，字号 12px 模拟密集后台页面。</div>
  <form>
    <input placeholder="搜索订单号"/><select><option>全部状态</option><option>已发货</option></select>
    <input type="date" value="2026-08-28"/><button type="button">查询</button>
  </form>
  </body></html>`;
}

async function askVision(client: OpenAI, model: string, b64: string, question: string): Promise<string> {
  const res = await client.chat.completions.create({
    model,
    messages: [
      { role: 'user', content: [
        { type: 'text', text: question },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } },
      ] } as any,
    ],
  });
  return String(res.choices?.[0]?.message?.content ?? '(空)').trim();
}

async function main(): Promise<void> {
  const cfg = getConfig();
  if (!cfg.openaiApiKey || !cfg.openaiBaseUrl) {
    console.error('网关未配置');
    process.exit(1);
  }
  const client = new OpenAI({ baseURL: cfg.openaiBaseUrl, apiKey: cfg.openaiApiKey });

  const pageFile = path.join(__dirname, 'vision-baseline-page.html');
  fs.writeFileSync(pageFile, buildPage());

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(`file://${pageFile}`);
  await page.waitForTimeout(500);

  // 1) 原始截图：PNG vs JPEG(q80) 体积与读字对比
  const rawB64 = (await page.screenshot({ type: 'png', scale: 'css' })).toString('base64');
  const rawJpgB64 = (await page.screenshot({ type: 'jpeg', quality: 80, scale: 'css' })).toString('base64');
  const kb = (b: string) => Math.round((b.length * 3) / 4 / 1024);
  console.log(`原始截图体积：PNG ${kb(rawB64)}KB → JPEG(q80) ${kb(rawJpgB64)}KB`);

  // 2) 编号标注截图：CANDIDATE_SCRIPT（头部含运行时框架与 collect/draw 定义）+ 内置插件 → collect → draw
  await page.addInitScript(CANDIDATE_SCRIPT);
  await page.addInitScript(
    buildPluginInitScript(BUILTIN_PLUGIN_DEFS.map((d) => ({ id: d.name, code: d.entryFile }))),
  );
  await page.reload();
  await page.waitForTimeout(400);
  const collect = (await page.evaluate(() => (window as any).__ttCollectInteractive?.() ?? [])) as string[];
  await page.evaluate(() => (window as any).__ttDrawOverlays?.());
  const markedB64 = (await page.screenshot({ type: 'png', scale: 'css' })).toString('base64');

  console.log(`截图大小：PNG ${kb(rawB64)}KB / 编号标注 PNG ${kb(markedB64)}KB / 发模型 JPEG ${kb(rawJpgB64)}KB`);
  console.log(`\n【页面编号清单（collect，共 ${collect.length} 项）】\n${collect.join('\n')}`);

  const q1 = '这是一张 1920×1080 的后台管理页截图。请精确回答：表格第 5 行（序号列=5）的「订单号」列的完整值是什么？逐字符抄写，不要猜测。';
  const q2 = '请按从左到右顺序列出顶部工具栏中所有按钮的完整文本。';
  const q3 = '图中蓝色边框上的白色数字编号是否清晰可读？请读出你看到的任意 5 个编号及其旁边的元素文字。';

  console.log('\n===== PNG 截图读字 =====');
  const a1 = await askVision(client, cfg.openaiModel, rawB64, q1);
  console.log(`Q1（第5行订单号，预期含 "${DATA[4][0]}"）：\n${a1}`);
  const a2 = await askVision(client, cfg.openaiModel, rawB64, q2);
  console.log(`\nQ2（按钮列表，预期 ${BUTTONS.join('/')}）：\n${a2}`);

  console.log('\n===== JPEG(q80) 截图读字（发模型的目标格式） =====');
  const a1j = await askVision(client, cfg.openaiModel, rawJpgB64, q1);
  console.log(`Q1（第5行订单号）：\n${a1j}`);
  const a2j = await askVision(client, cfg.openaiModel, rawJpgB64, q2);
  console.log(`\nQ2（按钮列表）：\n${a2j}`);

  console.log('\n===== 编号标注截图读字 =====');
  const a3 = await askVision(client, cfg.openaiModel, markedB64, q3);
  console.log(`Q3（编号可读性）：\n${a3}`);
  const a4 = await askVision(client, cfg.openaiModel, markedB64, q1);
  console.log(`\nQ4（标注后第5行订单号复读，预期含 "${DATA[4][0]}"）：\n${a4}`);

  // 自动判定
  const check = (ans: string, expect: string) => (ans.includes(expect) ? '✓ 正确' : '✗ 错误/不可读');
  console.log('\n===== 判定 =====');
  console.log(`PNG    订单号：${check(a1, DATA[4][0])}`);
  console.log(`PNG    按钮：${BUTTONS.filter((b) => a2.includes(b)).length}/${BUTTONS.length} 个被正确读出`);
  console.log(`JPEG   订单号：${check(a1j, DATA[4][0])}`);
  console.log(`JPEG   按钮：${BUTTONS.filter((b) => a2j.includes(b)).length}/${BUTTONS.length} 个被正确读出`);
  console.log(`标注截图 编号读字：${a3.includes('清晰') ? '✓ 清晰可读' : '⚠️ 需人工复核'}`);
  console.log(`标注截图 订单号：${check(a4, DATA[4][0])}`);

  await browser.close();
  fs.rmSync(pageFile, { force: true });
}

main().catch((e) => {
  console.error('基线测试失败：', e);
  process.exit(1);
});
