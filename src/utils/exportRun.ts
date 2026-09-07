import ExcelJS, { type CellValue, type RichText } from 'exceljs';
import { STEP_ACTION_LABEL, STEP_STATUS_LABEL } from '@shared/constants';
import type { TestStep } from '@shared/testScript';
import { apiBase } from '../api/client';
import type { TokenUsage } from './token';

/** 导出用的步骤结果（与 TestCaseDetail 中的 StepResult 结构兼容）。 */
export interface RunStepExport {
  stepIndex: number;
  action: string;
  status: string;
  message?: string;
  durationMs?: number;
  healed: boolean;
  healedLocator?: unknown;
  screenshot?: string;
  consoleLog?: string;
  networkLog?: string;
}

export interface RunExportInput {
  runId: string;
  caseTitle: string;
  steps: RunStepExport[];
  stepUsages?: Record<number, TokenUsage>;
  logs?: string;
}

function safeName(s: string) {
  return s.replace(/[\\/:*?"<>|]/g, '_').trim() || '测试结果';
}

function fileName(input: RunExportInput, ext: string) {
  return `${safeName(input.caseTitle)}-${input.runId.slice(0, 8)}.${ext}`;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** 截图嵌入单元格后的最大显示尺寸（px），等比缩放。 */
const SHOT_MAX_W = 220;
const SHOT_MAX_H = 150;

/** 汇总表失败截图的嵌入尺寸上限（px），等比缩放（行高 43pt 内）。 */
const REPORT_SHOT_W = 100;
const REPORT_SHOT_H = 56;

/** exceljs 颜色用 8 位 ARGB；失败红字。 */
const RED = 'FFFF0000';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** 拉取截图并转为 base64，同时取自然尺寸；文件已被清理或读取失败时返回 null。 */
async function fetchScreenshot(name: string): Promise<{ base64: string; width: number; height: number } | null> {
  try {
    const res = await fetch(`${apiBase}/api/screenshots/${name}`);
    if (!res.ok) return null;
    const blob = await res.blob();
    const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
        URL.revokeObjectURL(url);
      };
      img.onerror = (e) => {
        URL.revokeObjectURL(url);
        reject(e);
      };
      img.src = url;
    });
    const base64 = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result).split(',')[1] ?? '');
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
    return { base64, ...size };
  } catch {
    return null;
  }
}

/** 导出为 JSON：保留步骤原始字段 + token 用量 + 运行日志，便于回溯/二次处理。 */
export function exportRunJSON(input: RunExportInput) {
  const payload = {
    format: 'run-result',
    version: 1,
    runId: input.runId,
    caseTitle: input.caseTitle,
    exportedAt: new Date().toISOString(),
    steps: input.steps.map((s) => ({ ...s, tokenUsage: input.stepUsages?.[s.stepIndex] ?? null })),
    logs: input.logs ?? null,
  };
  triggerDownload(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), fileName(input, 'json'));
}

