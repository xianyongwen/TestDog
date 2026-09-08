import type OpenAI from 'openai';
import { prisma } from '../../db';
import type { TestStep } from '../../shared/testScript';
import type { PlanStep } from './types';
import type { SubstitutionState } from './substitution';
import { redactGenerationData } from './privacy';

export interface GenerationCheckpoint {
  messages: OpenAI.ChatCompletionMessageParam[];
  steps: TestStep[];
  goalText: string;
  outline: PlanStep[];
  substitution: SubstitutionState;
}

// 浏览器会话仍活着时以内存检查点为准；数据库失败不丢掉可续跑状态。
const checkpoints = new Map<string, GenerationCheckpoint>();
export function clearCheckpoint(jobId: string): void { checkpoints.delete(jobId); }

export async function saveCheckpoint(jobId: string, checkpoint: GenerationCheckpoint): Promise<void> {
  const snapshot = structuredClone({ ...redactGenerationData(jobId, checkpoint), substitution: checkpoint.substitution });
  checkpoints.set(jobId, snapshot);
  await prisma.generationLog.update({ where: { jobId }, data: { loopState: snapshot as any } });
}

export async function loadCheckpoint(jobId: string): Promise<GenerationCheckpoint | null> {
  const memory = checkpoints.get(jobId);
  if (memory) return structuredClone(memory);
  const saved = await prisma.generationLog.findUnique({ where: { jobId }, select: { loopState: true } });
  return saved?.loopState && typeof saved.loopState === 'object' ? saved.loopState as unknown as GenerationCheckpoint : null;
}
