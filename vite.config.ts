import { defineConfig } from "vite-plus";

export default defineConfig({
  server: { port: 5195 },
  test: { environment: "happy-dom", include: ["tests/**/*.test.ts"] },
});
