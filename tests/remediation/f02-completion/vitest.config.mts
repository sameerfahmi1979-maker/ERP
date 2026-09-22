import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({
  test: { environment: 'node', include: ['tests/remediation/f02-completion/**/*.test.{ts,tsx}'] },
  resolve: { alias: [
    ...(process.env.F02_UI_BEFORE === '1' ? [{ find: '@/components/layout/app-header', replacement: path.resolve(import.meta.dirname, '../../../CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F02_COMPLETION/private/pre-edit/src/components/layout/app-header.tsx') }] : []),
    { find: '@', replacement: path.resolve(import.meta.dirname, '../../../src') },
  ] },
});
