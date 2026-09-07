// 把「插件开发模板项目」与「tt-plugin-from-source 技能」分别打包成 ZIP 供插件管理页下载。
// 单一事实源说明（本文件的耦合关系，移动/重构下列目录时必须同步检查这里）：
//   - 模板自有文件在 downloads/plugin-template/；
//   - 验收 harness 引自 server/scripts/pluginHarness.ts（与平台注入运行时同步的唯一来源），
//     其依赖的 Playwright 桥 server/scripts/pluginPwBridge.ts 需一并嵌入（同目录配对）；
//   - references/ 与 examples/ 引自 downloads/skills/tt-component-plugin/（旧技能的共享资产），
//     两个 zip 打包时各自组合进去，使技能包自包含。
// 文件均经 Vite ?raw 内联进前端包，开发期与 Tauri 生产构建都能取到内容；
// ZIP 用既有的 stored 格式写入器在前端生成。
import { buildZip } from './zip';
import tplReadme from '../../downloads/plugin-template/README.md?raw';
import tplIndex from '../../downloads/plugin-template/index.js?raw';
import tplManifest from '../../downloads/plugin-template/manifest.json?raw';
import tplPackage from '../../downloads/plugin-template/package.json?raw';
import tplGitignore from '../../downloads/plugin-template/.gitignore?raw';
import tplFixture from '../../downloads/plugin-template/tests/fixtures/sample-widget.html?raw';
import harnessTs from '../../server/scripts/pluginHarness.ts?raw';
import pwBridgeTs from '../../server/scripts/pluginPwBridge.ts?raw';
import refApi from '../../downloads/skills/tt-component-plugin/references/plugin-api.md?raw';
import refLines from '../../downloads/skills/tt-component-plugin/references/red-lines.md?raw';
import exAntd from '../../downloads/skills/tt-component-plugin/examples/antd-select.js?raw';
import exDatepicker from '../../downloads/skills/tt-component-plugin/examples/element-plus-datepicker.js?raw';
import exBadge from '../../downloads/skills/tt-component-plugin/examples/custom-badge.js?raw';
import skillMd from '../../downloads/skills/tt-plugin-from-source/SKILL.md?raw';

const enc = new TextEncoder();

const SKILL_README = `tt-plugin-from-source 技能 — 让编程 agent 扫描被测项目源码，为特色组件自动生成测试工具插件

安装：将 tt-plugin-from-source 文件夹整体放到
  · 项目级：<被测应用>/.claude/skills/
  · 全局：~/.claude/skills/

放入后，Claude Code 等编程 agent 听到「为项目特色组件生成测试插件 / 自研组件接入测试工具」
等诉求时会自动加载该技能：分析项目源码 → 推导并实测 DOM 契约 → 生成四插槽插件（detect/candidates/annotate/actions）
→ 用随包 scripts/pluginHarness.ts 离线验收 → 交付 .js / .zip。
上传到测试工具「插件管理」页后，记得在「预设」Tab 加入预设并关联测试项目，插件才会生效。
`;

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

function downloadZip(files: { name: string; data: Uint8Array }[], filename: string) {
  const blob = new Blob([buildZip(files)], { type: 'application/zip' });
  triggerDownload(blob, filename);
}

/** 打包插件开发模板项目为 ZIP 并触发浏览器下载。 */
export function downloadPluginTemplateZip() {
  downloadZip([
    { name: 'tt-plugin-template/README.md', data: enc.encode(tplReadme) },
    { name: 'tt-plugin-template/index.js', data: enc.encode(tplIndex) },
    { name: 'tt-plugin-template/manifest.json', data: enc.encode(tplManifest) },
    { name: 'tt-plugin-template/package.json', data: enc.encode(tplPackage) },
    { name: 'tt-plugin-template/.gitignore', data: enc.encode(tplGitignore) },
    { name: 'tt-plugin-template/tests/fixtures/sample-widget.html', data: enc.encode(tplFixture) },
    { name: 'tt-plugin-template/harness/pluginHarness.ts', data: enc.encode(harnessTs) },
    { name: 'tt-plugin-template/harness/pluginPwBridge.ts', data: enc.encode(pwBridgeTs) },
    { name: 'tt-plugin-template/references/plugin-api.md', data: enc.encode(refApi) },
    { name: 'tt-plugin-template/references/red-lines.md', data: enc.encode(refLines) },
    { name: 'tt-plugin-template/examples/antd-select.js', data: enc.encode(exAntd) },
    { name: 'tt-plugin-template/examples/element-plus-datepicker.js', data: enc.encode(exDatepicker) },
    { name: 'tt-plugin-template/examples/custom-badge.js', data: enc.encode(exBadge) },
  ], 'tt-plugin-template.zip');
}

/** 打包 tt-plugin-from-source 技能为 ZIP 并触发浏览器下载。 */
export function downloadPluginSkillZip() {
  downloadZip([
    { name: 'tt-plugin-from-source/SKILL.md', data: enc.encode(skillMd) },
    { name: 'tt-plugin-from-source/references/plugin-api.md', data: enc.encode(refApi) },
    { name: 'tt-plugin-from-source/references/red-lines.md', data: enc.encode(refLines) },
    { name: 'tt-plugin-from-source/examples/antd-select.js', data: enc.encode(exAntd) },
    { name: 'tt-plugin-from-source/examples/element-plus-datepicker.js', data: enc.encode(exDatepicker) },
    { name: 'tt-plugin-from-source/examples/custom-badge.js', data: enc.encode(exBadge) },
    { name: 'tt-plugin-from-source/scripts/pluginHarness.ts', data: enc.encode(harnessTs) },
    { name: 'tt-plugin-from-source/scripts/pluginPwBridge.ts', data: enc.encode(pwBridgeTs) },
    { name: 'README.txt', data: enc.encode(SKILL_README) },
  ], 'tt-plugin-from-source.zip');
}
