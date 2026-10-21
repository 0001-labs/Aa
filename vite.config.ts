import { defineConfig } from "vite-plus";

export default defineConfig({
  server: { port: 5195 },
  // The playground, the front page of aa.0001.dev, built into site/ over the documentation (website/); dist/ is the library's.
  // CSS for browsers that know light-dark(): lowered, it needs a color-scheme in
  // this build's own CSS, and the playground's is in public/ds1, so the toolbar's
  // fill came out as two colours and drew nothing.
  build: { outDir: "site", cssTarget: ["chrome123", "edge123", "firefox120", "safari17.5"] },
  test: { environment: "happy-dom", include: ["tests/**/*.test.ts"] },
});
