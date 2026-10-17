// Pure bounded contracts only. No filesystem, runtime, application or provider I/O.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {id,uuid,quote} from './scoped-browser-contract.mjs';
export {id,uuid,quote,fixtureOwner,ownerSql,permissionsSql,validatePermissions,roleCreateSql} from './scoped-browser-contract.mjs';
export const sha=v=>createHash('sha256').update(v).digest('hex');
export const json=v=>quote(JSON.stringify(v))+'::jsonb';
const marker='F06B04B09_20261005';
const role=(suffix,permissions)=>Object.freeze({marker:marker+'_'+suffix,roleCode:(marker+'_'+suffix).toLowerCase(),fullName:marker+' '+suffix,permissions:Object.freeze(permissions)});
export const boundary=Object.freeze({marker,email:'f06-b04b09-20261005@example.invalid',fullName:'F06 synthetic browser '+marker,
 buildId:'PgzqC0QPAHMyF0vlSOEGS',origin:'http://127.0.0.1:16609',
 roles:Object.freeze({reader:role('READER',['settings.email.view','settings.ai.view','reports.view','organizations.view']),tester:role('TESTER',['settings.email.test'])}),
 evidencePath:'C:/dev/agt-erp/CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F06/TEMPLATE_GOVERNANCE_BROWSER_RESOURCE_20261003.json',
 evidenceSha256:'4c777fc8d7debaf0ff470fc7ec84b581011c7db5e9f21d193fe331a80b9c8380'});
export const permissions=Object.freeze(Object.values(boundary.roles).flatMap(r=>r.permissions).sort());
export const commands=Object.freeze(['resources-prepare','actor-prepare','observe-flags','observe-history-failed','observe-history-recovered','health-authorize','health-intent','observe-health-failed','health-retire','actor-retire','resources-retire']);
export const applicationSources=Object.freeze([
 'src/app/(protected)/admin/settings/email/page.tsx','src/features/settings/email/email-settings-page-client.tsx','src/features/settings/email/email-feature-flags-panel.tsx',
 'src/features/settings/email/email-provider-config-list.tsx','src/server/actions/settings/email-settings.ts','src/server/provider-health.ts','src/lib/settings/provider-configuration.ts',
 'src/app/(protected)/admin/reports/templates/page.tsx','src/features/report-center/template-governance-actions.tsx','src/server/actions/reports/template-governance.ts','src/server/report-template-authority.ts',
 'supabase/migrations/20261003053109_f06_provider_atomic_saves.sql','supabase/migrations/20261003054646_f06_provider_health_receipts.sql',
]);
export const nullConfiguration=Object.freeze(['tenant_id','client_id','authority_url','graph_base_url','sender_email','sender_display_name','reply_to_email','default_recipient_for_tests','throttle_per_minute','daily_send_limit','config_json']);
// Main's canonical create must use exactly this public, non-secret payload.
export const providerPayload=Object.freeze({provider_code:marker+'_EMAIL',provider_name:'F06 B04 B09 synthetic unsupported email',provider_type:'local_dev',is_active:true,is_enabled:false,is_default:false,
 auth_mode:'client_credentials',send_mode:'graph_send_mail',notes:marker,...Object.fromEntries(nullConfiguration.map(k=>[k,null]))});
