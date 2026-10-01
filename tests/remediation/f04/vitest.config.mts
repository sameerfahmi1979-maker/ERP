import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fluentTestServer } from '../fluent-test-config.mts';
export default defineConfig({
  resolve: { alias: { '@': path.resolve('src') } },
  oxc: { jsx: { runtime: 'automatic' } },
  test: { server: fluentTestServer, environment: 'node', fileParallelism: false, include: ['tests/remediation/f04/*.test.{ts,tsx}'], setupFiles: ['tests/remediation/f01/offline-setup.ts'] },
});
