import {defineConfig} from "vitest/config";
import path from "node:path";
import {fluentTestAliases,fluentTestServer} from "../../remediation/fluent-test-config.mts";

// New composition contracts, not a replacement for the F03-F06/PERF suites.
export default defineConfig({
  resolve:{alias:{...fluentTestAliases,"@":path.resolve("src"),"server-only":path.resolve("tests/unit/server-only.ts")}},
  test:{server:fluentTestServer,environment:"node",fileParallelism:false,
    include:["tests/integration/f00-f06/selectors/*.test.{ts,tsx}","tests/performance/f06-perf-*.test.{ts,tsx}"],
    setupFiles:["tests/remediation/f01/offline-setup.ts","tests/remediation/f04/browser-storage.setup.ts"]},
});
