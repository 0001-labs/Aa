import { defineConfig } from "vite-plus";
import { resolve } from "path";

// Design system 1's rarely-needed icons load on the first ask for one: a file beside aa.js, not part of it.
export const lazyIcons = {
  name: "aa-lazy-icons",
  enforce: "pre" as const,
  resolveId(id: string) { return id.endsWith("generated/icons-extra") ? { id: "./aa-icons-extra.js", external: true } : null },
};

// Files beside aa.js, loaded the first time a page needs them.
export const lazyFiles = {
  name: "aa-lazy-files",
  enforce: "pre" as const,
  resolveId(id: string) {
    if (id === "./components") return { id: "./aa-components.js", external: true };
    if (id === "./assist") return { id: "./aa-assist.js", external: true };
    return null;
  },
};

// Such a file reads Markdown with aa.js's own reader rather than a copy of it.
const shareCore = {
  name: "aa-share-core",
  enforce: "pre" as const,
  resolveId(id: string) { return id === "./markdown" ? { id: "./aa.js", external: true } : null; },
};

export const fileBeside = (entry: string, name: string) => defineConfig({
  plugins: [lazyIcons, shareCore],
  build: {
    copyPublicDir: false,
    outDir: "dist",
    emptyOutDir: false,
    lib: { entry: resolve(__dirname, entry), formats: ["es"], fileName: () => name },
    sourcemap: true,
    rolldownOptions: { output: { codeSplitting: false } },
    target: "es2022",
    cssTarget: ["chrome123", "edge123", "firefox120", "safari17.5"],
  },
});
