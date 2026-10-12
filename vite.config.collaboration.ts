import { defineConfig } from 'vite-plus'
import { resolve } from 'path'
export default defineConfig({
  build: {
    copyPublicDir: false,
    outDir: 'dist', emptyOutDir: false,
    lib: { entry: resolve(__dirname, 'src/collaboration.ts'), formats: ['es'], fileName: () => 'collaboration.js' },
    rolldownOptions: { external: ['yjs'] }, sourcemap: true, target: 'es2022',
  },
})
