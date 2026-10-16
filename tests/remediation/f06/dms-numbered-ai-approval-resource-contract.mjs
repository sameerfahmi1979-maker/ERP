// Pure identity reconciliation only. No database, manifest, ledger or runtime I/O.
import assert from 'node:assert/strict';

export function reconcileUploadSessionCreationIntents(sessionCodes, returnedIds, observedRows) {
 assert.ok(Array.isArray(sessionCodes) && Array.isArray(returnedIds) && Array.isArray(observedRows));
 for (const code of sessionCodes) assert.ok(typeof code === 'string' && code.length > 0, 'Expected exact session_code');
 for (const id of returnedIds) assert.ok(Number.isSafeInteger(id) && id > 0, 'Expected returned source ID');
 assert.equal(new Set(sessionCodes).size, sessionCodes.length, 'Duplicate source creation intent');
 assert.equal(new Set(returnedIds).size, returnedIds.length, 'Duplicate returned source ID');
 const intended = new Set(sessionCodes), returned = new Set(returnedIds), seen = new Set();
 const failures = [], unreturnedAttempts = [];
 for (const row of observedRows) {
  assert.ok(row && Number.isSafeInteger(row.id) && row.id > 0 && typeof row.session_code === 'string');
  assert.ok(intended.has(row.session_code) || returned.has(row.id), 'Observation outside exact source identity query');
  assert.ok(!seen.has(row.id), 'Duplicate observed source ID');
  seen.add(row.id);
 }
 for (const id of returnedIds) {
  const row = observedRows.find(value => value.id === id);
  if (!row) failures.push(`Returned upload session ${id}: exact row missing`);
  else if (!intended.has(row.session_code)) failures.push(`Returned upload session ${id}: original session_code missing`);
 }
 for (const sessionCode of sessionCodes) {
  const matches = observedRows.filter(row => row.session_code === sessionCode);
  const trackedMatches = matches.filter(row => returned.has(row.id));
  if (trackedMatches.length === 1 && matches.length === 1) continue;
  if (trackedMatches.length) {
   failures.push(`Upload session intent ${sessionCode}: ambiguous exact identity`);
   continue;
  }
  const observedAbsent = matches.length === 0;
  unreturnedAttempts.push({
   sessionCode, observedRowIds: matches.map(row => row.id), observedAbsent,
   classification: observedAbsent ? 'unreturned_intent_proven_absent' : 'unreturned_intent_requires_reconciliation',
   creationSuccessClaim: false,
  });
  if (!observedAbsent) failures.push(`Unreturned upload session intent ${sessionCode}: existing exact row requires main reconciliation`);
 }
 return {
  intendedSessionCodes: [...sessionCodes], returnedSourceIds: [...returnedIds],
  intentCount: sessionCodes.length, returnedSourceCount: returnedIds.length,
  unreturnedAttempts, failures,
 };
}

