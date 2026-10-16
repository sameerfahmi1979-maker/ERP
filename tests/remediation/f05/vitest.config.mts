import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fluentTestServer, fluentTestAliases } from '../fluent-test-config.mts';
export default defineConfig({
  resolve: { alias: { ...fluentTestAliases, '@': path.resolve('src'), 'server-only': path.resolve('tests/unit/server-only.ts') } },
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    // Tabster 8.8.0 has a legacy CJS main; transform real Fluent/Tabster through
    // Vite like Next does, rather than Node's unsupported named-CJS-import path.
    server: fluentTestServer,
    environment: 'jsdom', fileParallelism: false, include: ['tests/remediation/f05/*.test.{ts,tsx}'],
    // Preserve real per-window Storage when supported Node versions also expose
    // host-level getters. This is the same browser setup used by the aggregate.
    setupFiles: ['tests/remediation/f01/offline-setup.ts', 'tests/remediation/f04/browser-storage.setup.ts', 'tests/remediation/f05/setup.ts'],
  },
});
