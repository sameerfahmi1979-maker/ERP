// Offline synthetic receipt tests. Never import the checker/actual/local-db.
import fs from 'node:fs';
import {expect,it} from 'vitest';
import {validateReminderAdminWindows as validate} from './dms-numbered-ai-approval-resource-contract.mjs';

function receipt(caseName='CHILDREN',active=true,created=false){
 const grant:any={caseName,actor:'reader',companyId:caseName==='REMINDER_WRONG_COMPANY'?20:10,permissionId:90,permissionOriginallyActive:active,permissionCreated:created,roleId:41,assignmentId:42,retired:true,permissionRestored:true,priorAssignmentsRestored:true,priorAssignments:[{id:12,profile_id:7,role_id:11,role_code:'PREVIOUS',company_id:10,branch_id:null,permissions:[{id:4,code:'dms.documents.view',active:true}]}]};
 const intents:any[]=[{operation:'Open exact case-local reminder-admin window',caseName,actor:grant.actor,companyId:grant.companyId,permissionId:90,permissionOriginallyActive:active,permissionCreated:created,priorAssignments:structuredClone(grant.priorAssignments)},
  ...(!active?[{operation:'Activate exact case-local reminder-admin permission definition',caseName,id:90,code:'dms.admin',originalActive:false}]:[]),
  {operation:'Bind exact case-local reminder-admin grant identity',caseName,actor:grant.actor,companyId:grant.companyId,permissionId:90,roleId:41,assignmentId:42},
  {operation:'Close exact case-local reminder-admin window',caseName,permissionId:90,roleId:41,assignmentId:42,permissionOriginallyActive:active}];
 const context:any={companyIds:[10,20],profileIds:[7,8,9],owned:[{table:'roles',id:41},{table:'user_roles',id:42},...(created?[{table:'permissions',id:90}]:[])],ownedPermissionIds:[90],borrowedPermissions:!active&&!created?[{id:90,code:'dms.admin',originalActive:false}]:[]};
 return {grant,intents,context,run:()=>validate([grant],intents,context)};
}

