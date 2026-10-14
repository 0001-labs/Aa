import { defineConfig } from 'vite-plus'
import { resolve } from 'path'

export default defineConfig({
  build: {
    copyPublicDir: false,
    outDir: 'dist', emptyOutDir: false,
    lib: { entry: resolve(__dirname, 'src/react.ts'), formats: ['es'], fileName: () => 'react.js' },
    rolldownOptions: { external: ['react', '@0001-labs/aa'] },
    sourcemap: true, target: 'es2022',
  },
})
