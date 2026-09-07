/**
 * 一次性回填：修正历史生成记录的 totalUsage。
 * 历史上步骤 usage 有两种记账口径，按序判定：
 * 1. terminal（done/error）步骤带 usage → 直接采用（旧口径=最终累计快照；新口径=运行时累计，均等于真实总消耗）；
 * 2. 无 terminal usage（中途取消等）→ 看序列形态：
 *    - usage 序列单调不减 → 旧「累计快照」口径 → 取最后一个值；
 *    - 序列有回落 → 「逐调用差分」口径 → 取 Σ（排除 done/error）。
 * 运行：关闭桌面应用后执行 npx tsx --env-file=.env scripts/recomputeUsage.ts
 */
import { prisma } from '../src/db';
import { STEP_TYPE } from '../src/services/generationLogService';

interface Usage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedTokens: number;
}

function toUsage(u: any): Usage | null {
  if (!u) return null;
  const usage: Usage = {
    inputTokens: Number(u.inputTokens ?? 0),
    outputTokens: Number(u.outputTokens ?? 0),
    totalTokens: Number(u.totalTokens ?? 0),
    cachedTokens: Number(u.cachedTokens ?? 0),
  };
  if (!usage.totalTokens && !usage.inputTokens && !usage.outputTokens) return null; // 全 0 视为无记账
  return usage;
}

async function main(): Promise<void> {
  const logs = await prisma.generationLog.findMany({
    select: { id: true, totalUsage: true },
    orderBy: { createdAt: 'asc' },
  });
  let changed = 0;
  for (const log of logs) {
    // JSON 列在 SQLite 下过滤能力有限，取全量后在 JS 侧筛选（单条记录步骤数有限）
    const rows = await prisma.generationStep.findMany({
      where: { logId: log.id },
      select: { type: true, usage: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    const withUsage = rows.map((r) => ({ type: r.type, usage: toUsage(r.usage) })).filter((r) => r.usage);
    const terminal = [...withUsage].reverse().find((r) => r.type === STEP_TYPE.DONE || r.type === STEP_TYPE.ERROR);
    let usage: Usage | null = null;
    if (terminal) {
      usage = terminal.usage;
    } else if (withUsage.length) {
      const totals = withUsage.map((r) => r.usage!.totalTokens);
      const monotonic = totals.every((v, i) => i === 0 || v >= totals[i - 1]);
      if (monotonic) {
        usage = withUsage[withUsage.length - 1].usage; // 累计快照口径：最后一个值
      } else {
        // 差分口径：Σ（此时无 terminal usage，全部参与求和）
        usage = withUsage.reduce(
          (acc, r) => ({
            inputTokens: acc.inputTokens + r.usage!.inputTokens,
            outputTokens: acc.outputTokens + r.usage!.outputTokens,
            totalTokens: acc.totalTokens + r.usage!.totalTokens,
            cachedTokens: acc.cachedTokens + r.usage!.cachedTokens,
          }),
          { inputTokens: 0, outputTokens: 0, totalTokens: 0, cachedTokens: 0 },
        );
      }
    }
    if (!usage) continue;
    const cur = toUsage(log.totalUsage);
    if (cur && cur.totalTokens === usage.totalTokens && cur.inputTokens === usage.inputTokens) continue;
    await prisma.generationLog.update({ where: { id: log.id }, data: { totalUsage: usage } });
    changed++;
    console.log(`[${log.id}] ${cur ? `${cur.totalTokens}` : '空'} -> ${usage.totalTokens} (input ${cur?.inputTokens ?? 0} -> ${usage.inputTokens})`);
  }
  console.log(`共 ${logs.length} 条记录，修正 ${changed} 条`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
