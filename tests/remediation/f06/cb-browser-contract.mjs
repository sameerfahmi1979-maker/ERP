// Pure, closed B03/B05 continuation contracts. No filesystem, runtime or client imports.
import assert from 'node:assert/strict';
import {id,uuid,quote,fixtureOwner as originalOwner,assignmentScope,validatePermissions,permissionsSql,roleCreateSql,stateSql,assertPreserved} from './scoped-browser-contract.mjs';
export {id,uuid,quote,assignmentScope,validatePermissions,permissionsSql,roleCreateSql,stateSql,assertPreserved};
const define=(marker,scope,permissions)=>Object.freeze({marker,scope,email:marker.toLowerCase()+'@example.invalid',roleCode:marker.toLowerCase(),fullName:'F06 synthetic browser '+marker,permissions:Object.freeze(permissions)});
const calendarPermissions=['common_md.work_calendars.view','common_md.work_calendars.manage'];
export const modes=Object.freeze({company:define('F06CB0518_COMPANY','company',[...calendarPermissions,'reports.view','reports.manage','organizations.view']),branch:define('F06CB0519_BRANCH','branch',calendarPermissions)});
export const cb=Object.freeze({marker:'F06CB0518_0519',calendarCode:'F06CB0518_FOREIGN',calendarName:'F06CB0518 foreign calendar',profileCode:'F06CB0518_PROFILE',profileName:'F06CB0518 asset-free profile',winnerName:'F06CB0518 winner profile',staleDraft:'F06CB0518 retained stale draft',registryCode:'F06CB0518_DENY',registryName:'F06CB0518 deny-only admission probe',denyPermission:'hr.employees.view',denyPermissionId:104});
export const commands=Object.freeze(['resources-prepare','company-prepare','observe-calendar-noop','observe-profile-created','observe-profile-winner','observe-profile-stale','observe-company-readonly','observe-profile-retired','company-retire','branch-prepare','observe-branch-denied','branch-retire','resources-retire']);
export const checks=Object.freeze(['company','final']);
export function modeFor(name){assert.ok(Object.hasOwn(modes,name),'UNKNOWN_CB_MODE');return modes[name];}
export function fixtureOwner(ledger){
  const owner={...originalOwner(ledger),companyBId:id(ledger.companyIds[1])};assert.notEqual(owner.companyId,owner.companyBId);
  assert.ok(ledger.rows.some(r=>r.table==='owner_companies'&&r.id===owner.companyBId));return owner;
}
export function assertPermissions(rows){validatePermissions(modes.company,rows);assert.deepEqual(rows.map(r=>r.id).sort((a,b)=>a-b),[31,32,66,67,91]);return rows;}
export function denyPermissionSql(){return `select coalesce(jsonb_agg(to_jsonb(p) order by id),'[]') from public.permissions p where permission_code=${quote(cb.denyPermission)} or id=${cb.denyPermissionId};`;}
export function assertDenyPermission(rows){assert.equal(rows.length,1);assert.equal(rows[0].id,104);assert.equal(rows[0].permission_code,cb.denyPermission);assert.equal(rows[0].is_active,true);}
const lit=value=>value===null?'null':String(id(value));
const list=values=>values.map(quote).join(',');
export function absenceSql(base){
  const authIds=Object.values(base.actors).map(a=>quote(uuid(a.authId))+'::uuid').join(',');
  return `select ((select count(*) from auth.users where id in (${authIds}) or lower(email) in (${list(Object.values(modes).map(m=>m.email))}) or raw_app_meta_data->>'f06_marker' in (${list(Object.values(modes).map(m=>m.marker))}))
    +(select count(*) from public.user_profiles where auth_user_id in (${authIds}) or notes in (${list(Object.values(modes).map(m=>m.marker))}) or full_name in (${list(Object.values(modes).map(m=>m.fullName))}))
    +(select count(*) from public.roles where role_code in (${list(Object.values(modes).map(m=>m.roleCode))}) or notes in (${list(Object.values(modes).map(m=>m.marker))}))
    +(select count(*) from public.work_calendars where calendar_code=${quote(cb.calendarCode)} or owner_company_id=${id(base.owner.companyBId)} and deleted_at is null)
    +(select count(*) from public.erp_report_branding_profiles where profile_code=${quote(cb.profileCode)})
    +(select count(*) from public.erp_report_registry where report_code=${quote(cb.registryCode)} or is_active and deleted_at is null))::text;`;
}
/** @param {{roles:Record<string,{roleId:number}>}|null} resources */
export function identitySql(base,resources=null){
  const authIds=Object.values(base.actors).map(a=>quote(uuid(a.authId))+'::uuid').join(',');
  const roleIds=resources?Object.values(resources.roles).map(r=>id(r.roleId)).join(','):'null';
  const roleFilter=resources?`id not in (${roleIds})`:'true';
  const pairFilter=resources?`role_id not in (${roleIds})`:'true';
  return `select json_build_object(
    'profiles',(select coalesce(jsonb_object_agg(id::text,md5(to_jsonb(p)::text)),'{}') from public.user_profiles p where auth_user_id is null or auth_user_id not in (${authIds})),
    'assignments',(select coalesce(jsonb_object_agg(id::text,md5(to_jsonb(a)::text)),'{}') from public.user_roles a where user_profile_id not in(select id from public.user_profiles where auth_user_id in (${authIds}))),
    'roles',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by id),'[]')::text) from public.roles r where ${roleFilter}),
    'permissions',(select md5(coalesce(jsonb_agg(to_jsonb(p) order by id),'[]')::text) from public.permissions p),
    'rolePermissions',(select md5(coalesce(jsonb_agg(to_jsonb(p) order by id),'[]')::text) from public.role_permissions p where ${pairFilter}),
    'authIdentities',(select coalesce(jsonb_object_agg(id::text,md5(jsonb_build_array(email,role,banned_until,deleted_at)::text)),'{}') from auth.users where id not in (${authIds})),
    'authProviderIdentities',(select coalesce(jsonb_object_agg(id::text,md5(jsonb_build_array(user_id,provider)::text)),'{}') from auth.identities where user_id not in (${authIds})),
    'sessions',(select coalesce(jsonb_object_agg(id::text,user_id::text),'{}') from auth.sessions where user_id not in (${authIds})),
    'refreshIdentities',(select coalesce(jsonb_object_agg(id::text,jsonb_build_array(user_id,session_id)),'{}') from auth.refresh_tokens where user_id not in (${Object.values(base.actors).map(a=>quote(a.authId)).join(',')})));`;
}
// Full business rows and history, not counts/hashes. No object bytes or Auth secrets.
export const snapshotTables=Object.freeze({companies:'public.owner_companies',branches:'public.branches',calendars:'public.work_calendars',shifts:'public.work_shifts',sites:'public.work_sites',shiftAssignments:'public.employee_shift_assignments',profiles:'public.erp_report_branding_profiles',assets:'public.erp_branding_assets',appBranding:'public.erp_app_branding_settings',templates:'public.erp_report_templates',registry:'public.erp_report_registry',runs:'public.erp_report_runs',deliveries:'public.erp_report_delivery_logs',schedules:'public.erp_report_schedules',savedFilters:'public.erp_report_saved_filters',columnProfiles:'public.erp_report_column_profiles',publicLinks:'public.erp_output_public_links',storageObjects:'storage.objects',versions:'erp_private.branding_version_history',receipts:'erp_private.master_lifecycle_receipts'});
export function snapshotSql(base){
  const entries=Object.entries(snapshotTables).map(([key,table])=>`${quote(key)},(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from ${table} t)`);
  entries.push(`'audits',(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from public.audit_logs t where entity_name in ('work_calendars','work_shifts','erp_report_branding_profiles','erp_app_branding_settings','erp_branding_assets','erp_report_registry') or actor_user_profile_id in (select id from public.user_profiles where auth_user_id in (${Object.values(base.actors).map(a=>quote(uuid(a.authId))+'::uuid').join(',')})))`);
  return `select json_build_object(${entries.join(',\n')});`;
}
export function registrySchemaSql(){return `select json_build_object('columns',(select jsonb_agg(jsonb_build_object('name',column_name,'type',udt_name,'nullable',is_nullable,'default',column_default,'identity',is_identity) order by ordinal_position) from information_schema.columns where table_schema='public' and table_name='erp_report_registry'),'constraints',(select jsonb_agg(jsonb_build_object('name',conname,'type',contype,'definition',pg_get_constraintdef(oid)) order by conname) from pg_constraint where conrelid='public.erp_report_registry'::regclass));`;}
export const registryValues=Object.freeze({report_code:cb.registryCode,report_name_en:cb.registryName,module_code:'HR',report_category:'audit',default_template_id:null,default_output_formats:['screen'],default_orientation:'portrait',branding_strategy:'none',branding_source_path:null,required_permissions:[cb.denyPermission],sensitive_profile:'normal',sensitive_field_rules_json:{},filter_schema_json:{},column_schema_json:{},supports_numbering:false,numbering_rule_code:null,supports_scheduling:false,is_letter_type:false,is_system:false,is_active:true,deleted_at:null,deleted_by:null,document_class:null,qr_policy_override:null,qr_validity_days_override:null,approval_required_override:null,allow_quick_print_override:null,public_disclosure_override:null,variable_allowlist:null});
export function assertRegistrySchema(schema){
  assert.ok(schema.columns.length>0);assert.ok(schema.constraints.some(c=>c.type==='u'&&c.definition==='UNIQUE (report_code)'));
  const expected={id:'int8',...Object.fromEntries(Object.keys(registryValues).map(k=>[k,'text'])),default_template_id:'int8',deleted_by:'int8',default_output_formats:'_text',required_permissions:'_text',sensitive_field_rules_json:'jsonb',filter_schema_json:'jsonb',column_schema_json:'jsonb',variable_allowlist:'jsonb',supports_numbering:'bool',supports_scheduling:'bool',is_letter_type:'bool',is_system:'bool',is_active:'bool',approval_required_override:'bool',allow_quick_print_override:'bool',deleted_at:'timestamptz',qr_validity_days_override:'int4'};
  for(const [name,type] of Object.entries(expected))assert.equal(schema.columns.find(c=>c.name===name)?.type,type,'REGISTRY_SCHEMA_CHANGED:'+name);
  for(const name of Object.keys(registryValues))assert.ok(schema.columns.some(c=>c.name===name),'REGISTRY_COLUMN_MISSING:'+name);
  for(const c of schema.columns)if(c.nullable==='NO'&&c.default===null&&c.identity!=='YES')assert.ok(Object.hasOwn(registryValues,c.name),'UNSUPPORTED_REQUIRED_REGISTRY_FIELD');
}
export function borrowedResources(ledger,base,snapshot){
  const owner=base.owner;
  assert.equal(snapshot.companies.find(c=>c.id===owner.companyBId)?.company_code,'F06_B');
  assert.equal(snapshot.companies.find(c=>c.id===owner.companyBId)?.legal_name_en,'F06 synthetic company B');
  assert.equal(snapshot.companies.find(c=>c.id===owner.companyBId)?.status,'active');
  const calendar=snapshot.calendars.filter(c=>c.calendar_code==='F06_BASE');assert.equal(calendar.length,1);const c=calendar[0];
  assert.equal(c.id,1);assert.equal(c.owner_company_id,owner.companyId);assert.equal(c.calendar_name,'F06 baseline calendar');assert.equal(c.calendar_type,'standard');assert.equal(c.is_active,true);assert.equal(c.deleted_at,null);assert.equal(c.workspace_revision,1);
  assert.ok(ledger.rows.some(r=>r.table==='work_calendars'&&r.id===c.id));assert.ok(ledger.intents.some(r=>r.table==='work_calendars'&&r.marker==='F06_BASELINE'&&r.operation==='create'));
  const shifts=snapshot.shifts.filter(s=>s.calendar_id===c.id);assert.equal(shifts.length,1);const shift=shifts[0];
  assert.ok(ledger.rows.some(r=>r.table==='work_shifts'&&r.id===shift.id));assert.ok(ledger.intents.some(r=>r.table==='work_shifts'&&r.marker==='F06_BASELINE'&&r.operation==='create'));
  assert.equal(shift.shift_code,'F06_BASE');assert.equal(shift.shift_name,'F06 baseline shift');assert.equal(shift.shift_start_time,'08:00:00');assert.equal(shift.shift_end_time,'17:00:00');assert.equal(shift.is_active,true);assert.equal(shift.deleted_at,null);
  const defaults=snapshot.profiles.filter(p=>p.owner_company_id===owner.companyId&&p.is_default_for_company&&p.deleted_at===null);assert.equal(defaults.length,1);id(defaults[0].id);assert.equal(defaults[0].is_active,true);
  return {calendar:c,shifts,defaultProfile:defaults[0]};
}
export function resourceCreateSql(base){return `do $g$ begin if exists(select 1 from public.work_calendars where calendar_code=${quote(cb.calendarCode)} or owner_company_id=${id(base.owner.companyBId)} and deleted_at is null)
  or exists(select 1 from public.erp_report_registry where report_code=${quote(cb.registryCode)} or is_active and deleted_at is null)
  or not exists(select 1 from public.permissions where id=104 and permission_code='hr.employees.view' and is_active)
  then raise exception 'CB_RESOURCE_PREREQUISITE_CHANGED';end if;end $g$;
  with c as(insert into public.work_calendars(calendar_code,calendar_name,calendar_type,owner_company_id,notes) values(${quote(cb.calendarCode)},${quote(cb.calendarName)},'standard',${base.owner.companyBId},${quote(cb.marker)}) returning id),
  r as(insert into public.erp_report_registry(${Object.keys(registryValues).join(',')}) select ${Object.keys(registryValues).map(k=>'v.'+k).join(',')} from jsonb_populate_record(null::public.erp_report_registry,${quote(JSON.stringify(registryValues))}::jsonb) v returning id)
  select json_build_object('foreignCalendarId',(select id from c),'registryId',(select id from r));`;}
