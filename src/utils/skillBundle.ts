// 把 generate-testcase 技能打包成 ZIP 供下载。
// 技能源文件在仓库 downloads/skills/generate-testcase/（本仓库的本地安装副本
// .claude/skills/generate-testcase 是指向它的符号链接），经 Vite ?raw 内联进前端包，
// 故开发期与 Tauri 生产构建都能取到内容；ZIP 用既有的 stored 格式写入器在前端生成。
import { buildZip } from './zip';
import skillMd from '../../downloads/skills/generate-testcase/SKILL.md?raw';
import schemaMd from '../../downloads/skills/generate-testcase/testcase-schema.md?raw';
import exLogin from '../../downloads/skills/generate-testcase/examples/login-flow.testcase?raw';
import exApi from '../../downloads/skills/generate-testcase/examples/api-json-assert.testcase?raw';
import exWs from '../../downloads/skills/generate-testcase/examples/websocket-notify.testcase?raw';

const enc = new TextEncoder();

const README = `generate-testcase 技能 — 供编程 agent 生成可导入本工具的 .testcase 用例

安装：将 generate-testcase 文件夹整体放到
  · 项目级：<被测应用>/.claude/skills/
  · 全局：~/.claude/skills/

放入后，Claude Code 等编程 agent 听到「写 E2E 测试用例 / 接口断言 / WebSocket 断言」
等诉求时会自动加载该技能，产出 .testcase 文件，在本工具「用例列表」页导入即可回放。
`;

/** 打包 generate-testcase 技能为 ZIP 并触发浏览器下载。 */
export function downloadSkillZip() {
  const files = [
    { name: 'generate-testcase/SKILL.md', data: enc.encode(skillMd) },
    { name: 'generate-testcase/testcase-schema.md', data: enc.encode(schemaMd) },
    { name: 'generate-testcase/examples/login-flow.testcase', data: enc.encode(exLogin) },
    { name: 'generate-testcase/examples/api-json-assert.testcase', data: enc.encode(exApi) },
    { name: 'generate-testcase/examples/websocket-notify.testcase', data: enc.encode(exWs) },
    { name: 'README.txt', data: enc.encode(README) },
  ];
  const blob = new Blob([buildZip(files)], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'generate-testcase.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
