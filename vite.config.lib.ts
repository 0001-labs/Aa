import { defineConfig } from "vite-plus";
import { resolve } from "path";

export default defineConfig({
  build: {
    copyPublicDir: false,
    outDir: "dist",
    emptyOutDir: false,
    lib: { entry: resolve(__dirname, "src/index.ts"), formats: ["es"], fileName: () => "aa.js" },
    sourcemap: true,
    // Keep the Sync 1 core snapshot self-contained, including optional shared words.
    rolldownOptions: { output: { codeSplitting: false } },
    target: "es2022",
    // aa.css rides inside aa.js; lowered, light-dark() needs a color-scheme the page may not have, and the toolbar would draw nothing.
    cssTarget: ["chrome123", "edge123", "firefox120", "safari17.5"],
  },
});
