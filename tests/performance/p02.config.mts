import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  resolve: { alias: { "@": path.resolve("src"), "server-only": path.resolve("tests/unit/server-only.ts") } },
  test: { environment: "node", fileParallelism: false,
    include: ["tests/performance/read-*.test.ts", "tests/performance/read-cache.test.tsx", "tests/performance/session-scope.test.tsx", "tests/performance/lookup-cache.test.tsx", "tests/performance/p02-*.test.ts"],
    setupFiles: ["tests/remediation/f01/offline-setup.ts"] },
});
