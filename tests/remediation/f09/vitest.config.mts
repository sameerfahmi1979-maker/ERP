import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({
  resolve: { alias: { '@': path.resolve('src') } },
  test: { environment: 'node', fileParallelism: false, setupFiles: ['tests/remediation/f09/offline.ts'],
    include: ['tests/remediation/f09/*.test.ts', 'src/lib/report-center/__tests__/schedule-worker.test.ts'], exclude: ['**/*.local.test.ts'] },
});
