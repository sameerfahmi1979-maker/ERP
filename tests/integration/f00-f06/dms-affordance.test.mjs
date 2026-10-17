'use strict';
// Source-backed display/callback contract; not rendered or native mutation acceptance.
// Proposed destination: tests/integration/f00-f06/dms-affordance.test.cjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
const read = file => fs.readFileSync(path.join(process.cwd(), file), 'utf8');
const parse = (file, text) => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const table = parse('table.tsx', read('src/features/dms/documents/dms-documents-table.tsx'));
const page = parse('page.tsx', read('src/app/(protected)/dms/documents/page.tsx'));
const server = parse('documents.ts', read('src/server/actions/dms/documents.ts'));
function compile(text, globals = {}) {
  const compiledModule = {exports: {}};
  const output = ts.transpileModule(text, {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(output, {module: compiledModule, exports: compiledModule.exports, ...globals});
  return compiledModule.exports;
}
const {hasPermission} = compile(read('src/lib/rbac/scope.ts'));
const tableFunction = table.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'DmsDocumentsTable');
assert.ok(tableFunction?.body);
function find(root, predicate) {
  const result = [];
  function visit(node) {if (predicate(node)) result.push(node); ts.forEachChild(node, visit);}
  visit(root); return result;
}
const tableElement = find(page, node => ts.isJsxSelfClosingElement(node) && node.tagName.getText(page) === 'DmsDocumentsTable')[0];
assert.ok(tableElement);
const names = ['canCreate', 'canEdit', 'canArchive'];
const codes = ['dms.documents.upload', 'dms.documents.edit', 'dms.documents.archive'];
function capabilityValues(authContext) {
  return names.map(name => {
    const prop = tableElement.attributes.properties.find(node => ts.isJsxAttribute(node) && node.name.text === name);
    assert.ok(prop?.initializer?.expression, `server must supply ${name}`);
    return compile(`export const value = ${prop.initializer.expression.getText(page)};`, {authContext, hasPermission}).value;
  });
}
function context({roleCode = 'dms_reader', company = 1, branch = null, permissions = [], active = true, password = false, profile = true, assignment = true} = {}) {
  return {profile: profile ? {id: 1, must_change_password: password} : null,
    isAccountActive: active, roleCodes: roleCode ? [roleCode] : [], permissionCodes: permissions,
    roleAssignments: roleCode && assignment ? [{roleId: 1, roleCode, ownerCompanyId: company, branchId: branch, permissionCodes: permissions}] : []};
}
const matrix = [
  ['self-view employee', {permissions: ['dms.documents.view']}, [false, false, false]],
  ['no role', {roleCode: null}, [false, false, false]],
  ['global group administrator', {roleCode: 'group_admin', company: null}, [true, true, true]],
  ['global system administrator', {roleCode: 'system_admin', company: null}, [true, true, true]],
  ['scoped group administrator code only', {roleCode: 'group_admin'}, [false, false, false]],
  ['branch system administrator code only', {roleCode: 'system_admin', branch: 2}, [false, false, false]],
  ['revoked global assignment with stale role code', {roleCode: 'group_admin', company: null, assignment: false}, [false, false, false]],
  ['scoped upload only', {permissions: [codes[0]]}, [true, false, false]],
  ['scoped edit only', {permissions: [codes[1]], branch: 2}, [false, true, false]],
  ['scoped archive only', {permissions: [codes[2]]}, [false, false, true]],
  ['explicit DMS administration', {permissions: ['dms.admin']}, [true, true, true]],
  ['inactive global administrator', {roleCode: 'group_admin', company: null, active: false}, [false, false, false]],
  ['inactive explicit permissions', {permissions: [...codes, 'dms.admin'], active: false}, [false, false, false]],
  ['password-required global administrator', {roleCode: 'system_admin', company: null, password: true}, [false, false, false]],
  ['password-required explicit permissions', {permissions: [...codes, 'dms.admin'], password: true}, [false, false, false]],
  ['missing profile', {permissions: codes, profile: false}, [false, false, false]],
];
for (const [name, input, expected] of matrix) test(`DMS display capabilities: ${name}`, () => assert.deepEqual(capabilityValues(context(input)), expected));

test('optional capabilities fail closed for existing callers', () => {
  const bindings = tableFunction.parameters[0].name.elements;
  for (const name of names) {
    const binding = bindings.find(node => node.name.getText(table) === name);
    assert.ok(binding?.initializer); assert.equal(binding.initializer.kind, ts.SyntaxKind.FalseKeyword);
  }
});
test('New Document and Archive buttons have independent capability visibility guards', () => {
  const guardedButton = (handler, guard, expectedCount) => {
    const buttons = find(tableFunction, node => ts.isJsxElement(node) && node.openingElement.tagName.getText(table) === 'Button'
      && node.openingElement.attributes.properties.some(prop => ts.isJsxAttribute(prop) && prop.name.text === 'onClick' && prop.initializer?.getText(table).includes(handler)));
    assert.equal(buttons.length, expectedCount, `${handler} button count`);
    for (const button of buttons) {
      let node = button, guarded = false;
      while (node && node !== tableFunction) {
        if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && node.left.getText(table) === guard) guarded = true;
        node = node.parent;
      }
      assert.equal(guarded, true, `${handler} must be inside ${guard}`);
    }
  };
  guardedButton('openNewDocument', 'canCreate', 2); guardedButton('handleArchive', 'canArchive', 1);
});
function callbacks(capabilities) {
  const calls = [], pending = [];
  const globals = {...capabilities, openTab: value => calls.push(['open', value.route]),
    startTransition: task => pending.push(task()),
    archiveDmsDocument: async id => {calls.push(['archive', id]); return {success: true};},
    unarchiveDmsDocument: async id => {calls.push(['unarchive', id]); return {success: true};},
    toast: {success: () => {}, error: () => {}}, uiReadDocuments: {refetch: async () => {calls.push(['refetch']);}}};
  const functions = ['openDocument', 'openNewDocument', 'handleArchive'].map(name => {
    const fn = tableFunction.body.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
    assert.ok(fn); return `export ${fn.getText(table)}`;
  });
  return {...compile(functions.join('\n'), globals), calls, pending};
}
test('denied callbacks do not navigate to create or dispatch archive/unarchive', async () => {
  const subject = callbacks({canCreate: false, canEdit: false, canArchive: false});
  subject.openNewDocument(); subject.handleArchive({id: 7, is_archived: false}); subject.handleArchive({id: 8, is_archived: true});
  await Promise.all(subject.pending); assert.deepEqual(subject.calls, []);
});
test('allowed callbacks preserve the existing create, archive and unarchive operations', async () => {
  const subject = callbacks({canCreate: true, canEdit: true, canArchive: true});
  subject.openNewDocument(); subject.handleArchive({id: 7, is_archived: false}); subject.handleArchive({id: 8, is_archived: true});
  await Promise.all(subject.pending);
  assert.equal(subject.calls.filter(call => call[0] === 'refetch').length, 2);
  assert.deepEqual(subject.calls.filter(call => call[0] !== 'refetch'), [['open', '/dms/documents/record/new'], ['archive', 7], ['unarchive', 8]]);
});
for (const canEdit of [false, true]) test(`all document navigation uses ${canEdit ? 'edit' : 'view'} mode`, () => {
  const subject = callbacks({canCreate: false, canEdit, canArchive: false});
  subject.openDocument(7);
  assert.deepEqual(subject.calls, [['open', `/dms/documents/record/7?mode=${canEdit ? 'edit' : 'view'}`]]);
  const calls = find(tableFunction, node => ts.isCallExpression(node) && node.expression.getText(table) === 'openDocument');
  assert.equal(calls.length, 6); // Standard grid, AI and semantic result paths.
  for (const call of calls) assert.equal(call.arguments.length, 1, 'no caller overrides display authority');
});
test('display permission codes match unchanged server mutation admission', () => {
  for (const [action, code] of [['createDmsDocument', codes[0]], ['updateDmsDocument', codes[1]], ['archiveDmsDocument', codes[2]], ['unarchiveDmsDocument', codes[2]]]) {
    const fn = server.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === action);
    assert.ok(fn);
    const conditions = find(fn, ts.isIfStatement).map(node => node.expression.getText(server).replace(/\s+/g, ' '));
    assert.ok(conditions.includes(`!hasPermission(ctx, "${code}") && !hasPermission(ctx, "dms.admin")`), action);
  }
  const hardDelete = tableElement.attributes.properties.find(node => ts.isJsxAttribute(node) && node.name.text === 'canHardDelete');
  assert.equal(hardDelete.initializer.expression.getText(page), 'isGlobalAdmin(authContext)');
});