export const healthMessage='Connection check failed. Review supported provider, endpoint and credential settings; external error details are withheld.';
export const stable=(row,except=[])=>Object.fromEntries(Object.entries(row).filter(([key])=>!except.includes(key)));
export function sameExcept(before,after,except=[]){assert.deepEqual(stable(after,except),stable(before,except),'UNEXPECTED_ROW_CHANGE');}
export function timestamp(value){assert.equal(typeof value,'string');assert.match(value,/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/);assert.ok(Number.isFinite(Date.parse(value)));return value;}
export function assertBuiltManifest(m,hashes,build){assert.deepEqual(Object.keys(m).sort(),['buildId','origin','sourceHashes']);assert.equal(m.buildId,boundary.buildId);assert.equal(build,boundary.buildId);assert.equal(m.origin,boundary.origin);assert.deepEqual(Object.keys(m.sourceHashes).sort(),[...applicationSources].sort());assert.deepEqual(m.sourceHashes,hashes);for(const v of Object.values(hashes))assert.match(v,/^[a-f0-9]{64}$/);}
export const borrowedSql=`select jsonb_build_object(
 'templates',(select jsonb_agg(to_jsonb(t) order by id) from public.erp_report_templates t where id in(150,151)),
 'events',(select jsonb_agg(to_jsonb(e) order by id) from public.erp_report_template_events e where template_id in(150,151)),
 'audits',(select jsonb_agg(to_jsonb(a) order by id) from public.audit_logs a where entity_name='erp_report_templates' and entity_id in(150,151)),
 'snapshots',(select jsonb_agg(to_jsonb(h) order by to_jsonb(h)::text) from erp_private.template_configuration_history h where template_id in(150,151)),
 'notifications',(select coalesce(jsonb_agg(to_jsonb(n) order by id),'[]') from public.erp_notifications n where source_module='REPORTS' and source_entity_type='erp_report_templates' and source_entity_id in(150,151)));`;
export function assertBorrowed(v){
 assert.equal(v.templates?.length,2);for(const [i,t] of v.templates.entries()){
  assert.equal(t.id,150+i);assert.equal(t.template_code,i?'F06_BROWSER_GOVERNANCE_1003_V2':'F06_BROWSER_GOVERNANCE_1003');assert.equal(t.parent_template_id,i?150:null);
  for(const [k,value] of Object.entries({is_active:false,is_default:false,show_stamp:false,show_signatory:false,governance_status:'archived',deleted_at:null,workspace_revision:5}))assert.equal(t[k],value);
  for(const kind of ['events','audits','snapshots'])assert.equal(v[kind].filter(r=>(kind==='audits'?r.entity_id:r.template_id)===t.id).length,5);
 }
 assert.equal(v.events.length,10);assert.equal(v.audits.length,10);assert.equal(v.snapshots.length,10);assert.equal(new Set(v.events.map(e=>id(e.id))).size,10);assert.equal(new Set(v.audits.map(e=>id(e.id))).size,10);
 for(const e of v.events)timestamp(e.occurred_at);assert.equal(v.notifications.length,2);assert.deepEqual(v.notifications.map(n=>[n.id,n.source_entity_id,n.notification_code,n.channel_email]),[[1,150,'TEMPLATE_REVIEW_150_2',false],[2,151,'TEMPLATE_REVIEW_151_2',false]]);
}
// Required main preflight JSON: exactly {marker,ledgerSha256,buildId,borrowed,
// providerId,createOperationId,provider}. provider is the exact providerSql result.
// No passwords, keys, JWTs, arbitrary SQL or supplied permission claims are accepted.
export function assertPreflight(p){assert.deepEqual(Object.keys(p).sort(),['borrowed','buildId','createOperationId','ledgerSha256','marker','provider','providerId']);assert.equal(p.marker,marker);assert.equal(p.buildId,boundary.buildId);assert.match(p.ledgerSha256,/^[a-f0-9]{64}$/);id(p.providerId);uuid(p.createOperationId);assertBorrowed(p.borrowed);}
export function providerSql(base){const target=id(base.providerId);return `select jsonb_build_object('row',(select to_jsonb(p) from public.erp_email_provider_configs p where id=${target}),
 'logs',(select coalesce(jsonb_agg(to_jsonb(l) order by id),'[]') from public.erp_email_send_logs l where provider_config_id=${target}),
 'audits',(select coalesce(jsonb_agg(to_jsonb(a) order by id),'[]') from public.audit_logs a where entity_name='erp_email_provider_configs' and entity_id=${target}),
 'receipts',(select coalesce(jsonb_agg(to_jsonb(r) order by operation_id),'[]') from erp_private.master_lifecycle_receipts r where entity='erp_email_provider_configs' and record_id=${target}),
 'createHash',md5(jsonb_build_array('provider','email','save',null,null,${json(providerPayload)})::text),
 'archiveHash',md5(jsonb_build_array('provider','email','archive',${target},2,'{}'::jsonb)::text));`;}
