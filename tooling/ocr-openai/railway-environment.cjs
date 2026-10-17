// Operator-only tooling. Raw values remain in memory and must never be printed.
const { execFileSync } = require('node:child_process');
const PROJECT = '10b6e556-e9d9-409e-8544-4f6a2e69cb88';
const SERVICE = 'cbfd3be4-36aa-4110-b672-50b6fda4a844';
const ENVIRONMENT = 'e816440c-93b1-4181-ad77-383a82902f8b';
function railwayEnvironment() {
  const result = execFileSync('pwsh.exe', ['-NoProfile', '-Command',
    `railway variable list --project ${PROJECT} --service ${SERVICE} --environment ${ENVIRONMENT} --json`],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 });
  const vars = JSON.parse(result);
  if (new URL(vars.NEXT_PUBLIC_SUPABASE_URL).hostname !== 'mmiefuieduzdiiwnqpie.supabase.co' ||
      vars.NEXT_PUBLIC_SITE_URL !== 'https://erp.algt.net') throw Error('Unexpected ERP deployment');
  return vars;
}
module.exports = { railwayEnvironment, PROJECT, SERVICE, ENVIRONMENT };
