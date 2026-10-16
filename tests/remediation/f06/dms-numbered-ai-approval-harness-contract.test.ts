// Offline source-only harness review. Never import the opt-in actual test or checker.
import fs from 'node:fs';
import {expect,it} from 'vitest';
const actual=fs.readFileSync('tests/remediation/f06/dms-numbered-ai-approval.local.test.ts','utf8');
const checker=fs.readFileSync('tests/remediation/f06/dms-numbered-ai-approval-resource-check.mjs','utf8');
const targetWindow=actual.slice(actual.indexOf('async function withCompanyLinkRead'),actual.indexOf('async function assertReminderAdminScope'));

it('optional organization target-read does not join the global DMS fixture permissions',()=>{
 const codes=actual.match(/const codes=\[([^\]]+)\]/)?.[1];
 expect(codes).toBeDefined();expect(codes).not.toContain('organizations.');
 expect(targetWindow).toContain("await assertNoCompanyLinkRead('reader')");
 expect(targetWindow).toContain('planDmsFixturePermission(old,ledger.rows)');
 expect(targetWindow).toContain("baselineAssignments??[]");
 expect(targetWindow).toContain('refusing activation');
});
it('case-local grants use one exact permission and company-only assignment',()=>{
 expect(targetWindow).toContain("const code='organizations.view'");
 expect(targetWindow).toContain('permissionIds:[permission]');
 expect(targetWindow).toContain('values(${entry.roleId},${permission})');
 expect(targetWindow).toContain('owner_company_id:entry.companyId,is_active:true');
 expect(targetWindow).toContain('companyId:ledger.companyIds[0]');
 expect(targetWindow).not.toMatch(/organizations\.manage|owner_company_id:null|branch_id:/);
});
it('case-local activation and identity are recorded before body and restored in independent finally steps',()=>{
 expect(targetWindow.indexOf('Open exact case-local')).toBeLessThan(targetWindow.indexOf('update public.permissions set is_active=true'));
 expect(targetWindow.indexOf('Bind exact case-local')).toBeLessThan(targetWindow.indexOf('return await body()'));
 expect(targetWindow).toContain("}finally{");
 expect(targetWindow).toContain("[['user_roles',entry.assignmentId],['roles',entry.roleId]]");
 expect(targetWindow).toContain('if(!originalActive)sql(`update public.permissions set is_active=false');
 expect(targetWindow).toContain('caseCleanupFailures.push(...failures)');
 expect(actual).toContain('const cleanupFailures:string[]=[...caseCleanupFailures]');
});
it('the positive child case and each mandatory fault execute inside the bounded target-read window',()=>{
 expect(actual).toContain("withCompanyLinkRead('CHILDREN',async()=>");
 expect(actual).toContain("withCompanyLinkRead('CHILD_FAULT_'+table,async()=>");
 expect(actual).toContain("withCompanyLinkRead('LINK_SCOPE',async()=>");
 expect(actual).toContain("company links require independent scoped target read while no-link DMS preparation does not");
 expect(actual).toContain("entityId:ledger.companyIds[1]");
 expect(actual).toContain("d.rpc==='finish_numbered_ai_intake'&&d.code==='23514'");
});
it('direct private helper probes use exact tracked sessions and do not serialize claims into receipts',()=>{
 const caller=actual.slice(actual.indexOf('async function helperCaller'),actual.indexOf('async function assertNoCompanyLinkRead'));
 expect(caller).toContain('s.sessionId===claims.session_id&&s.authUserId===claims.sub');
 expect(caller).toContain("set_config('request.jwt.claims'");
 expect(caller).toContain('true) is not null');
 expect(caller).not.toMatch(/intent\(|persist\(|writeFile|console\./);
 expect(actual).toContain('direct private destination admission requires current %s');
 expect(actual).toContain("exception when sqlstate '${code}'");
});
it('checker accepts historical no-window receipts but requires exact current grant-window intents and cleanup',()=>{
 expect(checker).toContain('const linkGrants=m.companyLinkGrants??[]');
 for(const intent of ['Open exact case-local company-link target-read window','Close exact case-local company-link target-read window','Bind exact case-local company-link grant identity'])expect(checker).toContain(intent);
 expect(checker).toContain("permission_code='organizations.view' and is_active=${g.permissionOriginallyActive}");
 expect(checker).toContain('owner_company_id=${g.companyId} and branch_id is null and not is_active');
 expect(checker).toContain('g.retired!==true||g.permissionRestored!==true');
 expect(checker).toContain('if(m.cleanupFailures.length)failed.push');
});