const without=(row,keys)=>Object.fromEntries(Object.entries(row).filter(([k])=>!keys.includes(k)));
const equalRows=(a,b)=>assert.deepEqual([...a].sort((x,y)=>JSON.stringify(x).localeCompare(JSON.stringify(y))),[...b].sort((x,y)=>JSON.stringify(x).localeCompare(JSON.stringify(y))));
export function additions(before,after,key){
  const old=new Map(before.map(r=>[key(r),r]));assert.equal(old.size,before.length);const seen=new Set();
  for(const row of after){const k=key(row);assert.ok(!seen.has(k),'DUPLICATE_HISTORY_ID');seen.add(k);if(old.has(k))assert.deepEqual(row,old.get(k),'PRIOR_HISTORY_REWRITTEN');}
  for(const k of old.keys())assert.ok(seen.has(k),'PRIOR_HISTORY_REMOVED');return after.filter(r=>!old.has(key(r)));
}
const historyKey={receipts:r=>r.actor+':'+r.operation_id,versions:r=>r.entity+':'+r.record_id+':'+r.revision,audits:r=>r.id};
export function assertResourceCreation(before,after,base,resources){
  const c=after.calendars.find(r=>r.id===id(resources.foreignCalendarId)),r=after.registry.find(r=>r.id===id(resources.registryId));
  assert.ok(!before.calendars.some(row=>row.id===c?.id));assert.ok(!before.registry.some(row=>row.id===r?.id));
  assert.equal(c.calendar_code,cb.calendarCode);assert.equal(c.calendar_name,cb.calendarName);assert.equal(c.owner_company_id,base.owner.companyBId);assert.equal(c.notes,cb.marker);assert.equal(c.is_active,true);assert.equal(c.deleted_at,null);assert.equal(c.workspace_revision,1);
  for(const [k,v] of Object.entries(registryValues))assert.deepEqual(r[k],v,'REGISTRY_VALUE:'+k);
  const adjusted={...after,calendars:after.calendars.filter(x=>x.id!==c.id),registry:after.registry.filter(x=>x.id!==r.id)};assert.deepEqual(adjusted,before,'RESERVATION_SIDE_EFFECT');
}
export function assertProfile(row,base,actor,active=true){
  id(row.id);assert.equal(row.profile_code,cb.profileCode);assert.equal(row.profile_type,'company');assert.equal(row.owner_company_id,base.owner.companyId);
  assert.equal(row.created_by,actor.profileId);assert.equal(row.updated_by,actor.profileId);assert.equal(row.is_active,active);assert.equal(row.deleted_at,null);assert.equal(row.deleted_by,null);
  for(const key of ['is_default_for_company','is_group_profile','is_neutral_profile'])assert.equal(row[key],false);
  for(const key of ['logo_url','small_logo_url','stamp_url','signature_url','watermark_url','signatory_name','signatory_title_en','signatory_title_ar'])assert.ok(row[key]===null||row[key]==='','ASSET_OR_SIGNATORY_NOT_ALLOWED:'+key);
}
// Each stage is checked against its immediate predecessor AND every retained
// earlier history row. A failed/no-op stage never exempts metadata timestamps.
export function assertTransition(stage,before,after,base,resources,actor,earlier=[]){
  assert.ok(commands.includes(stage));const allowed=new Set();let row,changed=false,entity,action;
  for(const history of [before,...earlier])for(const key of Object.keys(historyKey))additions(history[key],after[key],historyKey[key]);
  const extra=Object.fromEntries(Object.entries(historyKey).map(([k,fn])=>[k,additions(before[k],after[k],fn)]));
  if(stage==='observe-calendar-noop'){
    row=after.calendars.find(r=>r.id===resources.borrowed.calendar.id);entity='work_calendars';allowed.add('receipts');assert.equal(extra.receipts.length,1);
  }else if(['observe-profile-created','observe-profile-winner','observe-profile-retired'].includes(stage)){
    const matches=after.profiles.filter(p=>p.profile_code===cb.profileCode);assert.equal(matches.length,1);row=matches[0];assertProfile(row,base,actor,stage!=='observe-profile-retired');entity='erp_report_branding_profiles';changed=true;action=stage==='observe-profile-created'?'create':'update';
    const old=before.profiles.find(p=>p.id===row.id);if(stage==='observe-profile-created'){
      assert.equal(old,undefined);assert.equal(row.workspace_revision,1);assert.equal(row.profile_name,cb.profileName);equalRows(before.profiles,after.profiles.filter(p=>p.id!==row.id));
    }else{
      assert.ok(old);assert.equal(row.workspace_revision,old.workspace_revision+1);assert.equal(row.profile_name,cb.winnerName);
      const keys=['updated_at','workspace_revision',stage==='observe-profile-winner'?'profile_name':'is_active'];assert.deepEqual(without(row,keys),without(old,keys));
      assert.notEqual(row.updated_at,old.updated_at);equalRows(before.profiles.filter(p=>p.id!==row.id),after.profiles.filter(p=>p.id!==row.id));
    }
    for(const k of ['profiles','receipts','audits','versions'])allowed.add(k);
    assert.equal(extra.receipts.length,1);assert.equal(extra.audits.length,1);assert.equal(extra.versions.length,1);
    const version=extra.versions[0];assert.equal(version.entity,entity);assert.equal(version.record_id,row.id);assert.equal(version.revision,row.workspace_revision);assert.equal(version.baseline,false);assert.deepEqual(version.snapshot,row);
    const audit=extra.audits[0];assert.equal(audit.actor_user_profile_id,actor.profileId);assert.equal(audit.owner_company_id,base.owner.companyId);assert.equal(audit.entity_name,entity);assert.equal(audit.entity_id,row.id);assert.equal(audit.entity_reference,cb.profileCode);assert.equal(audit.action,action);assert.equal(audit.new_values.operation_id,extra.receipts[0].operation_id);assert.equal(String(audit.new_values.revision),String(row.workspace_revision));
  }
  if(entity){const receipt=extra.receipts[0];assert.equal(receipt.actor,base.actors.company.authId);uuid(receipt.operation_id);assert.match(receipt.request_hash,/^[a-f0-9]{64}$/);assert.equal(receipt.entity,entity);assert.equal(receipt.record_id,row.id);assert.equal(receipt.result.id,row.id);assert.equal(String(receipt.result.revision),String(row.workspace_revision));assert.equal(receipt.result.changed,changed);assert.equal(receipt.result.replayed,false);assert.equal(receipt.result.owner_company_id,base.owner.companyId);}
  assert.deepEqual(Object.keys(after).sort(),Object.keys(before).sort());for(const k of Object.keys(before))if(!allowed.has(k))assert.deepEqual(after[k],before[k],'UNEXPECTED_STAGE_CHANGE:'+k);
  return row?.id??null;
}
export function assertRetiredResources(before,after,resources){
  const oldC=before.calendars.find(r=>r.id===resources.foreignCalendarId),c=after.calendars.find(r=>r.id===resources.foreignCalendarId);
  const oldR=before.registry.find(r=>r.id===resources.registryId),r=after.registry.find(r=>r.id===resources.registryId);
  assert.equal(c.is_active,false);assert.equal(c.workspace_revision,oldC.workspace_revision+1);assert.deepEqual(without(c,['is_active','updated_at','workspace_revision']),without(oldC,['is_active','updated_at','workspace_revision']));
  assert.equal(r.is_active,false);assert.deepEqual(without(r,['is_active','updated_at']),without(oldR,['is_active','updated_at']));
  assert.deepEqual({...after,calendars:before.calendars,registry:before.registry},before);equalRows(after.calendars.filter(x=>x.id!==c.id),before.calendars.filter(x=>x.id!==c.id));equalRows(after.registry.filter(x=>x.id!==r.id),before.registry.filter(x=>x.id!==r.id));
}
export function resourceRetireSql(resources,before){
  const c=before.calendars.find(r=>r.id===id(resources.foreignCalendarId)),r=before.registry.find(r=>r.id===id(resources.registryId));assert.equal(c.calendar_code,cb.calendarCode);assert.equal(r.report_code,cb.registryCode);
  return `do $g$ begin
    perform 1 from public.work_calendars where id=${c.id} for update;
    perform 1 from public.erp_report_registry where id=${r.id} for update;
    if not exists(select 1 from public.work_calendars t where id=${c.id} and to_jsonb(t)=${quote(JSON.stringify(c))}::jsonb)
    or not exists(select 1 from public.erp_report_registry t where id=${r.id} and to_jsonb(t)=${quote(JSON.stringify(r))}::jsonb)
    or exists(select 1 from public.work_shifts where calendar_id=${c.id}) or exists(select 1 from public.branches where default_work_calendar_id=${c.id})
    or exists(select 1 from public.work_sites where work_calendar_id=${c.id}) or exists(select 1 from public.employee_shift_assignments where work_calendar_id=${c.id})
    or exists(select 1 from public.erp_report_runs where report_id=${r.id} or report_code=${quote(cb.registryCode)})
    or exists(select 1 from public.erp_report_schedules where report_id=${r.id}) or exists(select 1 from public.erp_report_saved_filters where report_id=${r.id}) or exists(select 1 from public.erp_report_column_profiles where report_id=${r.id})
    then raise exception 'CB_RESOURCE_IDENTITY_OR_DEPENDENCY_CHANGED';end if;end $g$;
    update public.work_calendars set is_active=false where id=${c.id} and calendar_code=${quote(cb.calendarCode)};
    update public.erp_report_registry set is_active=false where id=${r.id} and report_code=${quote(cb.registryCode)};
    select 'RETIRED_EXACT_CB_RESOURCES';`;
}
export function assertRole(state,reservation,active=true){const mode=modeFor(reservation.mode);assert.equal(state.role.id,reservation.roleId);assert.equal(state.role.role_code,mode.roleCode);assert.equal(state.role.role_name,mode.fullName);assert.equal(state.role.notes,mode.marker);assert.equal(state.role.is_system_role,false);assert.equal(state.role.is_assignable,false);assert.equal(state.role.is_active,active);assert.deepEqual(state.pairs.map(p=>({id:p.id,role_id:p.role_id,permission_id:p.permission_id})),reservation.pairs);}
export function assertActor(state,reservation,prepared,inactive=false){
  const mode=modeFor(reservation.mode),scope=assignmentScope(mode,reservation.owner);assert.equal(state.auth.id,reservation.authId);assert.equal(state.auth.email,mode.email);assert.equal(state.auth.marker,mode.marker);assert.equal(state.auth.role,'authenticated');assert.equal(state.auth.confirmed,true);assert.equal(Boolean(state.auth.banned),inactive);
  assert.equal(state.profiles.length,1);assert.equal(state.assignments.length,1);const p=state.profiles[0],a=state.assignments[0];
  assert.equal(p.id,prepared.profileId);assert.equal(p.auth_user_id,reservation.authId);assert.equal(p.full_name,mode.fullName);assert.equal(p.display_name,mode.fullName);assert.equal(p.notes,mode.marker);assert.equal(p.owner_company_id,reservation.owner.companyId);assert.equal(p.branch_id,scope.branchId);assert.equal(p.status,inactive?'inactive':'active');assert.equal(p.must_change_password,false);
  assert.equal(a.id,prepared.assignmentId);assert.equal(a.user_profile_id,p.id);assert.equal(a.role_id,reservation.roleId);assert.equal(a.owner_company_id,scope.companyId);assert.equal(a.branch_id,scope.branchId);assert.equal(a.is_active,!inactive);if(inactive){assert.deepEqual(state.sessions,[]);assert.deepEqual(state.refreshIds,[]);}
}
export function assertActorRetirement(before,after){
  for(const [key,ignored] of [['role',['is_active','updated_at']],['profiles',['status','updated_at']],['assignments',['is_active','updated_at']]]){
    if(key==='role')assert.deepEqual(without(after[key],ignored),without(before[key],ignored),'OWNED_ROLE_METADATA_CHANGED');
    else {assert.equal(after[key].length,before[key].length);for(let i=0;i<before[key].length;i++)assert.deepEqual(without(after[key][i],ignored),without(before[key][i],ignored),'OWNED_ACTOR_METADATA_CHANGED');}
  }
  assert.deepEqual(after.pairs,before.pairs);assert.deepEqual(without(after.auth,['banned']),without(before.auth,['banned']));
}
export function actorPrepareSql(r,profileId){const mode=modeFor(r.mode),scope=assignmentScope(mode,r.owner);id(profileId);uuid(r.authId);id(r.roleId);
  return `do $g$ begin if (select count(*) from public.user_profiles where id=${profileId} and auth_user_id=${quote(r.authId)}::uuid and full_name=${quote(mode.fullName)})<>1 or exists(select 1 from public.user_roles where user_profile_id=${profileId} or role_id=${r.roleId}) then raise exception 'CB_ACTOR_CHANGED';end if;end $g$;
    update public.user_profiles set full_name=${quote(mode.fullName)},display_name=${quote(mode.fullName)},notes=${quote(mode.marker)},status='active',must_change_password=false,owner_company_id=${id(r.owner.companyId)},branch_id=${lit(scope.branchId)} where id=${profileId} and auth_user_id=${quote(r.authId)}::uuid;
    with a as(insert into public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active) values(${profileId},${r.roleId},${lit(scope.companyId)},${lit(scope.branchId)},true) returning id) select json_build_object('profileId',${profileId},'assignmentId',(select id from a));`;
}
export function actorRetireSql(r,prepared,state){
  const mode=modeFor(r.mode);assertActor({...state,auth:{...state.auth,banned:false}},r,prepared);assert.equal(state.auth.banned,true);assertRole(state,r);
  const sessions=state.sessions.map(s=>{assert.equal(s.userId,r.authId);assert.match(s.id,/^[a-f0-9-]{36}$/i);return quote(s.id);}),refresh=state.refreshIds.map(s=>{assert.match(s,/^[0-9]+$/);return quote(s);});
  return `do $g$ begin
    perform 1 from public.user_profiles where id=${id(prepared.profileId)} for update;
    perform 1 from public.user_roles where id=${id(prepared.assignmentId)} for update;
    perform 1 from public.roles where id=${id(r.roleId)} for update;
    if not exists(select 1 from public.user_profiles p where id=${prepared.profileId} and auth_user_id=${quote(r.authId)}::uuid and to_jsonb(p)=${quote(JSON.stringify(state.profiles[0]))}::jsonb)
    or not exists(select 1 from public.user_roles a where id=${id(prepared.assignmentId)} and to_jsonb(a)=${quote(JSON.stringify(state.assignments[0]))}::jsonb)
    or not exists(select 1 from public.roles t where id=${id(r.roleId)} and to_jsonb(t)=${quote(JSON.stringify(state.role))}::jsonb)
    or not exists(select 1 from auth.users where id=${quote(r.authId)}::uuid and raw_app_meta_data->>'f06_marker'=${quote(mode.marker)} and banned_until>now()) then raise exception 'CB_RETIRE_IDENTITY_CHANGED';end if;end $g$;
    update public.user_roles set is_active=false where id=${prepared.assignmentId};update public.user_profiles set status='inactive' where id=${prepared.profileId};update public.roles set is_active=false where id=${r.roleId};
    with rt as(delete from auth.refresh_tokens where user_id=${quote(r.authId)} and id in (${refresh.join(',')||'null'}) returning id),ss as(delete from auth.sessions where user_id=${quote(r.authId)}::uuid and id in (${sessions.join(',')||'null'}) and (select count(*) from rt)>=0 returning id)
    select json_build_object('refreshIds',(select coalesce(jsonb_agg(id::text order by id),'[]') from rt),'sessionIds',(select coalesce(jsonb_agg(id::text order by id),'[]') from ss));`;
}
