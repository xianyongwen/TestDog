import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseCsv } from 'csv-parse/sync';
import mammoth from 'mammoth';
// 直接引 pdf-parse 内部实现：包入口 index.js 在 module.parent 为空（ESM createRequire
// 加载）时会进 debug 分支去读仓库里的测试 PDF 并抛错，lib/pdf-parse.js 可绕开。
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import * as XLSX from 'xlsx';
import { getScreenshotDir } from '../config';

export interface Attachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  isImage: boolean;
  /** 归一化结果：文本文件为提取的文本；图片为空（原始图直发主模型）。 */
  content: string;
  /** 图片原始数据（base64）与真实 MIME：生成时直接以多模态发给主模型。 */
  imageB64?: string;
  imageMime?: string;
  createdAt: number;
}

export const MAX_FILE_SIZE = 20 * 1024 * 1024;
/** 单个附件注入 prompt 的文本上限（超出截断，避免撑爆上下文）。 */
export const MAX_CONTENT_CHARS = 100_000;
const TTL_MS = 60 * 60 * 1000;

const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp', 'image/svg+xml']);
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg']);
const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
};

/** 会话内附件缓存：上传时即归一化，生成时按 id 取用；TTL 过期自动清理。 */
const store = new Map<string, Attachment>();

// ---- 磁盘持久化：附件在服务重启（tsx watch 热载 / 手动重启）后仍可用 ----
const STORE_DIR = path.join(path.dirname(getScreenshotDir()), 'attachments');

function persist(a: Attachment): void {
  try {
    fs.writeFileSync(path.join(STORE_DIR, `${a.id}.json`), JSON.stringify(a), 'utf-8');
  } catch {
    /* 写盘失败不影响内存使用 */
  }
}

function unpersist(id: string): void {
  try {
    fs.rmSync(path.join(STORE_DIR, `${id}.json`), { force: true });
  } catch {
    /* 忽略 */
  }
}

/** 启动时把磁盘上未过期的附件恢复进内存。 */
function loadPersisted(): void {
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(STORE_DIR);
  } catch {
    return;
  }
  for (const f of entries) {
    if (!f.endsWith('.json')) continue;
    try {
      const a = JSON.parse(fs.readFileSync(path.join(STORE_DIR, f), 'utf-8')) as Attachment;
      if (a?.id && typeof a.content === 'string') store.set(a.id, a);
    } catch {
      /* 损坏文件忽略 */
    }
  }
}

fs.mkdirSync(STORE_DIR, { recursive: true });
loadPersisted();

export function getAttachment(id: string): Attachment | undefined {
  const a = store.get(id);
  if (!a) return undefined;
  if (Date.now() - a.createdAt > TTL_MS) {
    store.delete(id);
    unpersist(id);
    return undefined;
  }
  return a;
}

export function deleteAttachment(id: string) {
  store.delete(id);
  unpersist(id);
}

function sweep() {
  const now = Date.now();
  for (const [id, a] of store) {
    if (now - a.createdAt > TTL_MS) {
      store.delete(id);
      unpersist(id);
    }
  }
}

function imageMimeOf(mime: string, ext: string): string {
  return MIME_BY_EXT[ext] ?? (mime.startsWith('image/') ? mime : 'image/png');
}

export async function storeAttachment(file: {
  name: string;
  mime: string;
  size: number;
  buffer: Buffer;
}): Promise<Attachment> {
  sweep();
  if (file.size > MAX_FILE_SIZE) throw new Error('文件过大（单文件上限 20MB）');

  const ext = path.extname(file.name).toLowerCase();
  const isImage = IMAGE_MIMES.has(file.mime) || IMAGE_EXTS.has(ext);

  // 图片附件统一保存原始图，生成时以多模态直发主模型。
  const content = isImage ? '' : (await loadText(file, ext));
  let imageB64: string | undefined;
  let imageMime: string | undefined;
  if (isImage) {
    imageMime = imageMimeOf(file.mime, ext);
    imageB64 = file.buffer.toString('base64');
  }

  const att: Attachment = {
    id: randomUUID(),
    name: file.name,
    mime: file.mime,
    size: file.size,
    isImage,
    content: content.slice(0, MAX_CONTENT_CHARS),
    imageB64,
    imageMime,
    createdAt: Date.now(),
  };
  store.set(att.id, att);
  persist(att);
  return att;
}

/** 提取文本（替代 @langchain loaders：txt/json/csv/docx/pdf 均为纯文本提取，无需 LLM 相关依赖）。 */
async function loadText(file: { name: string; buffer: Buffer }, ext: string): Promise<string> {
  switch (ext) {
    case '.xlsx':
    case '.xls':
      return loadExcel(file.buffer);
    case '.pdf':
      return loadPdf(file.buffer);
    case '.docx':
      return loadDocx(file.buffer);
    case '.csv':
      return loadCsv(file.buffer);
    case '.json':
      return loadJson(file.buffer);
    default:
      // .txt / .md / .log / .html / .xml / .yaml 等纯文本格式
      return file.buffer.toString('utf-8');
  }
}

/** PDF 文本提取（pdf-parse@1：仅文本路径，不带 pdfjs-dist/@napi-rs/canvas 等渲染依赖）。 */
async function loadPdf(buffer: Buffer): Promise<string> {
  const data = await pdfParse(buffer);
  return data.text;
}

/** DOCX 文本提取（mammoth.extractRawText，DocxLoader 内部同款实现）。 */
async function loadDocx(buffer: Buffer): Promise<string> {
  const { value } = await mammoth.extractRawText({ buffer });
  return value;
}

/** CSV：每行渲染为「列名: 值」，与原 CSVLoader 输出格式一致，便于模型阅读。 */
function loadCsv(buffer: Buffer): string {
  const records: Record<string, string>[] = parseCsv(buffer, {
    columns: true,
    bom: true,
    relax_column_count: true,
  });
  const blocks = records.map((row) =>
    Object.entries(row)
      .filter(([, v]) => v !== '' && v !== null && v !== undefined)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n'),
  );
  const text = blocks.join('\n\n');
  if (!text.trim()) throw new Error('未能从 CSV 中读取到内容');
  return text;
}

/** JSON：递归提取叶子值，输出「路径: 值」，与原 JSONLoader 行为对齐。 */
function loadJson(buffer: Buffer): string {
  const data: unknown = JSON.parse(buffer.toString('utf-8'));
  const lines: string[] = [];
  const walk = (node: unknown, prefix: string): void => {
    if (node === null || node === undefined) return;
    if (typeof node === 'string') {
      lines.push(prefix ? `${prefix}: ${node}` : node);
    } else if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, prefix ? `${prefix}[${i}]` : `[${i}]`));
    } else if (typeof node === 'object') {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        walk(v, prefix ? `${prefix}.${k}` : k);
      }
    } else {
      lines.push(prefix ? `${prefix}: ${String(node)}` : String(node));
    }
  };
  walk(data, '');
  const text = lines.join('\n');
  if (!text.trim()) throw new Error('未能从 JSON 中读取到内容');
  return text;
}

/** Excel 用 sheetjs 直接按工作表导出为 CSV 文本（@langchain 1.x 已移除 XLSXLoader）。 */
function loadExcel(buffer: Buffer): string {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const parts = wb.SheetNames.map((name) => `【工作表 ${name}】\n${XLSX.utils.sheet_to_csv(wb.Sheets[name])}`);
  const text = parts.join('\n\n');
  if (!text.trim()) throw new Error('未能从 Excel 中读取到内容');
  return text;
}
