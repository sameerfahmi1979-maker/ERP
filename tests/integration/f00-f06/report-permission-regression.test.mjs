// Source-backed report permission contracts, not browser/render acceptance.
// Mocked I/O only; no database, Auth, HTTP, renderer or service execution.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import path from 'node:path';
import ts from 'typescript';
const source = relative => fs.readFileSync(path.join(process.cwd(), relative), 'utf8');
function load(path, mocks = {}) {
  const compiled = ts.transpileModule(source(path), {fileName: path, compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  }});
  const compiledModule = {exports: {}};
  vm.runInNewContext(compiled.outputText, {module: compiledModule, exports: compiledModule.exports, require(name) {
    assert.ok(Object.hasOwn(mocks, name), 'Unreviewed dependency: ' + name);
    return mocks[name];
  }}, {filename: path});
  return compiledModule.exports;
}
const scope = load('src/lib/rbac/scope.ts');
const employee = load('src/lib/rbac/employee-access.ts', {
  'server-only': {}, '@/lib/supabase/admin': {createAdminClient() {throw Error('No native I/O permitted');}},
  './check': {...scope, assertAccountActive(ctx) {assert.equal(scope.canUseApplication(ctx), true);}},
});
const all = ['reports.view', 'reports.run', 'hr.employees.view', 'reports.pdf.generate', 'reports.branding.override', 'reports.sign'];
function ctx({role = 'manager', company = 1, branch = null, codes = [], active = true, password = false, assigned = true} = {}) {
  // Mirrors getAuthContext's inactive/forced-change stripping, not stale invented rights.
  if (!active || password) codes = [];
  return {profile: {id: 101, status: active ? 'active' : 'inactive', must_change_password: password},
    email: 'source-only@example.invalid', accountStatus: active ? 'active' : 'inactive', isAccountActive: active,
    roleCodes: !active || password || !role || (company !== null && ['system_admin', 'group_admin'].includes(role)) ? [] : [role],
    permissionCodes: codes, globalPermissionCodes: company === null ? codes : [],
    roleAssignments: active && !password && role && assigned ? [{roleId: 10, roleCode: role, ownerCompanyId: company, branchId: branch, permissionCodes: codes}] : [],
  };
}
function db(result, calls) {return {from(table) {
  calls.push(['from', table]);
  assert.ok(['erp_report_registry', 'erp_output_class_policies'].includes(table));
  const q = {};
  for (const method of ['select', 'eq', 'is', 'in', 'order']) q[method] = (...args) => {calls.push([method, ...args]); return q;};
  const data = table === 'erp_report_registry' ? result : [{document_class: 'A'}];
  q.maybeSingle = async () => ({data: Array.isArray(data) ? data[0] : data, error: null});
  q.then = (resolve, reject) => Promise.resolve({data, error: null}).then(resolve, reject);
  return q;
}};}
const registry = required => ({report_code: 'HR_SOURCE_ONLY', report_name_en: 'Synthetic source probe', description_en: null,
  report_category: 'HR', document_class: 'A', required_permissions: required, sensitive_profile: 'normal'});
