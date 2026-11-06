declare module '*.css?inline' { const css: string; export default css }
declare module '*.css'
declare module '*.svg?raw' { const source: string; export default source }
interface ImportMeta { glob<T>(pattern: string, options: { query: string; import: string; eager: true }): Record<string, T> }

declare module "*.svg?url" { const url: string; export default url }