export function assertProvider(snapshot,base,owner,stage='initial',health=null,archive=null){
 const row=snapshot.row;assert.equal(row?.id,base.providerId);const retired=stage==='archived',tested=stage!=='initial';
 for(const [k,v] of Object.entries(providerPayload))assert.deepEqual(row[k],retired&&k==='is_active'?false:v,'PROVIDER_FIELD:'+k);
 assert.equal(row.secret_ref,null);assert.equal(row.masked_secret_preview,null);assert.equal(row.created_by,owner.adminProfileId);timestamp(row.created_at);timestamp(row.updated_at);assert.equal(row.workspace_revision,retired?3:tested?2:1);
 assert.equal(row.deleted_at!==null,retired);if(retired)timestamp(row.deleted_at);
 assert.equal(row.updated_by,tested&&!retired?id(health.profileId):owner.adminProfileId);
 assert.equal(row.last_test_status,tested?'failed':null);assert.equal(row.last_test_message,tested?healthMessage:null);if(tested)timestamp(row.last_test_at);else assert.equal(row.last_test_at,null);
 assert.equal(snapshot.receipts.length,retired?2:1);const create=snapshot.receipts.find(r=>r.operation_id===base.createOperationId);assert.ok(create);assert.equal(create.actor,owner.adminAuthId);assert.equal(create.entity,'erp_email_provider_configs');assert.equal(create.record_id,row.id);assert.equal(create.request_hash,snapshot.createHash);assert.deepEqual(create.result,{id:row.id,revision:'1',changed:true,replayed:false});
 const audits=snapshot.audits;assert.equal(audits.length,retired?3:tested?2:1);assert.equal(new Set(audits.map(a=>id(a.id))).size,audits.length);
 const created=audits.find(a=>a.action==='create');assert.ok(created);assert.equal(created.actor_user_profile_id,owner.adminProfileId);assert.equal(created.new_values.operation_id,base.createOperationId);assert.equal(created.new_values.revision,'1');assert.equal(created.old_values,null);
 for(const a of audits){assert.equal(a.entity_name,'erp_email_provider_configs');assert.equal(a.entity_id,row.id);assert.equal(a.entity_reference,providerPayload.provider_code);assert.equal(a.module_code,'SETTINGS');timestamp(a.created_at);}
 assert.equal(snapshot.logs.length,tested?1:0);
 if(tested){
  const failed=audits.find(a=>a.action==='test_failed');assert.ok(failed);assert.equal(failed.actor_user_profile_id,health.profileId);assert.equal(failed.old_values,null);assert.deepEqual(failed.new_values,{ok:false,revision:'2',delivery_verified:false});
  const log=snapshot.logs[0];id(log.id);assert.equal(log.provider_config_id,row.id);assert.equal(log.created_by,health.profileId);assert.equal(log.feature_area,'settings_test');assert.equal(log.operation_type,'test_connection');assert.equal(log.status,'skipped');assert.equal(log.duration_ms,null);assert.equal(log.last_error,healthMessage);assert.deepEqual(log.metadata_json,{connection_ok:false,email_sent:false});
  for(const k of ['from_email','subject','message_preview','external_message_id','to_emails','cc_emails','bcc_emails'])assert.equal(log[k],null);assert.equal(log.attempt_count,0);timestamp(log.created_at);
  for(const value of [row.last_test_at,failed.created_at,log.created_at])assert.ok(Date.parse(value)>=Date.parse(health.intentAt)&&Date.parse(value)<=Date.parse(health.observedAt),'HEALTH_OUTSIDE_INTENT_WINDOW');
 }
 if(retired){assertArchiveProof(archive,base);const receipt=snapshot.receipts.find(r=>r.operation_id===archive.operationId);assert.ok(receipt);assert.equal(receipt.actor,owner.adminAuthId);assert.equal(receipt.entity,'erp_email_provider_configs');assert.equal(receipt.record_id,row.id);assert.equal(receipt.request_hash,snapshot.archiveHash);assert.deepEqual(receipt.result,{id:row.id,revision:'3',changed:true,replayed:false});
  const audit=audits.find(a=>a.action==='archive');assert.ok(audit);assert.equal(audit.actor_user_profile_id,owner.adminProfileId);assert.equal(audit.new_values.operation_id,archive.operationId);assert.equal(audit.new_values.revision,'3');assert.deepEqual(audit.old_values,{revision:'2'});
 }
}
// Main writes only after canonical archive and after the browser actor is retired.
export function assertArchiveProof(v,base){assert.deepEqual(Object.keys(v).sort(),['createOperationId','marker','nonce','operationId','providerId']);assert.equal(v.marker,marker);assert.equal(v.nonce,base.nonce);assert.equal(v.providerId,base.providerId);assert.equal(v.createOperationId,base.createOperationId);uuid(v.operationId);assert.notEqual(v.operationId,base.createOperationId);}
export function appendOnly(before,after){for(const key of ['audits','receipts','logs']){const identity=r=>key==='receipts'?uuid(r.actor)+':'+uuid(r.operation_id):String(id(r.id));const next=new Map(after[key].map(r=>[identity(r),r]));assert.equal(next.size,after[key].length);assert.equal(new Set(before[key].map(identity)).size,before[key].length);for(const row of before[key])assert.deepEqual(next.get(identity(row)),row,'PRIOR_HISTORY_CHANGED:'+key);}}
export const roleIds=r=>Object.values(r.roles).map(v=>id(v.roleId)).sort((a,b)=>a-b);
export function actorSql(base,r){const auth=quote(uuid(base.authId)),roles=roleIds(r);return `select jsonb_build_object(
 'roles',(select jsonb_agg(to_jsonb(r) order by id) from public.roles r where id in(${roles})),
 'pairs',(select jsonb_agg(to_jsonb(p) order by role_id,permission_id) from public.role_permissions p where role_id in(${roles})),
 'auth',(select jsonb_build_object('id',id,'email',email,'role',role,'marker',raw_app_meta_data->>'f06_marker','confirmed',email_confirmed_at is not null,'banned',coalesce(banned_until>now(),false)) from auth.users where id=${auth}::uuid),
 'profiles',(select coalesce(jsonb_agg(to_jsonb(p) order by id),'[]') from public.user_profiles p where auth_user_id=${auth}::uuid),
 'assignments',(select coalesce(jsonb_agg(to_jsonb(a) order by id),'[]') from public.user_roles a where role_id in(${roles}) or user_profile_id in(select id from public.user_profiles where auth_user_id=${auth}::uuid)),
 'sessions',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'userId',user_id) order by id),'[]') from auth.sessions where user_id=${auth}::uuid),
 'refreshIds',(select coalesce(jsonb_agg(id::text order by id),'[]') from auth.refresh_tokens where user_id=${auth}));`;}
