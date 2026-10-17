// Source-backed permission-contract tests, not browser/render acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const read = relative => fs.readFileSync(path.join(process.cwd(), relative), 'utf8');
const tableText = read('src/features/hr/employees/employees-table.tsx');
const formText = read('src/features/hr/employees/employee-workspace-form.tsx');
const scopeText = read('src/lib/rbac/scope.ts');
const parse = (name, source) => ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const table = parse('employees-table.tsx', tableText);
const form = parse('employee-workspace-form.tsx', formText);
function compile(source, globals = {}) {
  const result = ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS}});
  const compiledModule = {exports: {}};
  vm.runInNewContext(result.outputText, {module: compiledModule, exports: compiledModule.exports, ...globals});
  return compiledModule.exports;
}
const scope = compile(scopeText); // Actual pure helper; type-only AuthContext import is erased.
const tableFunction = table.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'EmployeesTable');
assert.ok(tableFunction?.body, 'actual EmployeesTable function must exist');
const names = ['canCreate', 'canUpdate', 'canArchive'];
const declarations = tableFunction.body.statements.filter(ts.isVariableStatement)
  .flatMap(node => [...node.declarationList.declarations])
  .filter(node => ts.isIdentifier(node.name) && names.includes(node.name.text));
assert.equal(declarations.length, 3, 'execute exactly the three actual table affordance initializers');
const flags = compile(`export function flags(authContext: unknown) {
  ${declarations.map(node => `const ${node.getText(table)};`).join('\n')}
  return {canCreate, canUpdate, canArchive};
}`, {hasPermission: scope.hasPermission}).flags;
const helper = form.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'checkPermission');
assert.ok(helper?.body, 'actual record helper must exist');
const check = compile(`export ${helper.getText(form)}`, {hasPermission: scope.hasPermission}).checkPermission;

const codes = ['hr.employees.create', 'hr.employees.update', 'hr.employees.archive', 'hr.medical.manage'];
function context({roleCode = 'employee_manager', company = 1, branch = null, permissions = [], active = true, password = false, profile = true, assignment = true} = {}) {
  return {
    profile: profile ? {id: 1, must_change_password: password} : null,
    isAccountActive: active, accountStatus: active ? 'active' : 'inactive',
    roleCodes: roleCode ? [roleCode] : [], permissionCodes: permissions,
    roleAssignments: roleCode && assignment ? [{roleId: 1, roleCode, ownerCompanyId: company, branchId: branch, permissionCodes: permissions}] : [],
    globalPermissionCodes: [],
  };
}
const matrix = [
  ['global group administrator with no explicit links', {roleCode: 'group_admin', company: null}, [true, true, true, true]],
  ['global system administrator with no explicit links', {roleCode: 'system_admin', company: null}, [true, true, true, true]],
  ['company group-admin code alone', {roleCode: 'group_admin'}, [false, false, false, false]],
  ['company system-admin code alone', {roleCode: 'system_admin'}, [false, false, false, false]],
  ['branch group-admin code alone', {roleCode: 'group_admin', branch: 2}, [false, false, false, false]],
  ['branch system-admin code alone', {roleCode: 'system_admin', branch: 2}, [false, false, false, false]],
  ['flat group-admin code after assignment revocation', {roleCode: 'group_admin', company: null, assignment: false}, [false, false, false, false]],
  ['flat system-admin code after assignment revocation', {roleCode: 'system_admin', company: null, assignment: false}, [false, false, false, false]],
  ['no role', {roleCode: null}, [false, false, false, false]],
  ['ordinary scoped create permission only', {permissions: [codes[0]]}, [true, false, false, false]],
  ['ordinary scoped update permission only', {permissions: [codes[1]], branch: 2}, [false, true, false, false]],
  ['ordinary scoped archive permission only', {permissions: [codes[2]]}, [false, false, true, false]],
  ['ordinary scoped medical permission only', {permissions: [codes[3]]}, [false, false, false, true]],
  ['scoped administrator with explicit update permission', {roleCode: 'group_admin', permissions: [codes[1]]}, [false, true, false, false]],
  ['inactive global administrator', {roleCode: 'group_admin', company: null, active: false, permissions: codes}, [false, false, false, false]],
  ['inactive scoped explicit permissions', {active: false, permissions: codes}, [false, false, false, false]],
  ['global administrator required to change password', {roleCode: 'system_admin', company: null, password: true, permissions: codes}, [false, false, false, false]],
  ['scoped permission holder required to change password', {password: true, permissions: codes}, [false, false, false, false]],
  ['missing profile despite stale active flag', {roleCode: 'group_admin', company: null, profile: false, permissions: codes}, [false, false, false, false]],
];
for (const [name, options, expected] of matrix) test(name, () => {
  const ctx = context(options);
  assert.deepEqual({...flags(ctx)}, Object.fromEntries(names.map((key, i) => [key, expected[i]])));
  assert.deepEqual(codes.map(code => check(ctx, code)), expected);
});

test('both client surfaces use the shared pure permission helper', () => {
  for (const source of [table, form]) assert.ok(source.statements.some(node => ts.isImportDeclaration(node)
    && node.moduleSpecifier.text === '@/lib/rbac/scope'
    && node.importClause?.namedBindings?.elements?.some(item => item.name.text === 'hasPermission')));
  for (const declaration of declarations) {
    assert.ok(ts.isCallExpression(declaration.initializer));
    assert.equal(declaration.initializer.expression.getText(table), 'hasPermission');
  }
  assert.equal(helper.body.statements.length, 1);
  assert.equal(helper.body.statements[0].getText(form), 'return hasPermission(ctx, code);');
});
test('medical and document controls retain their distinct original permission codes', () => {
  const actual = [];
  function visit(node) {
    if (ts.isJsxAttribute(node) && ['canManageMedical', 'canUpload', 'canLinkExisting', 'canUnlink'].includes(node.name.text)) {
      const expression = node.initializer?.expression;
      assert.ok(expression && ts.isCallExpression(expression));
      assert.equal(expression.expression.getText(form), 'checkPermission');
      assert.equal(expression.arguments[0].getText(form), 'authContext');
      actual.push([node.name.text, expression.arguments[1].text]);
    }
    ts.forEachChild(node, visit);
  }
  visit(form);
  assert.deepEqual(actual, [['canManageMedical', 'hr.medical.manage'], ['canUpload', 'hr.employees.update'],
    ['canLinkExisting', 'hr.employees.update'], ['canUnlink', 'hr.employees.update']]);
});
