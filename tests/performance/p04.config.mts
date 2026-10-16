import { defineConfig } from "vitest/config";
import path from "node:path";
import {fluentTestAliases,fluentTestServer} from "../remediation/fluent-test-config.mts";
export default defineConfig({
  // Match the real browser/ESM entry used by F05, not a second CJS Keyborg runtime.
  // Test environment, offline guards, assertions and file coverage are unchanged.
  resolve: { alias: { ...fluentTestAliases, "@": path.resolve("src"), "server-only": path.resolve("tests/unit/server-only.ts") } },
  test: { server: fluentTestServer, environment: "node", fileParallelism: false,
    include: ["tests/performance/p04-*.test.ts", "tests/performance/p04-*.test.tsx", "tests/performance/configuration-choices.test.tsx", ...["dms-browser", "dms-dashboard", "dms-approvals", "dms-entity-documents", "hr-dashboard", "hr-search", "hr-document-browser"].map(name => `tests/performance/${name}-*.test.{ts,tsx}`)],
    setupFiles: ["tests/remediation/f01/offline-setup.ts"] },
});
