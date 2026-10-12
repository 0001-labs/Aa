import { defineConfig } from "vite-plus";
import { resolve } from "path";

export default defineConfig({
  build: {
    copyPublicDir: false,
    outDir: "dist",
    emptyOutDir: false,
    lib: { entry: resolve(__dirname, "src/index.ts"), formats: ["es"], fileName: () => "aa.js" },
    sourcemap: true,
    target: "es2022",
  },
});