export function assertRoles(s,r,{tested=false,retired=false}={}){assert.equal(s.roles.length,2);assert.equal(s.pairs.length,5);for(const [key,mode] of Object.entries(boundary.roles)){const row=s.roles.find(x=>x.id===r.roles[key].roleId);assert.ok(row);for(const [k,v] of Object.entries({role_code:mode.roleCode,role_name:mode.fullName,notes:mode.marker,is_system_role:false,is_assignable:false,is_active:!retired&&!(key==='tester'&&tested)}))assert.equal(row[k],v);assert.deepEqual(s.pairs.filter(p=>p.role_id===row.id).map(p=>({id:p.id,role_id:p.role_id,permission_id:p.permission_id})),r.roles[key].pairs);}}
export function assertActor(s,base,r,prepared,{tester=null,retired=false}={}){
 assert.deepEqual(s.auth,{id:base.authId,email:boundary.email,role:'authenticated',marker,confirmed:true,banned:retired});assert.equal(s.profiles.length,1);const p=s.profiles[0];assert.equal(p.id,id(prepared.profileId));for(const [k,v] of Object.entries({auth_user_id:base.authId,notes:marker,full_name:boundary.fullName,display_name:boundary.fullName,status:retired?'inactive':'active',must_change_password:false,owner_company_id:base.owner.companyId,branch_id:null}))assert.equal(p[k],v);
 const expected=[{id:prepared.assignmentId,role:r.roles.reader.roleId,active:!retired},...(tester?[{id:tester.assignmentId,role:r.roles.tester.roleId,active:tester.active&&!retired}]:[])];assert.equal(s.assignments.length,expected.length);
 for(const e of expected){const a=s.assignments.find(a=>a.id===id(e.id));assert.ok(a);for(const [k,v] of Object.entries({user_profile_id:p.id,role_id:e.role,owner_company_id:null,branch_id:null,is_active:e.active}))assert.equal(a[k],v);}
 for(const session of s.sessions){uuid(session.id);assert.equal(session.userId,base.authId);}for(const token of s.refreshIds)assert.match(token,/^[1-9]\d*$/);if(retired){assert.deepEqual(s.sessions,[]);assert.deepEqual(s.refreshIds,[]);}
}
export function absenceSql(base){return `select ((select count(*) from auth.users where id=${quote(uuid(base.authId))}::uuid or lower(email)=${quote(boundary.email)} or raw_app_meta_data->>'f06_marker'=${quote(marker)})+(select count(*) from public.user_profiles where full_name=${quote(boundary.fullName)} or notes=${quote(marker)})+(select count(*) from public.roles where role_code in(${Object.values(boundary.roles).map(r=>quote(r.roleCode))}) or notes in(${Object.values(boundary.roles).map(r=>quote(r.marker))})))::text;`;}
export function actorPrepareSql(base,r,p){id(p);return `do $g$ begin if (select count(*) from public.user_profiles where id=${p} and auth_user_id=${quote(base.authId)}::uuid and full_name=${quote(boundary.fullName)})<>1 or exists(select 1 from public.user_roles where user_profile_id=${p} or role_id in(${roleIds(r)})) then raise exception 'ACTOR_PREIMAGE_CHANGED';end if;end $g$;
 update public.user_profiles set full_name=${quote(boundary.fullName)},display_name=${quote(boundary.fullName)},notes=${quote(marker)},status='active',must_change_password=false,owner_company_id=${id(base.owner.companyId)},branch_id=null where id=${p} and auth_user_id=${quote(base.authId)}::uuid;
 insert into public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active) values(${p},${id(r.roles.reader.roleId)},null,null,true) returning id;`;}
