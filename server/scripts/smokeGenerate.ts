/**
 * 智能体模式生成冒烟（真网关）：直接调 generateService.generate，模拟 confirmPlan，
 * 轮询生成记录状态直到 DONE/ERROR，打印工具轨迹与落库步骤。
 * 目标页：tests/fixtures/element-plus.html（经临时静态服务器）。
 * 运行：npx tsx scripts/smokeGenerate.ts
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate, confirmPlan } from '../src/services/generationService';
import { prisma } from '../src/db';
import { isConfigured } from '../src/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, '..', 'tests', 'fixtures');

function serve(dir: string): Promise<string> {
  const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent((req.url ?? '/').replace(/^\//, '')) || 'index.html';
      const file = path.join(dir, rel);
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'content-type': mime[path.extname(file)] ?? 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as any).port}`));
  });
}

async function main(): Promise<void> {
  if (!isConfigured()) {
    console.error('网关未配置');
    process.exit(1);
  }
  const base = await serve(FIXTURES);
  const startUrl = `${base}/element-plus.html`;
  const jobId = `smoke-${Date.now()}`;
  console.log(`[smoke] jobId=${jobId}\n[smoke] startUrl=${startUrl}`);

  // 模拟用户确认计划（大纲为软约束，循环按页面实际执行）
  const confirmer = setInterval(() => {
    const ok = confirmPlan(jobId, [
      { kind: 'action', instruction: '在页面下拉框中选择一个选项' },
      { kind: 'action', instruction: '在日期选择器中设置日期 2026-05-04' },
      { kind: 'assert', instruction: '断言日期输入框包含 2026-05-04' },
    ]);
    if (ok) {
      clearInterval(confirmer);
      console.log('[smoke] 大纲已确认');
    }
  }, 2000);
  setTimeout(() => clearInterval(confirmer), 120_000);

  // 兜底超时：10 分钟强杀
  const killer = setTimeout(() => {
    console.error('[smoke] 超时（10 分钟），强制退出');
    process.exit(2);
  }, 600_000);
  killer.unref();

  // 异步启动生成（其内部会自行落库/发事件）
  generate(jobId, {
    nl: '在下拉框中选择任意一个选项；然后把日期选择器设置为 2026-05-04；最后断言日期输入框中包含文本 2026-05-04。',
    startUrl,
    projectId: null,
    testCaseId: null,
  }).catch((e) => console.error('[smoke] generate 异常退出：', e));

  // 轮询生成记录状态
  for (;;) {
    await new Promise((r) => setTimeout(r, 3000));
    const log = await prisma.generationLog.findUnique({ where: { jobId } });
    if (!log) {
      console.log('[smoke] 等待生成记录创建…');
      continue;
    }
    if (log.status === 'DONE') {
      const steps = (log.scriptSteps as any[]) ?? [];
      console.log(`\n[smoke] ✅ 生成完成，共 ${steps.length} 步：`);
      for (const s of steps) {
        const loc = s.locator ? `${s.locator.strategy}=${String(s.locator.value).slice(0, 40)}${s.locator.scope ? ' (scope)' : ''}` : '';
        console.log(`  - [${s.kind}${s.pluginAction ? '/plugin' : ''}] ${s.action ?? ''} ${s.instruction ?? ''} ${loc} ${s.value ?? ''}`);
      }
      console.log(`\n[smoke] usage：${JSON.stringify(log.totalUsage)}`);
      break;
    }
    if (log.status === 'ERROR') {
      console.error(`\n[smoke] ❌ 生成失败：${log.error}`);
      const toolSteps = await prisma.generationStep.findMany({ where: { logId: log.id, type: 'TOOL' }, orderBy: { createdAt: 'asc' } });
      for (const s of toolSteps) console.log(`  [tool] ${s.tool} | ${s.message?.slice(0, 80)} | ${s.result?.slice(0, 120)}`);
      process.exitCode = 1;
      break;
    }
    const toolCount = await prisma.generationStep.count({ where: { logId: log.id, type: 'TOOL' } });
    console.log(`[smoke] 状态=${log.status} 工具步=${toolCount}`);
  }
  clearTimeout(killer);
  await prisma.$disconnect();
  process.exit(process.exitCode ?? 0);
}

main();
