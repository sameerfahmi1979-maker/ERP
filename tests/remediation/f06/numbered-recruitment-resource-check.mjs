// MAIN ONLY read-only reconciliation of exact manifest identities. Never repairs.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {guard,sql,evidence} from './local-db.mjs';
assert.equal(process.argv.length,2,'This checker accepts no arbitrary input paths or SQL');
assert.equal(process.env.ALGT_F06_LOCAL_TARGET,undefined,'Only the isolated F06 local target is permitted');
guard();
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const q=value=>"'"+String(value).replaceAll("'","''")+"'";
const id=value=>{assert.ok(Number.isSafeInteger(value)&&value>0);return value;};
const tables=new Set(['permissions','roles','user_roles','global_numbering_rules','owner_companies','hr_candidates','hr_job_requisitions','hr_offers','hr_onboarding_tasks','employees','employee_recruitment_links','global_numbering_generated_references','employee_status_events','audit_logs']);
const permissionCodes=new Set(['hr.recruitment.manage','hr.recruitment.view','hr.employees.create','hr.employees.view','hr.employees.update','numbering.rules.generate','hr.payroll.view','hr.payroll.manage']);
const files=fs.readdirSync(evidence).filter(file=>/^NUMBERED_RECRUITMENT_RESOURCES_FRC[A-Z0-9]+\.json$/.test(file));
assert.ok(files.length,'No exact recruitment resource manifest exists');
let resources=0;const runs=[];
for(const file of files){
 const run=JSON.parse(fs.readFileSync(path.join(evidence,file),'utf8'));assert.match(run.marker,/^FRC[A-Z0-9]+$/);id(run.actor);
 assert.deepEqual(run.cleanupFailures,[],'Suite cleanup was not confirmed');assert.equal(run.productionWrites,0);assert.equal(run.providerCalls,0);
 const checks=[];
 for(const row of run.owned){assert.ok(tables.has(row.table));id(row.id);resources++;
  let predicate=`id=${row.id}`;
  if(['user_roles','roles','global_numbering_rules'].includes(row.table))predicate+=' and is_active=false';
  if(row.table==='permissions')predicate+=` and permission_name=${q(run.marker)} and is_active=false`;
  if(row.table==='owner_companies')predicate+=" and status='inactive'";
  if(['hr_candidates','hr_job_requisitions','hr_offers','hr_onboarding_tasks','employees'].includes(row.table))predicate+=' and deleted_at is not null';
  checks.push(`(select count(*)=1 from public.${row.table} where ${predicate})`);
 }
 for(const row of run.borrowed){assert.ok(['permissions','global_numbering_rules'].includes(row.table));id(row.id);assert.equal(typeof row.originalActive,'boolean');checks.push(`(select count(*)=1 from public.${row.table} where id=${row.id} and is_active=${row.originalActive})`);}
 const pairKeys=new Set();
 for(const row of run.rolePermissions){
  id(row.roleId);id(row.permissionId);assert.ok(permissionCodes.has(row.permissionCode));assert.ok(run.owned.some(owned=>owned.table==='roles'&&owned.id===row.roleId));
  const pairKey=`${row.roleId}:${row.permissionId}`;assert.ok(!pairKeys.has(pairKey),'Duplicate expected role-permission pair');pairKeys.add(pairKey);
  checks.push(`(select count(*)=1 from public.role_permissions rp join public.permissions p on p.id=rp.permission_id where rp.role_id=${row.roleId} and rp.permission_id=${row.permissionId} and p.permission_code=${q(row.permissionCode)})`);
 }
 for(const role of run.owned.filter(row=>row.table==='roles')){
  const expected=run.rolePermissions.filter(row=>row.roleId===role.id).map(row=>row.permissionId).sort((a,b)=>a-b);
  checks.push(`(select coalesce(jsonb_agg(permission_id order by permission_id),'[]'::jsonb)=${q(JSON.stringify(expected))}::jsonb from public.role_permissions where role_id=${role.id})`);
 }
 for(const op of run.operations){assert.match(op.operation,uuid);assert.ok(['requisition','conversion'].includes(op.kind));const committed=op.result!=null;
  for(const table of ['recruitment_consumer_proofs','recruitment_consumer_facts'])checks.push(`not exists(select 1 from erp_private.${table} where actor=(select auth_user_id from public.user_profiles where id=${run.actor}) and operation_id=${q(op.operation)})`);
  checks.push(`(select count(*)=${committed?1:0} from erp_private.recruitment_consumer_receipts where actor=(select auth_user_id from public.user_profiles where id=${run.actor}) and operation_id=${q(op.operation)}${committed?' and result='+q(JSON.stringify(op.result))+'::jsonb':''})`);
  checks.push(`(select count(*)=${committed?1:0} from erp_private.numbering_requests where actor_id=${run.actor} and operation_id=${q(op.operation)}${committed?' and reference_id='+id(op.result.reference_id):''})`);
  checks.push(`(select count(*)=${committed?(op.kind==='requisition'?3:5):0} from public.audit_logs where actor_user_profile_id=${run.actor} and new_values->>'operation_id'=${q(op.operation)})`);
  if(committed){const result=op.result;assert.equal(result.operation_id,op.operation);const target=id(op.kind==='requisition'?result.id:result.employee_id);const table=op.kind==='requisition'?'hr_job_requisitions':'employees';
   checks.push(`(select count(*)=1 from public.global_numbering_generated_references where id=${result.reference_id} and generation_status='consumed' and target_table_name=${q(table)} and target_record_id=${target} and generated_by=${run.actor} and generated_reference_number=${q(op.kind==='requisition'?result.requisition_code:result.employee_code)})`);
   if(op.kind==='conversion'){id(result.candidate_id);id(result.link_id);assert.equal(result.candidate_id,op.candidateId);assert.match(result.employee_revision,/^[1-9]\d*$/);assert.match(result.candidate_revision,/^[1-9]\d*$/);
    checks.push(`(select count(*)=1 from public.employee_recruitment_links where id=${result.link_id} and employee_id=${target} and candidate_id=${result.candidate_id} and converted_by=${run.actor})`);
    checks.push(`(select count(*)=1 from public.employee_status_events where employee_id=${target} and old_status is null and created_by=${run.actor})`);
    checks.push(`(select count(*)=1 from public.hr_candidates where id=${result.candidate_id} and workspace_revision>=${result.candidate_revision} and candidate_status='hired' and pipeline_stage='hired' and deleted_at is not null)`);
   }
  }
 }
 for(const session of run.sessions){assert.match(session.sessionId,uuid);assert.match(session.authUserId,uuid);checks.push(`not exists(select 1 from auth.sessions where id=${q(session.sessionId)})`);checks.push(`not exists(select 1 from auth.refresh_tokens where session_id=${q(session.sessionId)})`);}
 for(const holder of run.holders){assert.match(holder.name,/^FRC[A-Z0-9]+_LOCK_[a-f0-9]{10}$/);if(holder.pid!==null)id(holder.pid);checks.push(`not exists(select 1 from pg_stat_activity where application_name=${q(holder.name)}${holder.pid===null?'':' and pid='+holder.pid})`);}
 for(const fault of run.faults){assert.match(fault,/^f06_rec_fault_[a-f0-9]{32}$/);checks.push(`not exists(select 1 from pg_trigger where tgname=${q(fault)})`);checks.push(`not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='erp_private' and p.proname=${q(fault)})`);}
 // One row per observation avoids PostgreSQL's function-argument limit. The
 // explicit zero-based index preserves exact failure indexes at any run size.
 const indexedChecks=checks.length?`values ${checks.map((check,index)=>`(${index},(${check})::boolean)`).join(',')}`:'select 0::integer,false::boolean where false';
 const observed=JSON.parse(sql(`begin read only;set local statement_timeout='20s';select coalesce(jsonb_agg(passed order by check_index),'[]'::jsonb) from (${indexedChecks}) as observations(check_index,passed);rollback;`));
 assert.ok(Array.isArray(observed)&&observed.every(value=>typeof value==='boolean'),'Checker observations must remain exact booleans');
 assert.equal(observed.length,checks.length);runs.push({marker:run.marker,checks:checks.length,passed:observed.filter(Boolean).length,failedIndexes:observed.flatMap((passed,index)=>passed?[]:[index])});
}
const report={at:new Date().toISOString(),success:runs.every(run=>run.failedIndexes.length===0),runs,resources,repairs:0,productionWrites:0,limitation:'Exact manifest identities only; this read-only checker does not prove unlisted historical side effects or replace the guarded actual concurrency/rollback suite.'};
fs.writeFileSync(path.join(evidence,'NUMBERED_RECRUITMENT_RESOURCE_CHECK_20261004.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({success:report.success,runs:runs.length,resources,repairs:0}));
assert.equal(report.success,true,'Exact recruitment resource reconciliation failed; see private report');
