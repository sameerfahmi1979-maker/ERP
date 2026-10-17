'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const actorNames = ['global', 'scoped', 'branchOnly', 'combined', 'noRole'];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const columns = ['id', 'template_code', 'template_name', 'template_type', 'is_default', 'governance_status', 'visual_editor_engine',
  'branding_profile_id', 'branding_profile_name', 'branding_profile_type', 'company_name', 'logo_url', 'owner_company_id', 'selectable'];
function validateFixture(fixture) {
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
    assert.match(actor.authUserId, uuid, `Missing ${name} pinned auth user`);
    assert.match(actor.sessionId, uuid, `Missing ${name} pinned bearer session`);
    assert.ok(Number.isSafeInteger(actor.profileId) && actor.profileId > 0, `Missing ${name} pinned profile`);
    assert.ok(Array.isArray(actor.expectedAssignments), `Missing ${name} expected live assignment tuples`);
    for (const kind of ['reportCenterIds', 'employeeLetterIds']) {
      assert.ok(Array.isArray(actor[kind]) && actor[kind].every(id => Number.isSafeInteger(id) && id > 0));
      assert.equal(new Set(actor[kind]).size, actor[kind].length);
    }
  }
  for (const field of ['authUserId','sessionId','profileId','bearer','cookie']) {
    assert.equal(new Set(actorNames.map(name => fixture.actors[name][field])).size, actorNames.length, `Actors must have independent ${field}`);
  }
  for (const name of ['branchOnly','noRole']) for (const kind of ['reportCenterIds','employeeLetterIds']) {
    assert.deepEqual(fixture.actors[name][kind], [], `${name} must never expect company-wide template rows`);
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
function loadFixture(filename) {
  assert.ok(filename, 'ALGT_TEMPLATE_NATIVE_FIXTURE must identify a coordinator-owned private fixture; no automatic provisioning');
  const full = path.resolve(filename);
  assert.ok(!full.startsWith(path.resolve(__dirname, '../../../..') + path.sep), 'Keep bearer tokens and cookies outside the publication checkout');
  return validateFixture(JSON.parse(fs.readFileSync(full, 'utf8').replace(/^\uFEFF/, '')));
}
const canonicalAssignments = rows => rows.map(row => ({roleId: Number(row.roleId), roleCode: row.roleCode,
  ownerCompanyId: row.ownerCompanyId === null ? null : Number(row.ownerCompanyId), branchId: row.branchId === null ? null : Number(row.branchId),
  permissionCodes: [...row.permissionCodes].sort()})).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b), 'en'));