// Historical grant-window receipts are validated separately from final SQL
// observations. The historical snapshot is NOT today's active assignment set.
export function validateReminderAdminWindows(value, intents, context) {
 const grants = value === undefined ? [] : value;
 assert.ok(Array.isArray(grants) && Array.isArray(intents));
 const positive = id => assert.ok(Number.isSafeInteger(id) && id > 0, 'Expected exact positive window ID');
 const unique = values => assert.equal(new Set(values).size, values.length, 'Duplicate reminder-window identity');
 const same = (left, right) => assert.deepEqual([...left].sort(), [...right].sort(), 'Reminder-window intent set differs');
 const opened = intents.filter(i => i.operation === 'Open exact case-local reminder-admin window');
 const closed = intents.filter(i => i.operation === 'Close exact case-local reminder-admin window');
 const bound = intents.filter(i => i.operation === 'Bind exact case-local reminder-admin grant identity');
 const activated = intents.filter(i => i.operation === 'Activate exact case-local reminder-admin permission definition');
 unique(grants.map(g => g.caseName));
 unique(grants.filter(g => g.roleId !== undefined).map(g => g.roleId));
 unique(grants.filter(g => g.assignmentId !== undefined).map(g => g.assignmentId));
 same(grants.map(g => g.caseName), opened.map(i => i.caseName));
 same(grants.map(g => g.caseName), closed.map(i => i.caseName));
 same(grants.filter(g => g.assignmentId !== undefined).map(g => g.caseName), bound.map(i => i.caseName));
 same(grants.filter(g => !g.permissionOriginallyActive).map(g => `${g.caseName}:${g.permissionId}`), activated.map(i => `${i.caseName}:${i.id}`));
 const normalCases = ['CHILDREN', ...['dms_document_metadata_values', 'dms_document_tags', 'dms_document_links', 'dms_expiry_reminders'].map(t => 'CHILD_FAULT_' + t)];
 const failures = [], observations = [];
 const owns = (table, id) => context.owned.some(row => row.table === table && row.id === id);
 for (const g of grants) {
  assert.ok(normalCases.includes(g.caseName) || g.caseName === 'REMINDER_WRONG_COMPANY', 'Unexpected reminder-admin case');
  assert.equal(g.actor, 'reader');
  assert.equal(g.companyId, context.companyIds[g.caseName === 'REMINDER_WRONG_COMPANY' ? 1 : 0]);
  positive(g.companyId);positive(g.permissionId);
  for (const key of ['permissionOriginallyActive', 'permissionCreated', 'retired', 'permissionRestored', 'priorAssignmentsRestored']) assert.equal(typeof g[key], 'boolean');
  const open = opened.find(i => i.caseName === g.caseName), close = closed.find(i => i.caseName === g.caseName);
  for (const key of ['actor', 'companyId', 'permissionId', 'permissionOriginallyActive', 'permissionCreated']) assert.equal(open[key], g[key]);
  for (const key of ['permissionId', 'permissionOriginallyActive']) assert.equal(close[key], g[key]);
  assert.equal(close.roleId, g.roleId ?? null);assert.equal(close.assignmentId, g.assignmentId ?? null);
  assert.ok(intents.indexOf(open) < intents.indexOf(close), 'Reminder-window close precedes opening');
  assert.ok(Array.isArray(g.priorAssignments));unique(g.priorAssignments.map(row => row.id));
  assert.deepEqual(g.priorAssignments, open.priorAssignments, 'Original reminder-window snapshot differs');
  for (const row of g.priorAssignments) {
   positive(row.id);positive(row.role_id);positive(row.profile_id);
   assert.ok(context.profileIds.includes(row.profile_id));assert.equal(typeof row.role_code, 'string');
   if (row.company_id !== null) positive(row.company_id);
   if (row.branch_id !== null) positive(row.branch_id);
   assert.notEqual(row.id, g.assignmentId);assert.notEqual(row.role_id, g.roleId);
   assert.ok(Array.isArray(row.permissions));unique(row.permissions.map(p => p.id));
   for (const permission of row.permissions) { positive(permission.id);assert.equal(typeof permission.code, 'string');assert.equal(typeof permission.active, 'boolean'); }
  }
  if (g.permissionCreated) { assert.equal(g.permissionOriginallyActive, false);assert.ok(owns('permissions', g.permissionId), 'Created reminder permission is not owned'); }
  if (!g.permissionOriginallyActive) {
   assert.ok(context.ownedPermissionIds.includes(g.permissionId), 'Reminder activation lacks exact ledger ownership');
   if (!g.permissionCreated) assert.ok(context.borrowedPermissions.some(p => p.id === g.permissionId && p.code === 'dms.admin' && p.originalActive === false), 'Borrowed reminder permission lacks exact restoration receipt');
   const activation = activated.find(i => i.caseName === g.caseName);
   assert.equal(activation.code, 'dms.admin');assert.equal(activation.originalActive, false);
   assert.ok(intents.indexOf(open) < intents.indexOf(activation) && intents.indexOf(activation) < intents.indexOf(close), 'Reminder activation outside window');
  }
  if (g.roleId !== undefined) { positive(g.roleId);assert.ok(owns('roles', g.roleId), 'Reminder role is not owned'); }
  if (g.assignmentId !== undefined) {
   positive(g.assignmentId);positive(g.roleId);assert.ok(owns('user_roles', g.assignmentId), 'Reminder assignment is not owned');
   const binding = bound.find(i => i.caseName === g.caseName);
   for (const key of ['actor', 'companyId', 'permissionId', 'roleId', 'assignmentId']) assert.equal(binding[key], g[key]);
   assert.ok(intents.indexOf(open) < intents.indexOf(binding) && intents.indexOf(binding) < intents.indexOf(close), 'Reminder binding outside window');
   if (!g.permissionOriginallyActive) assert.ok(intents.indexOf(activated.find(i => i.caseName === g.caseName)) < intents.indexOf(binding), 'Reminder binding precedes activation');
  }
  if (!g.retired || !g.permissionRestored || !g.priorAssignmentsRestored) failures.push(`Reminder-admin ${g.caseName}: historical window cleanup was not verified`);
  observations.push({caseName:g.caseName,actor:g.actor,companyId:g.companyId,permissionId:g.permissionId,roleId:g.roleId??null,assignmentId:g.assignmentId??null,priorAssignmentCount:g.priorAssignments.length,priorAssignmentsRestored:g.priorAssignmentsRestored,retired:g.retired,permissionRestored:g.permissionRestored,historicalSnapshotOnly:true});
 }
 return {grants,failures,observations};
}
