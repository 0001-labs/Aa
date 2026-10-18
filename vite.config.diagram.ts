import { defineConfig } from 'vite-plus'
import { resolve } from 'path'
// The marker's drawing is its own entry, loaded from beside the diagram once a diagram needs it.
export default defineConfig({
  plugins: [{ name: 'marker-beside', enforce: 'pre' as const, resolveId: (id: string) => id === './marker' ? { id: './marker.js', external: true } : null }],
  build: {
    copyPublicDir: false,
    outDir: 'dist', emptyOutDir: false,
    lib: { entry: resolve(__dirname, 'src/diagram.ts'), formats: ['es'], fileName: () => 'diagram.js' },
    sourcemap: true, target: 'es2022',
  },
})
