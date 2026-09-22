import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({
  resolve: { alias: {
    '@': path.resolve('src'),
    'https://esm.sh/@supabase/supabase-js@2.106.2': path.resolve('tests/remediation/f02-repair/no-db.ts'),
  } },
  test: {
    environment: 'node', fileParallelism: false,
    include: [
      'tests/remediation/f01/*.test.ts',
      'tests/remediation/f02/*.test.ts',
      'tests/remediation/f02-repair/*.test.ts',
      'tests/remediation/f02-completion/*.test.{ts,tsx}',
    ],
    setupFiles: ['tests/remediation/f01/offline-setup.ts'],
  },
});
