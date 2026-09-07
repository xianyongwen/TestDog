import { cpSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'tsup';

// 所有 node_modules 依赖外置：运行时从随包 node_modules 加载，
// 确保 better-sqlite3 原生模块、playwright、stagehand 等正常工作。
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));
const external = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.devDependencies || {}),
];

// 内置插件源码目录：builtin.ts 在运行时按「本模块目录/sources」读取，
// dev/test 即 src 下源文件；构建后必须位于 dist/sources/（prepare-sidecar 随 dist 打进安装包）。
const SOURCES_DIR = fileURLToPath(new URL('./src/services/componentPlugins/sources', import.meta.url));

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'es2022', // 支持 top-level await
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: false,
  external,
  // ESM 下为可能使用 require 的依赖提供 require（原生模块等）
  banner: {
    js: "import { createRequire as __cr } from 'module';const require=__cr(import.meta.url);",
  },
  onSuccess: async () => {
    cpSync(SOURCES_DIR, fileURLToPath(new URL('./dist/sources', import.meta.url)), { recursive: true });
  },
});
