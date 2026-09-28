'use strict';
// The old HTTP smoke accepted login redirects. Use the actual authenticated DOM
// journey instead. Never dispatch a worker job from a route availability check.
const cp = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const required = ['APP_BASE_URL', 'E2E_USER_EMAIL', 'E2E_USER_PASSWORD', 'E2E_DOCUMENT_ID', 'E2E_DOCUMENT_TITLE', 'E2E_REVIEW_STATE', 'E2E_OBSERVABILITY_STATE'];
if (required.some(name => !process.env[name])) {
  console.error('BLOCKED: configure all synthetic fixture settings described in tests/e2e/support/README.md.');
  process.exitCode = 2;
} else {
  const result = cp.spawnSync(process.execPath, [require.resolve('@playwright/test/cli'), 'test', 'tests/e2e/dms-ai-phase15.spec.ts'], { cwd: root, stdio: 'inherit', windowsHide: true });
  process.exitCode = result.status ?? 1;
}