export function retireSql(base,r,p,tester,state){const sid=state.sessions.map(s=>quote(uuid(s.id))),tokens=state.refreshIds.map(v=>{assert.match(v,/^[1-9]\d*$/);return quote(v);});return `update public.user_roles set is_active=false where id in(${id(p.assignmentId)},${id(tester.assignmentId)}) and user_profile_id=${id(p.profileId)} and role_id in(${roleIds(r)});
 update public.user_profiles set status='inactive' where id=${p.profileId} and auth_user_id=${quote(base.authId)}::uuid and notes=${quote(marker)};
 update public.roles set is_active=false where id in(${roleIds(r)}) and notes in(${Object.values(boundary.roles).map(v=>quote(v.marker))});
 with t as(delete from auth.refresh_tokens where user_id=${quote(base.authId)} and id in(${tokens.join(',')||'null'}) returning id),s as(delete from auth.sessions where user_id=${quote(base.authId)}::uuid and id in(${sid.join(',')||'null'}) and (select count(*) from t)>=0 returning id)
 select jsonb_build_object('sessions',(select coalesce(jsonb_agg(id::text order by id),'[]') from s),'refreshIds',(select coalesce(jsonb_agg(id::text order by id),'[]') from t));`;}
export function identitySql(base,r=null){const auth=quote(uuid(base.authId));return `select jsonb_build_object(
 'profiles',(select md5(coalesce(jsonb_agg(to_jsonb(p) order by id),'[]')::text) from public.user_profiles p where auth_user_id is distinct from ${auth}::uuid),
 'assignments',(select md5(coalesce(jsonb_agg(to_jsonb(p) order by id),'[]')::text) from public.user_roles p where user_profile_id not in(select id from public.user_profiles where auth_user_id=${auth}::uuid)),
 'roles',(select md5(coalesce(jsonb_agg(to_jsonb(p) order by id),'[]')::text) from public.roles p where ${r?`id not in(${roleIds(r)})`:'true'}),
 'pairs',(select md5(coalesce(jsonb_agg(to_jsonb(p) order by id),'[]')::text) from public.role_permissions p where ${r?`role_id not in(${roleIds(r)})`:'true'}),
 'users',(select coalesce(jsonb_object_agg(id::text,md5(jsonb_build_array(email,role,banned_until,deleted_at)::text)),'{}') from auth.users where id<>${auth}::uuid),
 'identities',(select coalesce(jsonb_object_agg(id::text,md5(jsonb_build_array(user_id,provider)::text)),'{}') from auth.identities where user_id<>${auth}::uuid),
 'sessions',(select coalesce(jsonb_object_agg(id::text,user_id::text),'{}') from auth.sessions where user_id<>${auth}::uuid),
 'refresh',(select coalesce(jsonb_object_agg(id::text,jsonb_build_array(user_id,session_id)),'{}') from auth.refresh_tokens where user_id<>${auth}));`;}
