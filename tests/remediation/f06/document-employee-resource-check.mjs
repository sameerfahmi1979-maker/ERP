// MAIN ONLY. Read-only observations of exact manifest identities; never repairs.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {guard,sql,evidence} from './local-db.mjs';
const diagnostic=process.argv[2]==='--diagnose';
assert.deepEqual(process.argv.slice(2),diagnostic?['--diagnose']:[],'No arbitrary input paths or SQL are accepted');
assert.equal(process.env.ALGT_F06_LOCAL_TARGET,undefined,'Only the isolated F06 local target is permitted');
guard();
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const q=value=>"'"+String(value).replaceAll("'","''")+"'";
const id=value=>{assert.ok(Number.isSafeInteger(value)&&value>0);return value;};
const softTables=['employees','employee_identity_documents','employee_medical_insurances','employee_training_certificates','dms_document_links','dms_document_files','dms_documents','dms_document_types','dms_document_categories','hr_identity_document_types','hr_training_types'];
const tables=new Set([...softTables,'permissions','roles','user_roles','global_numbering_rules','erp_ai_feature_flags','owner_companies','global_numbering_generated_references','employee_status_events','audit_logs','dms_document_events','dms_ai_extraction_jobs','dms_ai_extraction_results']);
const permissionCodes=new Set(['hr.employees.create','hr.employees.view','hr.employees.update','hr.compliance.manage','hr.compliance.view','hr.medical.manage','hr.medical.view','hr.settings.view','dms.documents.view','dms.documents.preview','dms.documents.edit','numbering.rules.generate']);
const files=fs.readdirSync(evidence).filter(file=>/^DOCUMENT_EMPLOYEE_RESOURCES_FDE[A-Z0-9]+\.json$/.test(file));
assert.ok(files.length,'No exact document employee resource manifest exists');
let resources=0,repairs=0;const runs=[];
for(const file of files){
 const bytes=fs.readFileSync(path.join(evidence,file)),run=JSON.parse(bytes);assert.match(run.marker,/^FDE[A-Z0-9]+$/);id(run.actor);
 let independentlyRepaired=false;
 if(run.marker==='FDEMUU9BRBR'&&fs.existsSync(path.join(evidence,'DOCUMENT_EMPLOYEE_FIRST_RUN_RETIREMENT_20261005.json'))){
  const repair=JSON.parse(fs.readFileSync(path.join(evidence,'DOCUMENT_EMPLOYEE_FIRST_RUN_RETIREMENT_20261005.json'),'utf8'));
  assert.equal(repair.state,'PASS');assert.equal(repair.marker,run.marker);assert.equal(repair.productionWrites,0);assert.equal(repair.repairs,3);
  assert.equal(repair.manifestSha256,createHash('sha256').update(bytes).digest('hex'));
  assert.deepEqual(repair.targets,[{table:'hr_identity_document_types',id:9},{table:'hr_identity_document_types',id:10},{table:'hr_training_types',id:10}]);
  assert.equal(run.cleanupFailures.length,3);repairs+=3;independentlyRepaired=true;
 }
 if(!diagnostic&&!independentlyRepaired)assert.deepEqual(run.cleanupFailures,[],'Suite cleanup was not confirmed');assert.equal(run.productionWrites,0);assert.equal(run.providerCalls,0);
 const checks=[];
 for(const row of run.owned){assert.ok(tables.has(row.table));id(row.id);resources++;let predicate=`id=${row.id}`;
  if(softTables.includes(row.table))predicate+=' and deleted_at is not null';
  if(['hr_identity_document_types','hr_training_types'].includes(row.table))predicate+=' and not is_active';
  if(['roles','user_roles','global_numbering_rules'].includes(row.table))predicate+=' and not is_active';
  if(row.table==='user_roles')predicate+=` and user_profile_id=${run.actor}`;
  if(row.table==='permissions')predicate+=` and permission_name=${q(run.marker)} and not is_active`;
  if(row.table==='erp_ai_feature_flags')predicate+=` and feature_name=${q(run.marker)} and not is_enabled`;
  if(row.table==='owner_companies')predicate+=" and status='inactive'";
  if(row.table==='dms_ai_extraction_jobs')predicate+=" and status='completed'";
  if(row.table==='dms_ai_extraction_results')predicate+=" and ai_status='superseded'";
  checks.push(`(select count(*)=1 from public.${row.table} where ${predicate})`);
 }
 for(const row of run.borrowed){assert.ok(['permissions','global_numbering_rules','erp_ai_feature_flags'].includes(row.table));id(row.id);assert.equal(typeof row.original,'boolean');assert.equal(row.column,row.table==='erp_ai_feature_flags'?'is_enabled':'is_active');checks.push(`(select count(*)=1 from public.${row.table} where id=${row.id} and ${row.column}=${row.original})`);}
 for(const row of run.borrowedCatalogues??[]){
  assert.equal(row.table,'hr_identity_document_types');id(row.id);assert.equal(row.code.toUpperCase(),'PASSPORT');assert.equal(typeof row.is_active,'boolean');
  assert.ok(row.deleted_at===null||typeof row.deleted_at==='string');
  assert.ok(files.some(prior=>JSON.parse(fs.readFileSync(path.join(evidence,prior),'utf8')).owned.some(owned=>owned.table===row.table&&owned.id===row.id)),'Borrowed canonical catalogue must be owned by an exact historical manifest');
  checks.push(`(select count(*)=1 from public.hr_identity_document_types where id=${row.id} and code=${q(row.code)} and is_active=${row.is_active} and deleted_at is not distinct from ${row.deleted_at===null?'null':q(row.deleted_at)}::timestamptz)`);
 }
 const pairs=new Set();for(const pair of run.rolePermissions){id(pair.roleId);id(pair.permissionId);assert.ok(permissionCodes.has(pair.permissionCode));assert.ok(run.owned.some(row=>row.table==='roles'&&row.id===pair.roleId));const key=`${pair.roleId}:${pair.permissionId}`;assert.ok(!pairs.has(key));pairs.add(key);
  checks.push(`(select count(*)=1 from public.role_permissions rp join public.permissions p on p.id=rp.permission_id where rp.role_id=${pair.roleId} and rp.permission_id=${pair.permissionId} and p.permission_code=${q(pair.permissionCode)})`);
 }
 for(const role of run.owned.filter(row=>row.table==='roles')){const expected=run.rolePermissions.filter(row=>row.roleId===role.id).map(row=>row.permissionId).sort((a,b)=>a-b);checks.push(`(select coalesce(jsonb_agg(permission_id order by permission_id),'[]'::jsonb)=${q(JSON.stringify(expected))}::jsonb from public.role_permissions where role_id=${role.id})`);}
 for(const op of run.operations){assert.match(op.operation,uuid);const committed=op.result!=null,result=op.result;
  checks.push(`(select count(*)=${committed?1:0} from erp_private.document_employee_receipts where actor=(select auth_user_id from public.user_profiles where id=${run.actor}) and operation_id=${q(op.operation)}${committed?' and result='+q(JSON.stringify(result))+'::jsonb':''})`);
  checks.push(`not exists(select 1 from erp_private.document_employee_insert_proofs where actor=(select auth_user_id from public.user_profiles where id=${run.actor}) and operation_id=${q(op.operation)})`);
  checks.push(`not exists(select 1 from erp_private.document_employee_insert_facts where actor=(select auth_user_id from public.user_profiles where id=${run.actor}) and operation_id=${q(op.operation)})`);
  checks.push(`(select count(*)=${committed?1:0} from erp_private.numbering_requests where actor_id=${run.actor} and operation_id=${q(op.operation)}${committed?' and reference_id='+id(result.referenceId):''})`);
  checks.push(`(select count(*)=${committed?3:0} from public.audit_logs where actor_user_profile_id=${run.actor} and new_values->>'operation_id'=${q(op.operation)})`);
  checks.push(`(select count(*)=${committed?id(result.documentsLinked):0} from public.dms_document_events where performed_by=${run.actor} and metadata_json->>'operation_id'=${q(op.operation)})`);
  if(!committed)continue;
  id(result.employeeId);id(result.referenceId);assert.equal(result.operationId,op.operation);assert.match(result.employeeRevision,/^[1-9]\d*$/);assert.equal(result.replayed,false);
  assert.equal(result.documentsLinked,result.sourceDocumentIds.length);assert.equal(result.documentsLinked,result.linkIds.length);assert.equal(result.complianceRecordsCreated,result.childRecords.length);
  result.sourceDocumentIds.forEach(id);result.linkIds.forEach(id);assert.equal(new Set(result.sourceDocumentIds).size,result.sourceDocumentIds.length);assert.equal(new Set(result.linkIds).size,result.linkIds.length);
  checks.push(`(select count(*)=1 from public.employees where id=${result.employeeId} and employee_code=${q(result.employeeCode)} and created_by=${run.actor} and workspace_revision>=${result.employeeRevision} and deleted_at is not null)`);
  checks.push(`(select count(*)=1 from public.global_numbering_generated_references g join erp_private.numbering_requests n on n.reference_id=g.id join erp_private.document_employee_receipts r on r.operation_id=n.operation_id and r.actor=(select auth_user_id from public.user_profiles where id=${run.actor}) where n.actor_id=${run.actor} and n.operation_id=${q(op.operation)} and g.id=${result.referenceId} and g.generated_by=${run.actor} and g.generation_status='consumed' and g.target_table_name='employees' and g.target_record_id=${result.employeeId} and g.generated_reference_number=${q(result.employeeCode)} and g.generation_reason='F06 HR document employee '||r.request_hash and n.request_hash=md5(jsonb_build_array(null::bigint,'HR_EMPLOYEE'::text,null::text,'reserved'::text,'employees'::text,null::bigint,'F06 HR document employee '||r.request_hash)::text))`);
  checks.push(`(select count(*)=1 from public.employee_status_events where employee_id=${result.employeeId} and old_status is null and created_by=${run.actor} and reason='Employee created from DMS documents (HR.14A)')`);
  const sources=[...result.sourceDocumentIds].sort((a,b)=>a-b);const links=result.linkIds;
  checks.push(`(select coalesce(jsonb_agg(id order by document_id),'[]'::jsonb)=${q(JSON.stringify(links))}::jsonb from public.dms_document_links where entity_type='employee' and entity_id=${result.employeeId} and linked_by=${run.actor} and link_role='hr14a_source' and not is_primary and deleted_at is not null)`);
  checks.push(`(select coalesce(jsonb_agg(document_id order by document_id),'[]'::jsonb)=${q(JSON.stringify(sources))}::jsonb from public.dms_document_links where id in (${links.join(',')}))`);
  for(const link of links)checks.push(`(select count(*)=1 from public.dms_document_events e join public.dms_document_links l on l.id::text=e.metadata_json->>'link_id' where l.id=${link} and e.document_id=l.document_id and e.performed_by=${run.actor} and e.event_type='party_document_link_created' and e.metadata_json->>'operation_id'=${q(op.operation)} and e.metadata_json->>'employee_id'=${q(result.employeeId)})`);
  const childTables={identity_document:'employee_identity_documents',medical_insurance:'employee_medical_insurances',training_certificate:'employee_training_certificates'};
  for(const child of result.childRecords){assert.ok(Object.hasOwn(childTables,child.kind));id(child.id);id(child.sourceDocumentId);assert.ok(sources.includes(child.sourceDocumentId));checks.push(`(select count(*)=1 from public.${childTables[child.kind]} where id=${child.id} and employee_id=${result.employeeId} and dms_document_id=${child.sourceDocumentId} and created_by=${run.actor} and deleted_at is not null)`);}
  for(const [kind,table] of Object.entries(childTables))checks.push(`(select count(*)=${result.childRecords.filter(child=>child.kind===kind).length} from public.${table} where employee_id=${result.employeeId})`);
  checks.push(`(select count(*)=1 from public.audit_logs where actor_user_profile_id=${run.actor} and entity_name='employees' and entity_id=${result.employeeId} and entity_reference=${q(result.employeeCode)} and action='document_to_employee.create' and new_values->>'operation_id'=${q(op.operation)} and new_values->'selected_document_ids'=${q(JSON.stringify(result.sourceDocumentIds))}::jsonb and (new_values->>'created_child_record_counts')::integer=${result.complianceRecordsCreated} and (new_values->>'documents_linked')::integer=${result.documentsLinked})`);
 }
 for(const session of run.sessions){assert.match(session.sessionId,uuid);assert.match(session.authUserId,uuid);checks.push(`not exists(select 1 from auth.sessions where id=${q(session.sessionId)})`);checks.push(`not exists(select 1 from auth.refresh_tokens where session_id=${q(session.sessionId)})`);}
 for(const holder of run.holders){assert.match(holder.name,/^FDE[A-Z0-9]+_LOCK_[a-f0-9]{10}$/);if(holder.pid!==null)id(holder.pid);checks.push(`not exists(select 1 from pg_stat_activity where application_name=${q(holder.name)}${holder.pid===null?'':' and pid='+holder.pid})`);}
 for(const fault of run.faults){assert.match(fault,/^f06_de_fault_[a-f0-9]{32}$/);checks.push(`not exists(select 1 from pg_trigger where tgname=${q(fault)})`);checks.push(`not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='erp_private' and p.proname=${q(fault)})`);}
 const indexed=checks.length?`values ${checks.map((check,index)=>`(${index},(${check})::boolean)`).join(',')}`:'select 0::integer,false::boolean where false';
 const observed=JSON.parse(sql(`begin read only;set local statement_timeout='20s';select coalesce(jsonb_agg(passed order by check_index),'[]'::jsonb) from (${indexed}) as observations(check_index,passed);rollback;`));
 assert.ok(Array.isArray(observed)&&observed.every(value=>typeof value==='boolean'));assert.equal(observed.length,checks.length);
 runs.push({marker:run.marker,checks:checks.length,passed:observed.filter(Boolean).length,failedIndexes:observed.flatMap((passed,index)=>passed?[]:[index]),
  historicalCleanupFailures:run.cleanupFailures,independentlyRepaired,
  failedOwnedResources:run.owned.filter((_,index)=>!observed[index]),
  failedBorrowedResources:run.borrowed.filter((_,index)=>!observed[run.owned.length+index])});
}
const report={at:new Date().toISOString(),diagnostic,success:runs.every(run=>run.failedIndexes.length===0&&(run.historicalCleanupFailures.length===0||run.independentlyRepaired)),runs,resources,repairs,productionWrites:0,limitation:'Exact manifest identities only. Does not establish absence of unlisted historical writes, replace concurrency/rollback acceptance, or restore any numbering counters. No storage/provider resources were created. Historical cleanup failures and exact separate repairs remain disclosed.'};
fs.writeFileSync(path.join(evidence,diagnostic?'DOCUMENT_EMPLOYEE_RESOURCE_DIAGNOSTIC_20261005.json':'DOCUMENT_EMPLOYEE_RESOURCE_CHECK_20261004.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({success:report.success,runs:runs.length,resources,historicalRepairs:repairs,newRepairs:0}));
assert.equal(report.success,true,'Exact HR document employee reconciliation failed; inspect private report');
