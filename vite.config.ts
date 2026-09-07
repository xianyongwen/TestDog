import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// 前端开发：Vite 跑在 :1420，把 /api 与 /ws 代理到后端 :4123（同源，免 CORS）。
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'server/src/shared'),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:4123', changeOrigin: true },
      '/ws': { target: 'ws://127.0.0.1:4123', ws: true },
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        // Tailwind v4 官方 SCSS 用法即 @import "tailwindcss"，静默 Sass 对该语法的弃用警告
        silenceDeprecations: ['import'],
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
