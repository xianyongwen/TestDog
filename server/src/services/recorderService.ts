import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { publish } from '../ws/hub';
import { parseCodegen } from '../codegen/parseCodegen';
import { codegenBrowserArgs } from '../browser';
import type { TestStep } from '../shared/testScript';

/** 定位 playwright 的 cli.js（开发期 node_modules/playwright/cli.js）。 */
function playwrightCli(): string {
  const candidates = [
    path.resolve('node_modules/playwright/cli.js'),
    path.resolve('node_modules/playwright-core/cli.js'),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  throw new Error('找不到 playwright CLI');
}

interface Recording {
  proc: any;
  outFile: string;
  processed: boolean;
  /** 读取 codegen 进程的 stderr（惰性累积）。 */
  stderr: () => string;
}
const recordings = new Map<string, Recording>();

/** 模块②：启动 playwright codegen 录制（headed 浏览器）。 */
export async function startRecording(jobId: string, url: string): Promise<void> {
  const outFile = path.join(os.tmpdir(), `codegen-${jobId}.js`);
  const cli = playwrightCli();
  const browserArgs = codegenBrowserArgs();
  const proc = spawn(
    process.execPath,
    [cli, 'codegen', '--target=javascript', '-o', outFile, url, ...browserArgs, '--viewport-size=1920,1080'],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  // 收集 codegen stderr，便于浏览器缺失/启动失败时给出清晰报错
  let stderrBuf = '';
  proc.stderr?.on('data', (d) => {
    stderrBuf += String(d);
  });
  recordings.set(jobId, { proc, outFile, processed: false, stderr: () => stderrBuf });
  publish({ type: 'record:status', jobId, status: 'recording', message: '录制中，请在弹出的浏览器里操作；完成后点「停止并导入」' });

  // 用户直接关闭 codegen 浏览器 -> 进程退出 -> 自动导入
  proc.on('exit', () => {
    importRecording(jobId).catch(() => {});
  });
}

/** 停止录制并导入解析结果。 */
export async function stopRecording(jobId: string): Promise<void> {
  const r = recordings.get(jobId);
  if (!r) return;
  try {
    r.proc.kill('SIGTERM');
  } catch {
    /* 忽略 */
  }
  // 等待文件落盘
  await new Promise((res) => setTimeout(res, 500));
  await importRecording(jobId);
}

async function importRecording(jobId: string): Promise<void> {
  const r = recordings.get(jobId);
  if (!r || r.processed) return;
  r.processed = true;

  let steps: TestStep[] = [];
  let rawCode = '';
  try {
    rawCode = fs.readFileSync(r.outFile, 'utf-8');
    steps = parseCodegen(rawCode);
  } catch (e) {
    const detail = r.stderr().trim();
    const hint = detail ? `；codegen 输出：${detail.slice(-300)}` : '';
    publish({ type: 'record:error', jobId, message: `读取录制文件失败：${String(e)}${hint}` });
    return;
  } finally {
    recordings.delete(jobId);
    try {
      fs.unlinkSync(r.outFile);
    } catch {
      /* 忽略 */
    }
  }
  publish({ type: 'record:imported', jobId, steps, rawCode });
}
