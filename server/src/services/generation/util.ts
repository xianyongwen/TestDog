import type { TestStep } from '../../shared/testScript';
import { legacyToUnifiedSystemVars } from '../../shared/envVars';
import { getAttachment } from '../attachmentService';
import type { SplitImage } from './types';

/** 旧写法归一化：模型输出的 ${systemTime} 等系统变量统一改写为 {{...}}（运行时两种写法等价，
 *  统一只为口径一致：提示词/文档/前端检测都以 {{...}} 为准）。归一化幂等，重复调用无副作用。 */
export function normalizeStepSystemVars(step: TestStep): TestStep {
  const norm = (t: string | undefined | null): string | undefined => legacyToUnifiedSystemVars(t);
  step.instruction = norm(step.instruction);
  step.url = norm(step.url);
  step.value = norm(step.value);
  if (step.locator) {
    step.locator.value = norm(step.locator.value) ?? step.locator.value;
    if (step.locator.name != null) step.locator.name = norm(step.locator.name) ?? step.locator.name;
    if (step.locator.scope) {
      step.locator.scope.value = norm(step.locator.scope.value) ?? step.locator.scope.value;
      if (step.locator.scope.name != null) step.locator.scope.name = norm(step.locator.scope.name) ?? step.locator.scope.name;
    }
  }
  if (step.assertion) {
    step.assertion.expected = norm(step.assertion.expected);
    step.assertion.jsonPath = norm(step.assertion.jsonPath);
  }
  return step;
}

/** 把附件归一化为「文本 + 图片」两部分。图片附件以原始图（多模态）直发主模型；
 *  旧「描述模式」保存的图片（content 为描述文本、无原始图）拼文本描述；两者皆无（异常）→ 占位提示。 */
export function buildAttachmentParts(atts: NonNullable<ReturnType<typeof getAttachment>>[]): { text: string; images: SplitImage[] } {
  const textParts: string[] = [];
  const images: SplitImage[] = [];
  for (const a of atts) {
    if (a.isImage) {
      if (a.imageB64) {
        images.push({ name: a.name, imageB64: a.imageB64, imageMime: a.imageMime ?? a.mime });
      } else if (a.content) {
        textParts.push(`\n\n[附件 ${a.name}]\n${a.content}`);
      } else {
        textParts.push(`\n\n[附件 ${a.name}]（图片附件，未能提取内容）`);
      }
    } else {
      textParts.push(`\n\n[附件 ${a.name}]\n${a.content}`);
    }
  }
  return { text: textParts.join(''), images };
}

export function trunc(t: string, n: number): string {
  return t.length > n ? t.slice(0, n) + '…' : t;
}

export function stripFences(s: string): string {
  return s.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

export function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}
