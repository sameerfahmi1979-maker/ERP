import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({
 resolve: { alias: { '@': path.resolve('src'), 'https://esm.sh/@supabase/supabase-js@2.106.2': path.resolve('tests/remediation/f02-repair/no-db.ts') } },
 test: { environment:'node', include:['tests/remediation/f02-repair/*.test.ts'],
 setupFiles:['tests/remediation/f01/offline-setup.ts'], fileParallelism:false,
 reporters:['default','json'], outputFile:'CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F02_BLOCKER_REPAIRS/REPAIR_UNIT_RESULTS.json' }
});
