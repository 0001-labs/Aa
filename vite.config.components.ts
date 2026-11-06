import { defineConfig } from "vite-plus";
import { resolve } from "path";

// Design system 1's components, on their own: aa.js imports this the first time a document needs one.
const lazyIcons = {
  name: "aa-lazy-icons",
  enforce: "pre" as const,
  resolveId(id: string) { return id.endsWith("generated/icons-extra") ? { id: "./aa-icons-extra.js", external: true } : null },
};

export default defineConfig({
  plugins: [lazyIcons],
  build: {
    copyPublicDir: false,
    outDir: "dist",
    emptyOutDir: false,
    lib: { entry: resolve(__dirname, "src/components.ts"), formats: ["es"], fileName: () => "aa-components.js" },
    sourcemap: true,
    rolldownOptions: { output: { codeSplitting: false } },
    target: "es2022",
    cssTarget: ["chrome123", "edge123", "firefox120", "safari17.5"],
  },
});
