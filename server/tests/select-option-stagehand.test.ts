import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createSession, closeSession } from '../src/services/stagehandManager';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, 'fixtures');
// 截图输出目录
const SHOT_DIR = path.join(__dirname, '..', 'screenshots', 'select-option');

let stagehand: any;
let jobId: string;

beforeAll(async () => {
  jobId = 'select-stagehand';
  stagehand = await createSession(jobId);
  fs.mkdirSync(SHOT_DIR, { recursive: true });
});

afterAll(async () => {
  await closeSession(jobId).catch(() => {});
});

/** 用用户指定的 API 路径取页面：stagehand.browser.context.pages()[0] */
async function page() {
  const ctx = stagehand.browser.context;
  const pages = await ctx.pages();
  return pages[0];
}

/** 截图保存到 screenshots/select-option/<name>.png。 */
async function shot(name: string): Promise<string> {
  const p = await page();
  const file = path.join(SHOT_DIR, `${name}.png`);
  await p.screenshot({ path: file, fullPage: true }).catch(() => {});
  return file;
}

/**
 * 对控件执行 stagehand locator.selectOption。
 * 关键：Stagehand 的 selectOption 返回 Promise<string[]>（实际选中的 value 数组），
 * 这是「是否真正选中」的权威判据——对非原生 <select> 会静默返回 []（不抛错）。
 */
async function trySelect(
  selector: string,
  value: string,
): Promise<{ apiError?: string; selectedValues: string[] }> {
  const p = await page();
  let apiError: string | undefined;
  let selectedValues: string[] = [];
  try {
    selectedValues = await p.locator(selector).selectOption(value);
  } catch (e: any) {
    apiError = String(e?.message ?? e).split('\n')[0];
  }
  return { apiError, selectedValues };
}

/** 读元素 DOM 值（辅助验证，读前等待异步渲染完成）。 */
async function readDom(expr: string, settleMs = 800): Promise<string> {
  const p = await page();
  await p.waitForTimeout(settleMs).catch(() => {});
  return p.evaluate((e) => {
    const fn = new Function('document', `return (${e});`);
    try {
      const v = fn(document);
      return v ?? '';
    } catch {
      return '';
    }
  }, expr);
}

describe('stagehand.browser.context.pages()[0].locator().selectOption() 兼容性验证', () => {
  it('原生 <select>：selectOption 返回选中的 value', async () => {
    const p = await page();
    await p.goto(`file://${FIXTURES}/native.html`, { timeout: 60000, waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1000);

    const r = await trySelect('#city', 'shanghai');
    console.log('[原生 select]', JSON.stringify(r));
    // 返回非空数组 = 选中成功
    expect(r.apiError).toBeUndefined();
    expect(r.selectedValues).toEqual(['shanghai']);

    // 辅助：DOM 值也确认
    const dom = await readDom(`document.getElementById('city').value`);
    expect(dom).toBe('shanghai');
    await shot('native-select');
  }, 90000);

  it('原生 input[type=date]：selectOption 静默返回空数组（未选中）', async () => {
    const p = await page();
    await p.goto(`file://${FIXTURES}/native.html`, { timeout: 60000, waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1000);

    const r = await trySelect('#date', '2026-08-19');
    console.log('[原生 date]', JSON.stringify(r));
    // 权威判据：返回空数组 → 未选中（尽管不抛错）
    expect(r.apiError).toBeUndefined();
    expect(r.selectedValues).toEqual([]);

    // 辅助：DOM 值仍为空
    const dom = await readDom(`document.getElementById('date').value`);
    expect(dom).toBe('');
    await shot('native-date');
  }, 90000);

  it('原生日期范围 start（date input）：selectOption 静默返回空数组', async () => {
    const p = await page();
    await p.goto(`file://${FIXTURES}/native.html`, { timeout: 60000, waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1000);

    const r = await trySelect('#rangeStart', '2026-08-01');
    console.log('[原生日期范围 start]', JSON.stringify(r));
    expect(r.apiError).toBeUndefined();
    expect(r.selectedValues).toEqual([]);
    await shot('native-date-range');
  }, 90000);

  it('element-plus el-select：selectOption 静默返回空数组（未选中）', async () => {
    const p = await page();
    await p.goto(`file://${FIXTURES}/element-plus.html`, { timeout: 60000, waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(5000);

    const r = await trySelect('.el-select', 'shanghai');
    console.log('[element-plus el-select]', JSON.stringify(r));
    const nativeCount = await page().then((pp) => pp.locator('select').count());
    console.log('[element-plus] 页内原生 <select> 数量:', nativeCount);
    expect(r.selectedValues).toEqual([]);

    // 辅助：选中项文本仍为空（未渲染出选中项）
    const selectedText = await readDom(`document.querySelector('.el-select__selected-item')?.textContent ?? ''`);
    console.log('[element-plus] 选中项文本:', JSON.stringify(selectedText));
    await shot('element-plus-select');
    // 额外：展开下拉，展示选项确实渲染（正确做法是点击选选项）
    await page().then((pp) => pp.locator('.el-select__wrapper').first().click({ timeout: 5000 }).catch(() => {}));
    await page().then((pp) => pp.waitForTimeout(600).catch(() => {}));
    await shot('element-plus-select-expanded');
  }, 90000);

  it('element-ui el-select：selectOption 静默返回空数组（未选中）', async () => {
    const p = await page();
    await p.goto(`file://${FIXTURES}/element-ui.html`, { timeout: 60000, waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(5000);

    const r = await trySelect('.el-select', 'shanghai');
    console.log('[element-ui el-select]', JSON.stringify(r));
    const nativeCount = await page().then((pp) => pp.locator('select').count());
    console.log('[element-ui] 页内原生 <select> 数量:', nativeCount);
    expect(r.selectedValues).toEqual([]);

    const inputVal = await readDom(`document.querySelector('.el-select .el-input__inner')?.value ?? ''`);
    console.log('[element-ui] el-input 值:', JSON.stringify(inputVal));
    await shot('element-ui-select');
    // 额外：展开下拉展示选项
    await page().then((pp) => pp.locator('.el-select').first().click({ timeout: 5000 }).catch(() => {}));
    await page().then((pp) => pp.waitForTimeout(600).catch(() => {}));
    await shot('element-ui-select-expanded');
  }, 90000);

  it('antd Select：selectOption 静默返回空数组（未选中）', async () => {
    const p = await page();
    await p.goto(`file://${FIXTURES}/antd.html`, { timeout: 60000, waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(5000);

    const r = await trySelect('.ant-select', 'shanghai');
    console.log('[antd Select]', JSON.stringify(r));
    const nativeCount = await page().then((pp) => pp.locator('select').count());
    console.log('[antd] 页内原生 <select> 数量:', nativeCount);
    expect(r.selectedValues).toEqual([]);

    const selectedText = await readDom(`document.querySelector('.ant-select-selection-item')?.textContent ?? ''`);
    console.log('[antd] 选中项文本:', JSON.stringify(selectedText));
    await shot('antd-select');
    // 额外：展开下拉展示选项
    await page().then((pp) => pp.locator('.ant-select').first().click({ timeout: 5000 }).catch(() => {}));
    await page().then((pp) => pp.waitForTimeout(600).catch(() => {}));
    await shot('antd-select-expanded');
  }, 90000);
});
