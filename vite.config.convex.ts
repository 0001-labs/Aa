import { defineConfig } from 'vite-plus'
import { resolve } from 'path'
export default defineConfig({
  build: {
    copyPublicDir: false,
    outDir: 'dist', emptyOutDir: false,
    lib: { entry: resolve(__dirname, 'src/convex.ts'), formats: ['es'], fileName: () => 'convex.js' },
    sourcemap: true, target: 'es2022',
  },
})
