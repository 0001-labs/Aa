import { defineConfig } from 'vite-plus'
import { resolve } from 'path'
// The language and the marker's drawing are entries of their own, loaded
// from beside the diagram: the language so a page or a server can read a
// diagram without carrying its element, the marker once a diagram needs it.
const beside = ['./diagram-language', './marker']
export default defineConfig({
  plugins: [{ name: 'entries-beside', enforce: 'pre' as const, resolveId: (id: string) => beside.includes(id) ? { id: `${id}.js`, external: true } : null }],
  build: {
    copyPublicDir: false,
    outDir: 'dist', emptyOutDir: false,
    lib: { entry: resolve(__dirname, 'src/diagram.ts'), formats: ['es'], fileName: () => 'diagram.js' },
    sourcemap: true, target: 'es2022',
  },
})
