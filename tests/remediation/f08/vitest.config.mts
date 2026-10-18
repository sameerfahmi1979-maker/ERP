import { defineConfig } from "vitest/config";
import path from "node:path";
import { fluentTestServer, fluentTestAliases } from "../fluent-test-config.mts";
export default defineConfig({
  resolve: { alias: { ...fluentTestAliases, "@": path.resolve("src") } }, oxc: { jsx: { runtime: "automatic" } },
  test: {
    server: fluentTestServer, environment: "node", fileParallelism: false,
    setupFiles: ["tests/unit/server-only.ts"],
    exclude: ["**/node_modules/**", "**/*.local.test.ts"],
    include: ["tests/remediation/f08/*.test.{ts,tsx}", "tests/remediation/f06/issued-branding-coordinator.test.ts", "src/lib/output/__tests__/*.test.ts", "src/lib/official-documents/__tests__/*.test.ts"],
  },
});
