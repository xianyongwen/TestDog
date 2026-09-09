import type { TestIntent } from '../shared/testIntent';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { isConfigured } from '../config';
import { generate, confirmPlan, assistStep, pauseJob, continueGenerate, isJobRunning, type PlanStep, type AssistDecision } from '../services/generationService';
import { prisma } from '../db';
import { publish } from '../ws/hub';

export default async function generateRoutes(app: FastifyInstance) {
  /** 触发生成：立即返回 jobId，后续进度经 WS 推送（gen:status / gen:plan / gen:assist / gen:tool / gen:step / gen:done / gen:error）。 */
  app.post('/api/generate', async (req) => {
    const { nl, startUrl, projectId, testCaseId, loginConfigId, attachments } = (req.body ?? {}) as {
      nl?: string;
      startUrl?: string;
      projectId?: string;
      testCaseId?: string;
      loginConfigId?: string;
      attachments?: string[];
    };
    if (!nl) return { error: '缺少自然语言描述' };
    // 未配置时同步返回错误（走 HTTP 响应而非 WS，避免前端尚未绑定 jobId 导致消息被丢弃）
    if (!isConfigured()) return { error: '请先在「设置」中配置网关地址与密钥' };

    // 取项目环境变量：拆步 prompt 只用键，执行阶段用真实值（不进 prompt、不进 LLM）。
    const envMap: Record<string, string> = {};
    if (projectId) {
      const vars = await prisma.envVar.findMany({ where: { projectId }, select: { key: true, value: true } });
      for (const v of vars) envMap[v.key] = v.value;
    }

    const jobId = randomUUID();
    generate(jobId, { nl, startUrl, envMap, loginConfigId, attachments: attachments ?? [], projectId: projectId ?? null, testCaseId: testCaseId ?? null }).catch((e) =>
      publish({ type: 'gen:error', jobId, message: String(e) }),
    );
    return { jobId };
  });

  /** 预拆分完成后，用户确认/修改步骤计划并继续执行。 */
  app.post('/api/generate/:jobId/confirm', async (req) => {
    const { jobId } = req.params as { jobId: string };
    const { steps, intent } = (req.body ?? {}) as { steps?: PlanStep[]; intent?: TestIntent };
    if (!Array.isArray(steps) || !steps.length || !steps.every((s) => s && typeof s.instruction === 'string' && s.instruction.trim())) {
      return { error: '缺少有效的步骤列表' };
    }
    const ok = confirmPlan(jobId, steps, intent);
    if (typeof ok === 'string') return { error: ok };
    if (!ok) return { error: '该任务不在等待计划确认状态' };
    return { ok: true };
  });

  /** 某步定位失败时，用户选择重新描述 / AI 修正 / 手动操作 / 跳过 / 撤销部分步骤并重新生成。 */
  app.post('/api/generate/:jobId/assist', async (req) => {
    const { jobId } = req.params as { jobId: string };
    const { decision, instruction, from, to, nl } = (req.body ?? {}) as {
      decision?: string;
      instruction?: string;
      from?: number;
      to?: number;
      nl?: string;
    };
    if (!decision || !['redescribe', 'ai-fix', 'manual', 'skip', 'revoke'].includes(decision)) return { error: '未知决策' };
    let d: AssistDecision;
    if (decision === 'redescribe') {
      d = { decision: 'redescribe', instruction: String(instruction ?? '') };
    } else if (decision === 'revoke') {
      const f = Number(from);
      const t = Number(to);
      if (!Number.isInteger(f) || !Number.isInteger(t) || f < 1 || t < f) return { error: '撤销范围无效' };
      d = { decision: 'revoke', from: f, to: t, nl: nl ? String(nl) : undefined };
    } else {
      d = { decision: decision as 'ai-fix' | 'manual' | 'skip' };
    }
    const r = assistStep(jobId, d);
    if (r !== true) return { error: typeof r === 'string' ? r : '该任务不在等待用户协助状态' };
    return { ok: true };
  });

  /** 暂停生成：中断执行但保留浏览器会话（30 分钟内可通过 continue 继续）。 */
  app.post('/api/generate/:jobId/pause', async (req) => {
    const { jobId } = req.params as { jobId: string };
    return pauseJob(jobId) ? { ok: true } : { error: '该任务不在运行状态' };
  });

  /** 停止后继续生成：复用保留的浏览器会话，把已有步骤（可能被用户调整过）+ 追加描述发给模型拆分剩余步骤。 */
  app.post('/api/generate/:jobId/continue', async (req) => {
    const { jobId } = req.params as { jobId: string };
    const { nl, projectId, testCaseId, attachments, baseSteps, resumeLoop } = (req.body ?? {}) as {
      nl?: string;
      projectId?: string;
      testCaseId?: string;
      attachments?: string[];
      baseSteps?: unknown;
      resumeLoop?: boolean;
    };
    if (!nl) return { error: '缺少追加描述' };
    if (!Array.isArray(baseSteps)) return { error: '缺少已有步骤' };
    if (!isConfigured()) return { error: '请先在「设置」中配置网关地址与密钥' };

    const envMap: Record<string, string> = {};
    if (projectId) {
      const vars = await prisma.envVar.findMany({ where: { projectId }, select: { key: true, value: true } });
      for (const v of vars) envMap[v.key] = v.value;
    }

    if (isJobRunning(jobId)) return { error: '该任务正在执行或暂停收尾，请稍后继续' };
    continueGenerate(jobId, {
      nl,
      envMap,
      attachments: attachments ?? [],
      baseSteps: baseSteps as import('../shared/testScript').TestStep[],
      projectId: projectId ?? null,
      testCaseId: testCaseId ?? null,
      // 前端传 resumeLoop=true 时：读回暂停保存的循环状态直接续跑（不重新拆分/确认）
      resumeLoop: Boolean(resumeLoop),
    }).catch((e) => publish({ type: 'gen:error', jobId, message: String(e) }));
    return { ok: true };
  });
}
