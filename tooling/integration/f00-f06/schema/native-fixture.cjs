'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const actorNames = ['global', 'scoped', 'branchOnly', 'combined', 'noRole'];
const columns = ['id', 'template_code', 'template_name', 'template_type', 'is_default', 'governance_status', 'visual_editor_engine',
  'branding_profile_id', 'branding_profile_name', 'branding_profile_type', 'company_name', 'logo_url', 'owner_company_id', 'selectable'];
function loadFixture(filename) {
  assert.ok(filename, 'ALGT_TEMPLATE_NATIVE_FIXTURE must identify a coordinator-owned private fixture; no automatic provisioning');
  const full = path.resolve(filename);
  assert.ok(!full.startsWith(path.resolve(__dirname, '../../../..') + path.sep), 'Keep bearer tokens and cookies outside the publication checkout');
  const fixture = JSON.parse(fs.readFileSync(full, 'utf8').replace(/^\uFEFF/, ''));
  assert.equal(fixture.version, 1);
  assert.equal(fixture.labProjectId, 'algt-integration-20261016');
  assert.equal(fixture.apiOrigin, 'http://127.0.0.1:16921');
  assert.equal(fixture.appOrigin, 'http://127.0.0.1:16941');
  assert.match(fixture.prefix, /^F00F06_TEMPLATE_[A-Z0-9_]+$/);
  assert.equal(fixture.workersDisabled, true);
  assert.equal(fixture.providersDisabled, true);
  assert.ok(typeof fixture.anonKey === 'string' && fixture.anonKey.length > 20);
  for (const name of actorNames) {
    const actor = fixture.actors[name];
    assert.ok(actor && typeof actor.bearer === 'string' && actor.bearer.length > 20, `Missing ${name} native session`);
    assert.ok(typeof actor.cookie === 'string' && actor.cookie.length > 20, `Missing ${name} actual-app session`);
    for (const kind of ['reportCenterIds', 'employeeLetterIds']) {
      assert.ok(Array.isArray(actor[kind]) && actor[kind].every(id => Number.isSafeInteger(id) && id > 0));
      assert.equal(new Set(actor[kind]).size, actor[kind].length);
    }
  }
  assert.ok(fixture.actors.scoped.reportCenterIds.length > 1000, 'Scoped positive tail fixture must exceed1000 visible selections');
  assert.ok(fixture.actors.scoped.employeeLetterIds.length > 1000, 'Employee Letters positive tail fixture must exceed1000 eligible selections');
  for (const field of ['tailId', 'inactiveId', 'draftId', 'deletedId', 'foreignId', 'unbrandedId', 'globalBrandingId', 'inactiveBrandingId', 'deletedBrandingId']) {
    assert.ok(Number.isSafeInteger(fixture.ids[field]) && fixture.ids[field] > 0, `Missing tracked ${field}`);
  }
  assert.ok(Number.isSafeInteger(fixture.companyId) && fixture.companyId > 0);
  assert.ok(Number.isSafeInteger(fixture.foreignCompanyId) && fixture.foreignCompanyId > 0 && fixture.foreignCompanyId !== fixture.companyId);
  return fixture;
}
async function nativeRead(fixture, actor, params, table = 'perf_report_template_selection') {
  assert.ok(['perf_report_template_selection', 'erp_report_branding_profiles'].includes(table));
  const query = new URLSearchParams(params), url = `${fixture.apiOrigin}/rest/v1/${table}?${query}`;
  const response = await fetch(url, {headers: {apikey: fixture.anonKey, ...(actor ? {Authorization: `Bearer ${actor.bearer}`} : {}),
    Prefer: 'count=exact', Accept: 'application/json'}, redirect: 'error', signal: AbortSignal.timeout(30000)});
  const body = await response.json();
  return {status: response.status, body, count: Number(response.headers.get('content-range')?.split('/')[1])};
}
async function appRead(fixture, actor, criteria) {
  const response = await fetch(`${fixture.appOrigin}/api/reads/report-template-selection`, {method: 'POST', redirect: 'error',
    headers: {'Content-Type': 'application/json', Accept: 'application/json', Origin: fixture.appOrigin, Cookie: actor.cookie},
    body: JSON.stringify(criteria), signal: AbortSignal.timeout(30000)});
  const body = await response.json();
  return {status: response.status, body};
}
function assertMetadata(rows) {
  assert.ok(Array.isArray(rows));
  for (const row of rows) assert.deepEqual(Object.keys(row).sort(), [...columns].sort(), 'Only reviewed metadata columns may escape');
}
module.exports = {loadFixture, actorNames, nativeRead, appRead, assertMetadata, columns};
