import { defineConfig } from "vite-plus";

export default defineConfig({
  server: { port: 5195 },
  // The playground, published at aa.0001.dev; dist/ is the library's.
  build: { outDir: "site" },
  test: { environment: "happy-dom", include: ["tests/**/*.test.ts"] },
});
