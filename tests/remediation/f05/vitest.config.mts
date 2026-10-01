import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fluentTestServer } from '../fluent-test-config.mts';
export default defineConfig({
  resolve: { alias: { '@': path.resolve('src'), 'server-only': path.resolve('tests/unit/server-only.ts') } },
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    // Tabster 8.8.0 has a legacy CJS main; transform real Fluent/Tabster through
    // Vite like Next does, rather than Node's unsupported named-CJS-import path.
    server: fluentTestServer,
    environment: 'jsdom', fileParallelism: false, include: ['tests/remediation/f05/*.test.{ts,tsx}'], setupFiles: ['tests/remediation/f01/offline-setup.ts', 'tests/remediation/f05/setup.ts'],
  },
});
