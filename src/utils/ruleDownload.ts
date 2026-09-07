// 把「测试友好代码」规则文件打包成单个 .md 供下载，供被测应用开发人员并入 CLAUDE.md/AGENTS.md。
// 规则源文件在仓库 downloads/rules/，经 Vite ?raw 内联进前端包，开发期与 Tauri 生产构建都能取到内容。
import ruleMd from '../../downloads/rules/test-friendly-code.md?raw';

/** 触发下载 test-friendly-code.md。 */
export function downloadRule() {
  const blob = new Blob([ruleMd], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'test-friendly-code.md';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
