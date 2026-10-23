import { defineConfig } from 'vite-plus'
import { resolve } from 'node:path'
export default defineConfig({ build: {
  copyPublicDir: false, outDir: 'dist', emptyOutDir: false,
  lib: { entry: resolve(__dirname, 'src/comments-markdown.ts'), formats: ['es'], fileName: () => 'comments-markdown.js' },
  rolldownOptions: { output: { codeSplitting: false } }, target: 'es2022', sourcemap: true,
} })
