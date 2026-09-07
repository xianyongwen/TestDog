import type { FastifyInstance } from 'fastify';
import {
  getConfig,
  isConfigured,
  saveConfig,
  DEFAULT_SPLIT_SYSTEM_PROMPT,
  REASONING_EFFORTS,
  type AppConfig,
  type ReasoningEffort,
} from '../config';
import { detectSystemChrome, isSystemBrowserMode } from '../browser';

function mask(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '****';
  return key.slice(0, 4) + '****' + key.slice(-4);
}

function settingsBody(c: AppConfig) {
  return {
    openaiApiKey: mask(c.openaiApiKey),
    openaiApiKeySet: Boolean(c.openaiApiKey),
    openaiBaseUrl: c.openaiBaseUrl,
    openaiModel: c.openaiModel,
    openaiModelVision: c.openaiModelVision,
    maxSteps: c.maxSteps,
    browserPath: c.browserPath,
    splitSystemPrompt: c.splitSystemPrompt,
    reasoningEffort: c.reasoningEffort,
    defaultSplitSystemPrompt: DEFAULT_SPLIT_SYSTEM_PROMPT,
    detectedBrowserPath: detectSystemChrome() ?? '',
    systemBrowserMode: isSystemBrowserMode(),
    configured: isConfigured(),
    generationLogRetentionDays: c.generationLogRetentionDays,
  };
}

export default async function settingsRoutes(app: FastifyInstance) {
  app.get('/api/settings', async () => settingsBody(getConfig()));

  app.post('/api/settings', async (req) => {
    const body = (req.body ?? {}) as Partial<AppConfig> & { openaiApiKey?: string };
    const partial: Partial<AppConfig> = {};
    // 仅当显式传入非空值时才更新密钥（避免把掩码回写）
    if (body.openaiApiKey && !body.openaiApiKey.includes('****')) {
      partial.openaiApiKey = body.openaiApiKey;
    }
    if (typeof body.openaiBaseUrl === 'string') partial.openaiBaseUrl = body.openaiBaseUrl;
    if (typeof body.openaiModel === 'string') partial.openaiModel = body.openaiModel;
    if (typeof body.openaiModelVision === 'boolean') partial.openaiModelVision = body.openaiModelVision;
    if (typeof body.maxSteps === 'number') partial.maxSteps = body.maxSteps;
    if (typeof body.browserPath === 'string') partial.browserPath = body.browserPath.trim();
    if (typeof body.splitSystemPrompt === 'string' && body.splitSystemPrompt.trim()) {
      partial.splitSystemPrompt = body.splitSystemPrompt;
    }
    if (typeof body.reasoningEffort === 'string' && REASONING_EFFORTS.includes(body.reasoningEffort as ReasoningEffort)) {
      partial.reasoningEffort = body.reasoningEffort as ReasoningEffort;
    }
    // 保留天数：null=永久；>0=天数；<=0/缺省=不动（维持当前值）
    if (body.generationLogRetentionDays === null) partial.generationLogRetentionDays = null;
    else if (typeof body.generationLogRetentionDays === 'number' && body.generationLogRetentionDays > 0) {
      partial.generationLogRetentionDays = Math.floor(body.generationLogRetentionDays);
    }
    return settingsBody(saveConfig(partial));
  });
}