export const inventorySql="select jsonb_agg(table_name order by table_name) from information_schema.tables where table_schema='public' and table_type='BASE TABLE' and table_name not in('user_profiles','user_roles','roles','role_permissions');";
export function preservationSql(tables,base,snapshot){const baseline=base.provider;const addedAudits=snapshot.audits.filter(a=>!baseline.audits.some(b=>b.id===a.id)).map(a=>id(a.id)),addedReceipts=snapshot.receipts.filter(a=>!baseline.receipts.some(b=>b.actor===a.actor&&b.operation_id===a.operation_id));const excludes={erp_email_provider_configs:[id(base.providerId)],erp_email_send_logs:snapshot.logs.map(l=>id(l.id)),audit_logs:addedAudits};
 const parts=tables.map(table=>{assert.match(table,/^[a-z_][a-z0-9_]*$/);const ids=excludes[table]??[];return `select ${quote(table)} name,md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]')::text) hash from public.${table} t${ids.length?` where id not in(${ids})`:''}`;});
 parts.push(`select 'erp_private.master_lifecycle_receipts',md5(coalesce(jsonb_agg(to_jsonb(t) order by actor,operation_id),'[]')::text) from erp_private.master_lifecycle_receipts t${addedReceipts.length?' where not('+addedReceipts.map(r=>`(actor=${quote(uuid(r.actor))}::uuid and operation_id=${quote(uuid(r.operation_id))}::uuid)`).join(' or ')+')':''}`);
 // Historical template snapshots are not in the public inventory.
 parts.push("select 'erp_private.template_configuration_history',md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]')::text) from erp_private.template_configuration_history t");return `select jsonb_object_agg(name,hash) from(${parts.join(' union all ')}) x;`;
}