/** 导出为 Excel：步骤结果一个 sheet（截图直接嵌入单元格），运行日志（若有）一个 sheet。 */
export async function exportRunExcel(input: RunExportInput) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('步骤结果');
  const headers = ['序号', '动作', '状态', '自愈', '耗时(ms)', 'Token', '缓存Token', '信息', '自愈定位器', '截图'];
  ws.addRow(headers).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  for (const s of input.steps) {
    const u = input.stepUsages?.[s.stepIndex];
    const row = ws.addRow([
      s.stepIndex + 1,
      STEP_ACTION_LABEL[s.action] ?? s.action,
      STEP_STATUS_LABEL[s.status] ?? s.status,
      s.healed ? '是' : '否',
      s.durationMs ?? '',
      u?.totalTokens ?? '',
      u?.cachedTokens ?? '',
      s.message ?? '',
      s.healedLocator ? JSON.stringify(s.healedLocator) : '',
    ]);
    if (!s.screenshot) continue;
    const shot = await fetchScreenshot(s.screenshot);
    if (!shot) {
      // 截图文件已被清理或读取失败：回退为文件名
      row.getCell(headers.length).value = s.screenshot;
      continue;
    }
    // 图片锚定在本行"截图"列单元格左上角，等比缩放到上限尺寸内；行高同步撑开（px→pt）
    const scale = Math.min(SHOT_MAX_W / shot.width, SHOT_MAX_H / shot.height, 1);
    const w = Math.round(shot.width * scale);
    const h = Math.round(shot.height * scale);
    const imgId = wb.addImage({ base64: shot.base64, extension: 'png' });
    ws.addImage(imgId, {
      tl: { col: headers.length - 1, row: row.number - 1 },
      ext: { width: w, height: h },
      editAs: 'oneCell',
    });
    row.height = Math.max(row.height ?? 15, h * 0.75 + 4);
  }

  const colWidths = [6, 10, 8, 6, 10, 12, 12, 40, 30, 30];
  colWidths.forEach((width, i) => {
    ws.getColumn(i + 1).width = width;
  });

  if (input.logs) {
    const logWs = wb.addWorksheet('日志');
    logWs.getColumn(1).width = 100;
    for (const line of ['日志', ...input.logs.split('\n')]) logWs.addRow([line]);
  }

  const buf = await wb.xlsx.writeBuffer();
  triggerDownload(new Blob([buf], { type: XLSX_MIME }), fileName(input, 'xlsx'));
}

// ---- 批量测试报告导出 ----

/** 批量报告中单个用例的数据（run 为空表示被跳过等未产生运行记录）。 */
export interface BatchReportCase {
  testCaseId: string;
  title: string;
  status: string;
  message?: string;
  run?: {
    id: string;
    steps: RunStepExport[];
    /** 脚本原始步骤（取说明拼「步骤」列，与 steps 按下标对应）。 */
    scriptSteps?: TestStep[];
    logs?: string;
    stepUsages?: Record<number, TokenUsage>;
  };
}

export interface BatchReportInput {
  projectName?: string;
  /** 报告名：表内标题与文件名标签；缺省批量用「批量测试报告」，文件名用「测试报告」。 */
  reportName?: string;
  cases: BatchReportCase[];
}

// 用例级状态标签：在步骤状态之外补充批量运行特有的取值。
const CASE_STATUS_LABEL: Record<string, string> = {
  ...STEP_STATUS_LABEL,
  RUNNING: '运行中',
  CANCELLED: '已取消',
  ERROR: '异常',
};

