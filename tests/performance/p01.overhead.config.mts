import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  resolve: { alias: { "@": path.resolve("src"), "server-only": path.resolve("tests/unit/server-only.ts") } },
  test: { environment: "node", fileParallelism: false, include: ["tests/performance/p01.overhead.test.ts"], testTimeout: 30000 },
});
