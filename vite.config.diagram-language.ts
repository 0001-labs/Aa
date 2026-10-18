import { defineConfig } from 'vite-plus'
import { resolve } from 'path'
export default defineConfig({
  build: {
    copyPublicDir: false,
    outDir: 'dist', emptyOutDir: false,
    lib: { entry: resolve(__dirname, 'src/diagram-language.ts'), formats: ['es'], fileName: () => 'diagram-language.js' },
    sourcemap: true, target: 'es2022',
  },
})
