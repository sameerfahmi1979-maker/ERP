import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  resolve: { alias: { "@": path.resolve("src") } },
  test: { environment: "node", fileParallelism: false,
    include: ["tests/performance/p01-*.test.ts"],
    setupFiles: ["tests/remediation/f01/offline-setup.ts"] },
});