function assertActorAuthority(fixture, live) {
  assert.equal(live.length, actorNames.length, 'SQL authority inspection must return exactly five pinned synthetic principals');
  for (const name of actorNames) {
    const actor = fixture.actors[name], row = live.find(value => value.authUserId === actor.authUserId);
    assert.ok(row, `${name} actual principal absent`);
    assert.equal(Number(row.profileId), actor.profileId);
    assert.equal(row.status, 'active'); assert.equal(row.mustChangePassword, false);
    assert.equal(row.sessionId, actor.sessionId); assert.equal(row.sessionValid, true);
    const assignments = canonicalAssignments(row.assignments);
    assert.deepEqual(assignments, canonicalAssignments(actor.expectedAssignments), `${name} actual roles/scopes differ from pinned synthetic fixture`);
    assert.ok(assignments.every(item => !['system_admin','group_admin'].includes(item.roleCode)), 'No global-admin role is needed for this selector test');
    const permitsReports = item => item.permissionCodes.some(code => ['reports.view','reports.manage'].includes(code));
    const reportAssignments = assignments.filter(permitsReports);
    if (name === 'noRole') assert.deepEqual(assignments, [], 'No-role principal must actually have no active role');
    else if (name === 'global') assert.ok(reportAssignments.some(item => item.ownerCompanyId === null && item.branchId === null));
    else if (name === 'branchOnly') {
      assert.ok(reportAssignments.length > 0);
      assert.ok(reportAssignments.every(item => item.ownerCompanyId !== null && item.branchId !== null));
    } else {
      assert.ok(reportAssignments.some(item => item.ownerCompanyId === fixture.companyId && item.branchId === null));
      assert.ok(reportAssignments.every(item => item.ownerCompanyId === fixture.companyId || item.branchId !== null), 'No unrelated global/company report grant may mask tuple isolation');
      if (name === 'combined') {
        assert.ok(new Set(assignments.map(item => item.roleId)).size >= 2, 'Combined case needs independently assigned roles');
        assert.ok(assignments.some(item => !permitsReports(item) && item.ownerCompanyId === null && item.branchId === null), 'Combined case requires unrelated global authority that must not widen scoped reporting');
        assert.deepEqual(actor.reportCenterIds, fixture.actors.scoped.reportCenterIds);
        assert.deepEqual(actor.employeeLetterIds, fixture.actors.scoped.employeeLetterIds);
      }
    }
  }
}
function authorityInspectionSql(fixture) {
  validateFixture(fixture);
  const actors = actorNames.map(name => fixture.actors[name]);
  const entries = actors.map(actor => `('${actor.authUserId}'::uuid,${actor.profileId},'${actor.sessionId}'::uuid)`).join(',');
  return `BEGIN READ ONLY; SET LOCAL statement_timeout='30s';
WITH wanted(auth_id,profile_id,session_id) AS (VALUES ${entries})
SELECT coalesce(jsonb_agg(jsonb_build_object('authUserId',u.id,'profileId',p.id,'status',p.status,
  'mustChangePassword',p.must_change_password,'sessionId',s.id,
  'sessionValid',(s.id IS NOT NULL AND (s.not_after IS NULL OR s.not_after>now()) AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<now())),
  'assignments',coalesce((SELECT jsonb_agg(jsonb_build_object('roleId',r.id,'roleCode',r.role_code,
    'ownerCompanyId',ur.owner_company_id,'branchId',ur.branch_id,
    'permissionCodes',coalesce((SELECT jsonb_agg(pm.permission_code ORDER BY pm.permission_code)
      FROM public.role_permissions rp JOIN public.permissions pm ON pm.id=rp.permission_id AND pm.is_active
      WHERE rp.role_id=r.id),'[]'::jsonb))) FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id AND r.is_active
    WHERE ur.user_profile_id=p.id AND ur.is_active),'[]'::jsonb))),'[]'::jsonb) AS authority
FROM wanted w JOIN auth.users u ON u.id=w.auth_id JOIN public.user_profiles p ON p.id=w.profile_id AND p.auth_user_id=u.id
LEFT JOIN auth.sessions s ON s.id=w.session_id AND s.user_id=u.id;
ROLLBACK;`;
}
async function verifyActorSessions(fixture, readAuthority) {
  assert.equal(typeof readAuthority, 'function', 'Coordinator guarded read-only SQL adapter required; never trust fixture-supplied role claims');
  for (const name of actorNames) {
    const actor = fixture.actors[name];
    let claims;
    try { claims = JSON.parse(Buffer.from(actor.bearer.split('.')[1], 'base64url').toString('utf8')); } catch { throw Error(`${name} bearer format invalid`); }
    assert.equal(claims.role, 'authenticated', `${name} must use ordinary authenticated caller-RLS authority, never a privileged or missing role`);
    assert.equal(claims.sub, actor.authUserId, `${name} bearer subject does not match pinned user`);
    assert.equal(claims.session_id, actor.sessionId, `${name} bearer session does not match pinned session`);
    const native = await fetch(`${fixture.apiOrigin}/auth/v1/user`, {headers: {apikey: fixture.anonKey, Authorization: `Bearer ${actor.bearer}`}, redirect:'error',signal:AbortSignal.timeout(30000)});
    assert.equal(native.status,200,`${name} bearer was not independently authenticated`);
    const user = await native.json(); assert.equal(user.id,actor.authUserId);
    const app = await fetch(`${fixture.appOrigin}/api/auth/session`,{headers:{Cookie:actor.cookie},redirect:'error',signal:AbortSignal.timeout(30000)});
    assert.equal(app.status,200,`${name} app cookie could not be independently authenticated`);
    const session = await app.json(); assert.equal(session.authUserId,actor.authUserId); assert.equal(session.active,true);assert.equal(session.requiredChange,false);
  }
  assertActorAuthority(fixture, await readAuthority(authorityInspectionSql(fixture)));
}
async function nativeRead(fixture, actor, params, table = 'perf_report_template_selection') {
  assert.ok(['perf_report_template_selection', 'erp_report_branding_profiles'].includes(table));
  const query = new URLSearchParams(params), url = `${fixture.apiOrigin}/rest/v1/${table}?${query}`;
  const response = await fetch(url, {headers: {apikey: fixture.anonKey, ...(actor ? {Authorization: `Bearer ${actor.bearer}`} : {}),
    Prefer: 'count=exact', Accept: 'application/json'}, redirect: 'error', signal: AbortSignal.timeout(30000)});
  const body = await response.json();
  const contentRange = response.headers.get('content-range');
  return {status: response.status, body, count: Number(contentRange?.split('/')[1]), contentRange};
}
function assertNativeFirstPage(response, expectedIds) {
  assert.ok(Array.isArray(response.body));
  assert.equal(response.count, expectedIds.length);
  assert.deepEqual(response.body.map(row => row.id), expectedIds.slice(0, 25));
  assert.equal(typeof response.contentRange, 'string', 'Exact Content-Range is required');
  if (response.body.length === 0) {
    assert.equal(response.contentRange, '*/0');
    assert.equal(response.count, 0);
    assert.equal(response.status, 200);
    return;
  }
  const range = /^0-(0|[1-9]\d*)\/(0|[1-9]\d*)$/.exec(response.contentRange);
  assert.ok(range, 'Expected exact first-page numeric Content-Range');
  const end = Number(range[1]), total = Number(range[2]);
  assert.ok(Number.isSafeInteger(end) && Number.isSafeInteger(total));
  assert.equal(end, response.body.length - 1);
  assert.equal(total, expectedIds.length);
  assert.ok(total >= response.body.length);
  assert.equal(response.status, total > response.body.length ? 206 : 200);
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
module.exports = {loadFixture, validateFixture, actorNames, nativeRead, appRead, assertNativeFirstPage, assertMetadata, columns,
  assertActorAuthority, authorityInspectionSql, verifyActorSessions};