async function route(context, required = ['hr.employees.view']) {
  const calls = [];
  const mod = load('src/app/(protected)/admin/reports/run/[reportCode]/page.tsx', {
    '@/lib/rbac/check': {getAuthContext: async () => context, hasPermission: scope.hasPermission},
    'next/navigation': {redirect(path) {const e = Error('redirect'); e.redirect = path; throw e;}, notFound() {throw Error('not-found');}},
    '@/lib/supabase/admin': {createAdminClient: () => db(registry(required), calls)},
    '@/features/report-center/report-run-page': {ReportRunPage: 'ReportRunPage'},
    'react/jsx-runtime': {jsx: (type, props) => ({type, props}), jsxs: (type, props) => ({type, props})},
  });
  try {return {rendered: await mod.default({params: Promise.resolve({reportCode: 'hr_source_only'}), searchParams: Promise.resolve({employee_id: '101'})}), calls};}
  catch(e) {if(e.redirect) return {redirect: e.redirect, calls}; throw e;}
}
async function catalog(context, required = ['hr.employees.view', 'reports.pdf.generate']) {
  const calls = [];
  const mod = load('src/server/actions/output/output-catalog.ts', {
    '@/lib/rbac/check': {...scope, getAuthContext: async () => context},
    '@/lib/supabase/admin': {createAdminClient: () => db([registry(required)], calls)},
    '@/lib/output/class-policy': {resolveEffectivePolicy: () => ({approvalRequired: false, allowQuickPrint: false, qrPolicy: 'none', qrValidityDays: null, official: false})},
    '@/lib/output/issuance-status': {groupForClass: () => 'source-probe'},
    '@/lib/official-documents/registry': {getOfficialDocumentDefinition: () => null, isGeneratable() {throw Error('Unused');}},
  });
  return {result: await mod.listEmployeeOutputCatalog(), calls};
}
for(const role of ['group_admin', 'system_admin']) {
  test('global ' + role + ' with empty flat permissions passes both report gates', async () => {
    const context = ctx({role, company: null});
    assert.equal(scope.hasPermission(context, 'reports.view'), true);
    assert.equal(scope.hasPermission(context, 'hr.employees.view'), true);
    const out = await route(context);
    assert.ok(out.rendered); assert.equal(out.redirect, undefined);
    assert.equal(out.calls.filter(c => c[0] === 'from').length, 1);
  });
  test('global ' + role + ' receives catalog capabilities recognized by shared authority', async () => {
    const context = ctx({role, company: null});
    const {result} = await catalog(context);
    assert.equal(result.success, true);
    const item = result.data[0];
    assert.equal(item.canGenerate, true);
    assert.equal(item.missingPermissions.length, 0);
    assert.equal(item.canBrandingOverride, true); assert.equal(item.userCanSign, true);
    for(const code of all) assert.equal(scope.hasPermission(context, code), true);
  });
}
test('ordinary explicit permissions still render and catalog all required grants', async () => {
  const context = ctx({codes: all});
  const out = await route(context); assert.ok(out.rendered); assert.equal(out.redirect, undefined);
  assert.equal(out.rendered.props.children.props.initialFilters.employee_id, '101');
  const item = (await catalog(context)).result.data[0];
  assert.equal(item.canGenerate, true); assert.equal(item.missingPermissions.length, 0);
  assert.equal(item.canBrandingOverride, true); assert.equal(item.userCanSign, true);
});
test('route preserves existing any-required semantics; catalog requires all', async () => {
  const context = ctx({codes: ['reports.view', 'hr.employees.view']});
  assert.ok((await route(context, ['hr.employees.view', 'reports.pdf.generate'])).rendered);
  assert.equal((await catalog(context)).result.data[0].canGenerate, false);
});
for(const options of [{role: 'group_admin'}, {role: 'system_admin'}, {role: 'group_admin', branch: 2}, {role: null}, {role: 'group_admin', company: null, assigned: false}]) {
  test('no privilege bypass from scoped/revoked/absent role ' + JSON.stringify(options), async () => {
    const context = ctx(options);
    assert.equal(scope.hasPermission(context, 'reports.view'), false);
    const out = await route(context); assert.equal(out.redirect, '/admin/reports'); assert.equal(out.calls.length, 0);
    assert.equal((await catalog(context)).result.data[0].canGenerate, false);
  });
}
test('scoped admin code with ordinary explicit permission is only ordinary capability', async () => {
  const context = ctx({role: 'group_admin', codes: all});
  assert.equal(scope.isGlobalAdmin(context), false); assert.ok((await route(context)).rendered);
  assert.equal((await catalog(context)).result.data[0].canGenerate, true);
  assert.equal(scope.hasPermissionInScope(context, 'reports.run', 1), true);
  assert.equal(scope.hasPermissionInScope(context, 'reports.run', 2), false);
});
for(const options of [{active: false}, {password: true}]) {
  test('real inactive/forced-change shape denies route and required catalog ' + JSON.stringify(options), async () => {
    const context = ctx({...options, role: 'group_admin', company: null, codes: all});
    const out = await route(context); assert.equal(out.redirect, '/admin/reports'); assert.equal(out.calls.length, 0);
    const outCatalog = await catalog(context);
    assert.equal(outCatalog.result.success, false); assert.equal(outCatalog.calls.length, 0);
    assert.equal(scope.canUseApplication(context), false);
  });
  test('inactive/forced-change empty-required catalog is rejected before admin read ' + JSON.stringify(options), async () => {
    const context = ctx({...options, role: 'group_admin', company: null});
    const out = await catalog(context, []);
    assert.equal(out.result.success, false); assert.equal(out.result.data, undefined);
    assert.equal(out.calls.length, 0);
    assert.equal(scope.canUseApplication(context), false);
  });
}
test('actual employee authority preserves company/branch and self record boundaries', () => {
  const subject = {id: 101, owner_company_id: 1, branch_id: 2, reporting_manager_id: null};
  const context = ctx({branch: 2, codes: ['reports.run', 'hr.employees.view']});
  assert.equal(employee.hasEmployeePermission(context, subject, null, 'reports.run'), true);
  assert.equal(employee.hasEmployeePermission(context, {...subject, owner_company_id: 2}, null, 'reports.run'), false);
  assert.equal(employee.hasEmployeePermission(context, {...subject, branch_id: 3}, null, 'reports.run'), false);
  const self = ctx({branch: 2, codes: ['reports.run.self']});
  assert.equal(employee.hasEmployeePermission(self, subject, 101, 'reports.run'), true);
  assert.equal(employee.hasEmployeePermission(self, {...subject, id: 102}, 101, 'reports.run'), false);
});
test('actual employee authority denies inactive/password and scoped admin role alone', () => {
  const subject = {id: 101, owner_company_id: 1, branch_id: 2, reporting_manager_id: null};
  for(const options of [{active: false, company: null}, {password: true, company: null}, {company: 1}, {company: 1, branch: 2}])
    assert.equal(employee.hasEmployeePermission(ctx({role: 'group_admin', ...options}), subject, 101, 'reports.run'), false);
});
