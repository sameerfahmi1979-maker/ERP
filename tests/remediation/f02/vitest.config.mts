import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({
 resolve: { alias: { '@': path.resolve(process.env.F02_REPRO_BASELINE === '1'
   ? 'CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F02_RELEASE_PREREQUISITES/private/pre-edit/src' : 'src') } },
 test: { environment:'node', include:['tests/remediation/f02/*.test.ts'],
 setupFiles:['tests/remediation/f01/offline-setup.ts'], fileParallelism:false,
 reporters:['default','json'], outputFile:'CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F02_RELEASE_PREREQUISITES/UNIT_RESULTS.json' }
});
