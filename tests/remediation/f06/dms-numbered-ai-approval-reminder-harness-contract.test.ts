// Offline authoring contracts only. Never import the actual harness or DB runtime.
import fs from 'node:fs';
import ts from 'typescript';
import {expect,it} from 'vitest';
const file='tests/remediation/f06/dms-numbered-ai-approval.local.test.ts';
const actual=fs.readFileSync(file,'utf8');
const faults=actual.slice(actual.indexOf("it.each(['dms_document_metadata_values'"));

it('automatic positives and all four fault cases have no reminder-admin permission window',()=>{
 expect(actual.match(/const codes=\[([^\]]+)\]/)?.[1]).not.toContain('dms.admin');
 expect(actual).not.toContain('withReminderAdmin');
 expect(actual).not.toContain('Open exact case-local reminder-admin window');
 expect(actual).not.toContain("permission_code:'dms.admin',permission_name");
 expect(actual).toContain('const reminderAdminGrants:never[]=[]');
 expect(actual).toContain("await assertReminderAdminScope(false,false,actor)");
 expect(faults).toContain('await assertReminderAdminScope(false,false)');
 expect(actual).toContain('target_branch_id:branch');expect(actual).toContain("role_code:'system_admin'");
});
it('keeps historical grant validation intact rather than waiving old receipts',()=>{
 const checker=fs.readFileSync('tests/remediation/f06/dms-numbered-ai-approval-resource-check.mjs','utf8');
 expect(checker).toContain('validateReminderAdminWindows(m.reminderAdminGrants,intents,');
 expect(checker).toContain('...reminderWindows.failures');
 expect(checker).toContain('permission_code=\'dms.admin\' and is_active=${g.permissionOriginallyActive}');
 expect(actual).toContain('borrowedPermissions,companyLinkGrants,reminderAdminGrants,automaticReminderProbes,automaticReminderRaces,authSessions');
});
it('retains exact child fault denial, rollback and same-request recovery after removing each fault',()=>{
 expect(faults).toContain("d.rpc==='finish_numbered_ai_intake'&&d.code==='23514'");
 expect(faults).toContain('assertNoApprovalBusinessChildren(begin.data.documentId,f.id,c.operationId,begin.data.reference_id)');
 expect(faults.indexOf('const recovered=await approveAiIntakeAndCreateDocument(request,c)')).toBeGreaterThan(faults.indexOf('drop trigger if exists'));
 expect(faults).toContain('documentId:begin.data.documentId');expect(faults).toContain('expect(issued()).toBe(afterReservation)');
 expect(faults).toContain('expect(retainedCopy()).toBe(copyBeforeRetry)');
 expect(faults).toContain('o.id=p.object_id and o.version=p.object_version and o.updated_at=p.object_updated_at');
 expect(faults.match(/const c=contract\(\)|,c=contract\(\)/g)).toHaveLength(1);
});
it('manual RLS/action denial is separate from automatic no-admin success',()=>{
 expect(actual).toContain('AR01 company-scoped expiry approval creates exactly six defaults without reminder admin');
 expect(actual).toContain('Manual reminder INSERT became available');expect(actual).toContain('Manual reminder UPDATE changed rows');
 expect(actual).toContain('Manual reminder DELETE changed rows');
 expect(actual).toContain('generateDmsExpiryRemindersForDocument(f.documentId)');expect(actual).toContain('rebuildDmsExpiryReminders(f.documentId)');
 expect(actual).toContain("{success:false,error:'Permission denied'}");
});
it('replay/proof mutations run only in explicit rollback probes with exact full-row fingerprints',()=>{
 const helper=actual.slice(actual.indexOf('async function rollbackReminderProbe'),actual.indexOf('function installReminderWait'));
 expect(helper).toContain('begin;set local statement_timeout=\'15s\';set local lock_timeout=\'5s\';');
 expect(helper).toContain('${setup}${caller}${body}rollback;');expect(helper).toContain('finally{const after=sql(reminderSnapshotSql(identity))');
 expect(helper).toContain('unchanged:before===after');expect(helper).toContain("expect(after,'Exact pre-probe business/proof/history rows must survive rollback unchanged').toBe(before)");
 expect(actual).toContain("['sent','dismissed','cancelled','missing']");
 expect(actual).toContain('Replay modified reminder history');expect(actual).toContain('Existing schedule was adopted');
});
it('late authority probes are observable waits with exact pair/session restoration and rollback assertions',()=>{
 expect(actual).toContain("it.each([...codes,'control'])");expect(actual).toContain("it.each(['session','principal']");
 expect(actual).toContain('expect(result.blocked).toBe(true)');expect(actual).toContain("expect(result.second.error).toContain('42501')");
 expect(actual).toContain('assertNoApprovalBusinessChildren(f.documentId,f.id,f.c.operationId,f.referenceId)');
 expect(actual).toContain('try{wait.remove();}finally');expect(actual).toContain('where role_id=${role} and permission_id=${permission}');
 expect(actual).toContain('where id=${q(session.sessionId)} and user_id=${q(session.authUserId)}');
 expect(actual).toContain("original:before");expect(actual).toContain('expect(session.profileId).toBe(ledger.actors.reader.profileId)');
});
it('tests second proof and source-first lock order without persisting caller claims',()=>{
 expect(actual).toContain('AR19 second full proof rejects a completion fact changed during the reminder wait');
 expect(actual).toContain("expect(result.second.error).toContain('PT409')");
 expect(actual).toContain('new_values=${q(JSON.stringify(audit.values))}::jsonb where id=${audit.id}');
 expect(actual).toContain('AR20 normal finish and direct completion use source before plan');
 expect(actual).toContain('Persist only a non-secret statement fragment, never JWT claims');
 expect(actual).not.toContain('holderStatements.push(hold);\n  intent({operation:\'Same-source');
});
it('does not turn the original unsafe main-runtime direct-denial case into a passing metadata claim',()=>{
 const acl=actual.slice(actual.indexOf("it('destination helper ACL metadata"),actual.indexOf("it('company links require"));
 expect(acl).toContain('has_function_privilege');expect(acl).toContain('dms-destination-fixed-runtime-acl.mjs');
 expect(acl).toContain('replace the original failed main-runtime denial case or qualify this image');
 expect(acl).not.toContain('set local role');expect(acl).not.toContain('do $$');
});
it('parses the actual source without executing or importing it',()=>{
 const source=ts.createSourceFile(file,actual,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 expect((source as ts.SourceFile&{parseDiagnostics:unknown[]}).parseDiagnostics).toEqual([]);
});
