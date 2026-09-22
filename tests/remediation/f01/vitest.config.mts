import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({
 resolve: { alias: { '@': path.resolve('src') } },
 test: { environment:'node', include:['tests/remediation/f01/*.test.ts'],
 setupFiles:['tests/remediation/f01/offline-setup.ts'], fileParallelism:false,
 reporters:['default','json'], outputFile:'CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F01/UNIT_RESULTS.json' }
});