it('accepts historical absent window arrays only without reminder intents',()=>{
 expect(validate(undefined,[],{})).toEqual({grants:[],failures:[],observations:[]});
 expect(validate([],[],{})).toEqual({grants:[],failures:[],observations:[]});
 expect(()=>validate(null,[],{})).toThrow();
 const r=receipt();expect(()=>validate(undefined,r.intents,r.context)).toThrow('Reminder-window intent set differs');
 expect(()=>validate(undefined,[{operation:'Activate exact case-local reminder-admin permission definition',caseName:'CHILDREN',id:90}],r.context)).toThrow();
});
it.each(['CHILDREN','CHILD_FAULT_dms_document_metadata_values','CHILD_FAULT_dms_document_tags','CHILD_FAULT_dms_document_links','CHILD_FAULT_dms_expiry_reminders','REMINDER_WRONG_COMPANY'])('accepts exact allowed actor/company mapping for %s',caseName=>{
 const r=receipt(caseName),before=JSON.stringify(r);
 const result=r.run();expect(result.failures).toEqual([]);
 expect(result.observations).toEqual([{caseName,actor:'reader',companyId:caseName==='REMINDER_WRONG_COMPANY'?20:10,permissionId:90,roleId:41,assignmentId:42,priorAssignmentCount:1,priorAssignmentsRestored:true,retired:true,permissionRestored:true,historicalSnapshotOnly:true}]);
 expect(JSON.stringify(r)).toBe(before);
});
it('rejects an extra case, foreign actor, swapped company or unrestricted scope',()=>{
 for(const patch of [{caseName:'UNREVIEWED'},{actor:'companyA'},{companyId:20},{companyId:null}]){
  const r=receipt();Object.assign(r.grant,patch);expect(r.run).toThrow();
 }
 const r=receipt('REMINDER_WRONG_COMPANY');r.grant.companyId=10;expect(r.run).toThrow();
});
it('requires original snapshot equality, complete typed identities and known fixture principals',()=>{
 const changed=receipt();changed.grant.priorAssignments[0].permissions[0].active=false;expect(changed.run).toThrow('Original reminder-window snapshot differs');
 for(const change of [(g:any)=>g.priorAssignments.push(structuredClone(g.priorAssignments[0])),(g:any)=>g.priorAssignments[0].profile_id=999,(g:any)=>g.priorAssignments[0].permissions[0].active='true',(g:any)=>g.priorAssignments[0].id=g.assignmentId]){
  const r=receipt();change(r.grant);r.intents[0].priorAssignments=structuredClone(r.grant.priorAssignments);expect(r.run).toThrow();
 }
});
it.each(['retired','permissionRestored','priorAssignmentsRestored'])('retains false historical %s as failure rather than current-row proof',key=>{
 const r=receipt();r.grant[key]=false;
 expect(r.run().failures).toEqual(['Reminder-admin CHILDREN: historical window cleanup was not verified']);
 expect(r.run().observations[0][key]).toBe(false);
 delete r.grant[key];expect(r.run).toThrow();
});
it('requires precise ownership and restoration receipts for inactive/new permission definitions',()=>{
 expect(receipt('CHILDREN',false).run().failures).toEqual([]);
 expect(receipt('CHILDREN',false,true).run().failures).toEqual([]);
 const unowned=receipt('CHILDREN',false);unowned.context.ownedPermissionIds=[];expect(unowned.run).toThrow('Reminder activation lacks exact ledger ownership');
 const unrecorded=receipt('CHILDREN',false);unrecorded.context.borrowedPermissions=[];expect(unrecorded.run).toThrow('Borrowed reminder permission lacks exact restoration receipt');
 const created=receipt('CHILDREN',false,true);created.context.owned=created.context.owned.filter((r:any)=>r.table!=='permissions');expect(created.run).toThrow('Created reminder permission is not owned');
 expect(receipt('CHILDREN',true,true).run).toThrow();
 const wrongCode=receipt('CHILDREN',false);wrongCode.intents[1].code='organizations.view';expect(wrongCode.run).toThrow();
});
it('requires exact owned role, assignment and bind/close identities without duplicate windows',()=>{
 for(const table of ['roles','user_roles']){const r=receipt();r.context.owned=r.context.owned.filter((row:any)=>row.table!==table);expect(r.run).toThrow();}
 for(const index of [1,2]){const r=receipt();r.intents[index].assignmentId=99;expect(r.run).toThrow();}
 const r=receipt();expect(()=>validate([r.grant,r.grant],r.intents,r.context)).toThrow('Duplicate reminder-window identity');
 const extra=receipt();extra.intents.push(structuredClone(extra.intents[2]));expect(extra.run).toThrow('Reminder-window intent set differs');
});
it('requires opening, activation, binding and closing in the recorded order',()=>{
 for(const order of [[1,0,2,3],[0,2,1,3],[3,1,2,0]]){
  const r=receipt('CHILDREN',false),reordered=order.map(i=>r.intents[i]);
  expect(()=>validate([r.grant],reordered,r.context)).toThrow();
 }
});
it('can report a partially opened failed window without inventing returned role/assignment identities',()=>{
 const r=receipt();delete r.grant.roleId;delete r.grant.assignmentId;r.grant.retired=false;
 r.intents.splice(1,1);r.intents[1].roleId=null;r.intents[1].assignmentId=null;
 const result=r.run();expect(result.failures).toHaveLength(1);expect(result.observations[0]).toMatchObject({roleId:null,assignmentId:null,historicalSnapshotOnly:true});
});
it('checker verifies current exact flags, scoped assignments and complete one-permission grants separately',()=>{
 const source=fs.readFileSync('tests/remediation/f06/dms-numbered-ai-approval-resource-check.mjs','utf8');
 const block=source.slice(source.indexOf('const reminderWindows='),source.indexOf('if(m.rule!==undefined)'));
 expect(block.includes('validateReminderAdminWindows(m.reminderAdminGrants,intents,')).toBe(true);
 expect(block.includes("permission_code='dms.admin' and is_active=${g.permissionOriginallyActive}")).toBe(true);
 expect(block.includes('where role_id=${g.roleId})=1')).toBe(true);
 expect(block.includes('where role_id=${g.roleId} and permission_id=${g.permissionId}')).toBe(true);
 expect(block.includes('from public.user_roles where role_id=${g.roleId})=${g.assignmentId===undefined?0:1}')).toBe(true);
 expect(block.includes('user_profile_id=${ledger.actors.reader.profileId} and role_id=${g.roleId} and owner_company_id=${g.companyId} and branch_id is null and not is_active')).toBe(true);
 expect(block.includes('priorAssignments')).toBe(false);
 expect(source.includes('...reminderWindows.failures')).toBe(true);
 expect(source.includes('reminderGrantWindows:reminderWindows.observations')).toBe(true);
 expect(source.includes('baseline effective assignments/roles/complete permission sets unchanged')).toBe(true);
 expect(source.includes('None of these observations establishes the blocked caller-ACL probe or overall feature acceptance')).toBe(true);
});
