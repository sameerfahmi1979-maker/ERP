import { defineConfig } from "vitest/config";
import path from "node:path";
import { fluentTestAliases, fluentTestServer } from "../remediation/fluent-test-config.mts";
export default defineConfig({ resolve: { alias: { ...fluentTestAliases, "@": path.resolve("src"), "server-only": path.resolve("tests/unit/server-only.ts") } }, oxc: { jsx: { runtime: "automatic" } }, test: { server: fluentTestServer, environment: "node", fileParallelism: false, include: ["tests/ai-mod03/*.test.ts", "tests/ai-mod03/*.test.tsx"], setupFiles: ["tests/remediation/f01/offline-setup.ts", "tests/remediation/f04/browser-storage.setup.ts"] } });
