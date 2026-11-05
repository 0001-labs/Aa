import { defineConfig } from "vite-plus";
import { resolve } from "path";

// Design system 1's other icons, on their own: aa.js imports this the first time a page asks for one.
export default defineConfig({
  build: {
    copyPublicDir: false,
    outDir: "dist",
    emptyOutDir: false,
    lib: { entry: resolve(__dirname, "src/vendor/ds1/2-core/generated/icons-extra.ts"), formats: ["es"], fileName: () => "aa-icons-extra.js" },
    target: "es2022",
  },
});
