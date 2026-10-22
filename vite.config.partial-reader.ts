import { defineConfig } from 'vite-plus'
import { resolve } from 'path'
export default defineConfig({
  build: {
    copyPublicDir: false,
    outDir: 'dist', emptyOutDir: false,
    lib: { entry: resolve(__dirname, 'src/partial-reader.ts'), formats: ['es'], fileName: () => 'partial-reader.js' },
    rolldownOptions: { output: { codeSplitting: false } },
    sourcemap: true, target: 'es2022',
  },
})
