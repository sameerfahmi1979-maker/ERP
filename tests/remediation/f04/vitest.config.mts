import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({
  resolve: { alias: { '@': path.resolve('src') } },
  oxc: { jsx: { runtime: 'automatic' } },
  test: { environment: 'node', fileParallelism: false, include: ['tests/remediation/f04/*.test.{ts,tsx}'], setupFiles: ['tests/remediation/f01/offline-setup.ts'] },
});
