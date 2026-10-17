// Source-backed report permission contracts, not browser/render acceptance.
// Mocked I/O only; no database, Auth, HTTP, renderer or service execution.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import path from 'node:path';
import ts from 'typescript';
import {z} from 'zod';
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

// Ordinary report reads use real DTOs and authority helpers, with a finite I/O
// recorder. It is deliberately not a native row-policy emulator.
const readIdentity = load('src/lib/reads/hr-read-identity.ts', {'@/lib/rbac/scope': scope});
const criteriaDto = load('src/lib/reads/report-criteria-schema.ts', {
  zod: {z}, '@/lib/rbac/scope': scope, './hr-read-identity': readIdentity,
});
const savedDto = load('src/lib/reads/report-saved-filters-schema.ts', {zod: {z}, './hr-read-identity': readIdentity});
const search = load('src/lib/reads/search.ts');
const criterionSources = {
  employee_id: {table: 'employees', row: {id: 7, full_name_en: 'Permitted employee', employee_code: 'SYN-7', deleted_at: null}},
  owner_company_id: {table: 'owner_companies', row: {id: 7, legal_name_en: 'Permitted company', company_code: 'SYN-C', status: 'inactive'}},
  branch_id: {table: 'branches', row: {id: 7, branch_name_en: 'Permitted branch', owner_company_id: 1, status: 'inactive'}},
  department_id: {table: 'departments', row: {id: 7, department_name_en: 'Permitted department', owner_company_id: 1, deleted_at: null, is_active: false}},
  designation_id: {table: 'designations', row: {id: 7, designation_name_en: 'Permitted designation', owner_company_id: 1, department_id: 2, deleted_at: null, is_active: false}},
  work_site_id: {table: 'work_sites', row: {id: 7, site_name: 'Permitted site', owner_company_id: 1, deleted_at: null, status: 'closed'}},
};
async function reportRead(context, mode = 'criteria', options = {}) {
  const calls = [], key = options.key ?? 'employee_id'; let ordinaryClients = 0;
  const required = options.required ?? ['hr.employees.view'];
  const savedRow = {id: 7, report_id: 3, user_profile_id: context.profile?.id ?? 101,
    filter_name: 'Permitted saved filter', is_default: false, is_shared: false,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', filters_json: {employee_id: 7}};
  const ordinary = {from(table) {
    const call = {table, methods: []}; calls.push(call);
    const expected = mode === 'criteria' ? criterionSources[key].table : 'erp_report_saved_filters';
    assert.ok(table === 'erp_report_registry' || table === expected, 'Unexpected read surface');
    const query = {};
    for (const method of ['select', 'eq', 'is', 'or', 'order', 'range', 'ilike', 'abortSignal'])
      query[method] = (...args) => {call.methods.push([method, ...args]); return query;};
    query.maybeSingle = async () => ({data: options.hiddenRegistry ? null : {
      id: 3, report_code: 'HR_SOURCE_ONLY', required_permissions: required,
      filter_schema_json: {filters: Object.keys(criterionSources)},
    }, error: null});
    query.then = (resolve, reject) => {
      const row = mode === 'criteria' ? criterionSources[key].row : {...savedRow, ...(options.foreignSaved ? {user_profile_id: 999} : {})};
      const selectedId = call.methods.find(([m, column]) => m === 'eq' && column === 'id')?.[2];
      const rows = options.emptyRows || selectedId !== undefined && selectedId !== row.id ? [] : [row];
      return Promise.resolve({data: rows, count: rows.length, error: null}).then(resolve, reject);
    };
    return query;
  }};
  const mod = load(mode === 'criteria' ? 'src/server/reads/report-criteria.ts' : 'src/server/reads/report-saved-filters.ts', {
    'server-only': {}, zod: {z}, '@/lib/rbac/check': {...scope, getAuthContext: async () => context},
    '@/lib/supabase/server': {createClient: async () => {ordinaryClients++; return ordinary;}},
    '@/lib/reads/search': search, '@/lib/reads/report-criteria-schema': criteriaDto,
    '@/lib/reads/report-saved-filters-schema': savedDto,
  });
  const input = mode === 'criteria' ? {reportCode: 'HR_SOURCE_ONLY', key, ...(options.criteria ?? {})}
    : mode === 'saved-detail' ? {reportCode: 'HR_SOURCE_ONLY', mode: 'detail', id: 7}
    : {reportCode: 'HR_SOURCE_ONLY', mode: 'list'};
  const result = await (mode === 'criteria' ? mod.readReportCriteria : mod.readReportSavedFilters)(input, context);
  return {result, calls, ordinaryClients};
}
for (const role of ['group_admin', 'system_admin']) {
  for (const key of Object.keys(criterionSources)) test('global ' + role + ' reads ' + key + ' through ordinary bounded report criteria', async () => {
    const out = await reportRead(ctx({role, company: null}), 'criteria', {key});
    assert.equal(out.result.success, true); assert.equal(out.ordinaryClients, 1);
    assert.equal(out.result.data.rows.length, 1); assert.equal(out.result.data.rows[0].value, 7);
    assert.equal(out.result.data.totalCount, 1); assert.equal(out.calls[1].table, criterionSources[key].table);
    assert.ok(out.calls[1].methods.some(([m, start, end]) => m === 'range' && start === 0 && end === 24));
    assert.ok(!out.calls[1].methods.some(([m, col]) => m === 'eq' && ['status', 'is_active'].includes(col)));
  });
  for (const mode of ['saved-list', 'saved-detail']) test('global ' + role + ' reads ' + mode + ' without broadening saved ownership', async () => {
    const out = await reportRead(ctx({role, company: null}), mode);
    assert.equal(out.result.success, true); assert.equal(out.ordinaryClients, 1);
    assert.equal(mode === 'saved-list' ? out.result.data.rows[0].id : out.result.data.record.id, 7);
    assert.ok(out.calls[1].methods.some(([m, filter]) => m === 'or' && filter === 'user_profile_id.eq.101,is_shared.eq.true'));
    assert.ok(out.calls[1].methods.some(([m, column, value]) => m === 'eq' && column === 'report_id' && value === 3));
  });
}
for (const mode of ['criteria', 'saved-list', 'saved-detail']) {
  test(mode + ' retains any-required admission and ordinary explicit grants', async () => {
    const out = await reportRead(ctx({codes: ['reports.run', 'hr.employees.view']}), mode, {required: ['hr.employees.view', 'reports.synthetic.other']});
    assert.equal(out.result.success, true); assert.equal(out.ordinaryClients, 1); assert.equal(out.calls.length, 2);
  });
  test(mode + ' retains empty requirements but never substitutes them for reports.run', async () => {
    const allowed = await reportRead(ctx({codes: ['reports.run', 'hr.employees.view']}), mode, {required: []});
    assert.equal(allowed.result.success, true);
    const denied = await reportRead(ctx({codes: ['hr.employees.view']}), mode, {required: []});
    assert.equal(denied.result.success, false); assert.equal(denied.ordinaryClients, 0); assert.equal(denied.calls.length, 0);
  });
  test(mode + ' rejects missing requirements before fetching labels or saved rows', async () => {
    const out = await reportRead(ctx({codes: ['reports.run']}), mode);
    assert.equal(out.result.success, false); assert.equal(out.result.error, 'Permission denied'); assert.equal(out.calls.length, 1);
  });
  test(mode + ' does not turn scoped/revoked admin codes or inactive principals into authority', async () => {
    for (const options of [{role: 'group_admin'}, {role: 'system_admin'}, {role: 'group_admin', company: null, branch: 2},
      {role: 'group_admin', company: null, assigned: false}, {role: null}, {role: 'group_admin', company: null, active: false},
      {role: 'group_admin', company: null, password: true}]) {
      const out = await reportRead(ctx(options), mode);
      assert.equal(out.result.success, false); assert.equal(out.ordinaryClients, 0); assert.equal(out.calls.length, 0);
    }
  });
}
test('report criteria preserve scoped label restrictions independently of report admission', async () => {
  for (const key of ['employee_id', 'department_id']) {
    const out = await reportRead(ctx({role: 'group_admin', codes: ['reports.run', 'common_md.view']}), 'criteria', {key, required: ['reports.run']});
    assert.equal(out.result.success, true); assert.equal(out.result.data.availability, 'restricted');
    assert.equal(out.result.data.rows, undefined); assert.equal(out.calls.length, 1);
  }
});
test('report criteria preserve dependency predicates, inaccessible selection and empty ordinary results', async () => {
  const out = await reportRead(ctx({codes: ['reports.run', 'hr.employees.view'], branch: 2}), 'criteria', {
    criteria: {ownerCompanyId: 1, branchId: 2, departmentId: 3, selectedId: 999}, emptyRows: true,
  });
  assert.equal(out.result.success, true); assert.equal(out.result.data.rows.length, 0);
  assert.equal(out.result.data.totalCount, 0); assert.equal(out.result.data.selected, null);
  for (const query of out.calls.slice(1)) for (const [column, value] of [['owner_company_id', 1], ['branch_id', 2], ['department_id', 3]])
    assert.ok(query.methods.some(([m, field, actual]) => m === 'eq' && field === column && actual === value));
});
for (const mode of ['saved-list', 'saved-detail']) test(mode + ' rejects foreign nonshared rows even for a global admin', async () => {
  const out = await reportRead(ctx({role: 'group_admin', company: null}), mode, {foreignSaved: true});
  assert.equal(out.result.success, false); assert.equal(out.result.kind, 'unavailable'); assert.equal(out.result.data, undefined);
});
