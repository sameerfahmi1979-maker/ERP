const { spawnSync } = require('node:child_process');
const { railwayEnvironment } = require('./railway-environment.cjs');
const vars = railwayEnvironment();
// Build receives public config only; all private credentials stay runtime-only.
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: '1' };
for (const name of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SITE_URL']) env[name] = vars[name];
const result = spawnSync(process.execPath, ['--use-system-ca', '--max-old-space-size=4096', 'node_modules/next/dist/bin/next', 'build', '--webpack'], { env, stdio: 'inherit' });
process.exitCode = result.status ?? 1;
