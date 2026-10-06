import { defineConfig } from "vitest/config";
import path from "node:path";
import {fluentTestServer} from "../remediation/fluent-test-config.mts";
export default defineConfig({
  resolve: { alias: { "@": path.resolve("src"), "server-only": path.resolve("tests/unit/server-only.ts") } },
  test: { server: fluentTestServer, environment: "node", fileParallelism: false,
    include: ["tests/performance/p04-*.test.ts", "tests/performance/p04-*.test.tsx", "tests/performance/configuration-choices.test.tsx"],
    setupFiles: ["tests/remediation/f01/offline-setup.ts"] },
});