/** 本地时间戳，用于报告文件名，如 20260906-120130。 */
function tsStamp(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** 步骤说明：优先编辑器里的说明 description，退回 instruction / 动作中文名。 */
function stepDesc(s: TestStep) {
  return (s.description || s.instruction || STEP_ACTION_LABEL[s.action] || s.action).trim();
}

/**
 * 「步骤」列富文本：脚本各步骤说明用 -> 串联，其中运行失败的步骤红字。
 * 失败判定来自步骤结果（与 scriptSteps 按下标对应），无运行数据时返回普通文本。
 */
function stepChainCell(c: BatchReportCase): CellValue {
  const scriptSteps = c.run?.scriptSteps ?? [];
  if (!scriptSteps.length) return '';
  const failed = new Set((c.run?.steps ?? []).filter((s) => s.status === 'FAILED').map((s) => s.stepIndex));
  const runs: RichText[] = [];
  scriptSteps.forEach((s, i) => {
    if (i > 0) runs.push({ text: '->' });
    runs.push(failed.has(i) ? { text: stepDesc(s), font: { color: { argb: RED } } } : { text: stepDesc(s) });
  });
  return { richText: runs };
}

/** 用 canvas 绘制通过与失败用例的饼图，返回 base64 PNG（2x 绘制保证清晰度）。 */
function renderCasePieChart(passed: number, failed: number): string {
  const W = 460;
  const H = 250;
  const canvas = document.createElement('canvas');
  canvas.width = W * 2;
  canvas.height = H * 2;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(2, 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  const total = passed + failed;
  const slices = [
    { label: '通过', value: passed, color: '#52c41a' },
    { label: '失败', value: failed, color: '#ff4d4f' },
  ];

  // 饼图（自顶部顺时针）
  const cx = 120;
  const cy = H / 2;
  const r = 85;
  let start = -Math.PI / 2;
  for (const s of slices) {
    if (!s.value) continue;
    const angle = (s.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, start + angle);
    ctx.closePath();
    ctx.fillStyle = s.color;
    ctx.fill();
    // 扇区占比标注（过小的扇区不标，避免文字重叠）
    if (s.value / total >= 0.06) {
      const mid = start + angle / 2;
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${Math.round((s.value / total) * 100)}%`, cx + Math.cos(mid) * r * 0.6, cy + Math.sin(mid) * r * 0.6);
    }
    start += angle;
  }
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = '#e8e8e8';
  ctx.lineWidth = 1;
  ctx.stroke();

  // 图例
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'left';
  slices.forEach((s, i) => {
    const y = cy - 20 + i * 38;
    ctx.fillStyle = s.color;
    ctx.fillRect(262, y - 8, 16, 16);
    ctx.fillStyle = '#333';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${s.label}用例 ${s.value}（${total ? Math.round((s.value / total) * 100) : 0}%）`, 286, y);
  });
  return canvas.toDataURL('image/png').split(',')[1];
}

/** 导出批量测试报告（Excel）：汇总（一行一个用例 + 合计行）+ 步骤明细 + 各用例日志。 */
export async function exportBatchReport(input: BatchReportInput) {
  const wb = new ExcelJS.Workbook();

  // 汇总 sheet：标题、生成时间、用例结果表（表头加粗 + 冻结前 4 行）。
  const ws = wb.addWorksheet('汇总');
  ws.columns = [
    { width: 6 }, { width: 24 }, { width: 8 }, { width: 8 }, { width: 6 }, { width: 6 }, { width: 6 }, { width: 60 }, { width: 40 },
  ];
  const prefix = input.projectName?.trim() ?? '';
  ws.addRow([`${prefix ? `${prefix} ` : ''}${input.reportName ?? '批量测试报告'}`]);
  ws.addRow([`生成时间：${new Date().toLocaleString('zh-CN')}`]);
  ws.addRow([]);
  ws.addRow(['序号', '用例', '状态', '步骤数', '通过', '失败', '跳过', '步骤', '信息']).font = { bold: true };
  const totals = { steps: 0, pass: 0, fail: 0, skip: 0 };
  // 失败用例待嵌入的截图（行号 → 第一个失败步骤的截图文件）
  const imageTasks: { rowNum: number; filename: string }[] = [];
  input.cases.forEach((c, i) => {
    const steps = c.run?.steps ?? [];
    const byStatus = (st: string) => steps.filter((s) => s.status === st).length;
    totals.steps += steps.length;
    totals.pass += byStatus('PASSED');
    totals.fail += byStatus('FAILED');
    totals.skip += byStatus('SKIPPED');
    const row = ws.addRow([
      i + 1,
      c.title,
      CASE_STATUS_LABEL[c.status] ?? c.status,
      steps.length,
      byStatus('PASSED'),
      byStatus('FAILED'),
      byStatus('SKIPPED'),
      stepChainCell(c),
      c.message ?? '',
    ]);
    // 未通过的用例：用例名红字（「步骤」列已按失败步骤单独红字）；信息列嵌入失败步骤截图
    if (c.status === 'FAILED') {
      row.getCell(2).font = { color: { argb: RED } };
      const shot = steps.find((s) => s.status === 'FAILED' && s.screenshot)?.screenshot;
      if (shot) imageTasks.push({ rowNum: row.number, filename: shot });
    }
  });
  // 并行嵌入失败截图：锚在「信息」列，纵向略下移给信息文字留出顶部空间，等比缩放进 100×56
  await Promise.all(
    imageTasks.map(async ({ rowNum, filename }) => {
      const shot = await fetchScreenshot(filename);
      if (!shot) return; // 截图文件已被清理或读取失败，跳过嵌入
      const scale = Math.min(REPORT_SHOT_W / shot.width, REPORT_SHOT_H / shot.height, 1);
      const imgId = wb.addImage({ base64: shot.base64, extension: 'png' });
      ws.addImage(imgId, {
        tl: { col: 8, row: rowNum - 1 + 0.14 },
        ext: { width: Math.round(shot.width * scale), height: Math.round(shot.height * scale) },
        editAs: 'oneCell',
      });
      ws.getRow(rowNum).height = 43;
    }),
  );
  ws.addRow([]);
  ws.addRow(['合计', '', '', totals.steps, totals.pass, totals.fail, totals.skip, '', '']);
  // 末尾两行：用例级通过/失败统计
  ws.addRow([]);
  const passedCases = input.cases.filter((c) => c.status === 'PASSED').length;
  const failedCases = input.cases.filter((c) => c.status === 'FAILED').length;
  ws.addRow(['通过用例数', passedCases]);
  const failedCasesRow = ws.addRow(['失败用例数', failedCases]);
  if (failedCases > 0) failedCasesRow.getCell(2).font = { color: { argb: RED } };
  // 饼图：通过与失败用例分布（嵌入图片，exceljs 不支持原生图表）
  if (passedCases + failedCases > 0) {
    const chartRow = ws.addRow([]);
    const imgId = wb.addImage({ base64: renderCasePieChart(passedCases, failedCases), extension: 'png' });
    ws.addImage(imgId, { tl: { col: 0, row: chartRow.number - 1 }, ext: { width: 460, height: 250 } });
  }

  // 步骤明细 sheet：所有用例的步骤结果，前面加用例列；失败步骤整行红字。
  if (input.cases.some((c) => (c.run?.steps ?? []).length)) {
    const dws = wb.addWorksheet('步骤明细');
    dws.columns = [
      { width: 24 }, { width: 6 }, { width: 10 }, { width: 8 }, { width: 6 }, { width: 40 }, { width: 30 }, { width: 20 },
    ];
    dws.addRow(['用例', '序号', '动作', '状态', '自愈', '信息', '自愈定位器', '截图']).font = { bold: true };
    dws.views = [{ state: 'frozen', ySplit: 1 }];
    for (const c of input.cases) {
      for (const s of c.run?.steps ?? []) {
        const row = dws.addRow([
          c.title,
          s.stepIndex + 1,
          STEP_ACTION_LABEL[s.action] ?? s.action,
          STEP_STATUS_LABEL[s.status] ?? s.status,
          s.healed ? '是' : '否',
          s.message ?? '',
          s.healedLocator ? JSON.stringify(s.healedLocator) : '',
          s.screenshot ?? '',
        ]);
        if (s.status === 'FAILED') row.font = { color: { argb: RED } };
      }
    }
  }

  // 日志 sheet：各用例运行日志按块排列（【用例标题】起头）。
  const logged = input.cases.filter((c) => c.run?.logs);
  if (logged.length) {
    const lws = wb.addWorksheet('日志');
    lws.getColumn(1).width = 100;
    for (const c of logged) {
      lws.addRow([`【${c.title}】`]);
      c.run!.logs!.split('\n').forEach((l) => lws.addRow([l]));
      lws.addRow(['']);
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  triggerDownload(new Blob([buf], { type: XLSX_MIME }), `${prefix ? `${safeName(prefix)}-` : ''}${input.reportName ?? '测试报告'}-${tsStamp()}.xlsx`);
}
