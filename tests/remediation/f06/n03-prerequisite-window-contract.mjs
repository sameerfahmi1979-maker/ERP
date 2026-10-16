// Pure finite outer-window contracts. No runtime I/O on import.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {id,uuid,quote} from './scoped-browser-contract.mjs';
import {ruleSql,assertSequenceHistoryPreserved} from './n01-browser-contract.mjs';
export const windowMarker='F06N03B0520_PREREQUISITES';
export const preflightSha='fca0466c03094a60ffae28caa0600149138aff6603038b88170523d5bec5396f';
export const n03Bundle='fd3194ead104ddd8399fa0930d4d0b176fd797ea3ba5f1aaef9bd5f6a7b0d7d7';
export const mutableIds=Object.freeze([753,862,863]);
export const allIds=Object.freeze([110,753,860,862,863,868]);
export const sha=value=>createHash('sha256').update(value).digest('hex');
const json=value=>quote(JSON.stringify(value))+'::jsonb';
const without=(row,keys)=>Object.fromEntries(Object.entries(row).filter(([k])=>!keys.includes(k)));
const decimal=value=>{assert.equal(typeof value,'string');assert.match(value,/^(0|[1-9][0-9]*)$/);return BigInt(value);};
export function assertPreflight(p){
 assert.equal(p.readOnly,true);assert.equal(p.productionRowsCopied,0);assert.equal(p.activeLinks,0);assert.equal(p.activeBrowserActors,0);
 assert.deepEqual(p.permissions.map(x=>x.id),allIds);
 const expected=[[110,'numbering.rules.generate','F06 local numbering generate','numbering','generate',true],[753,'dms.documents.view','FCHRMUTSIHR5','dms','view',false],[860,'dms.documents.upload','FDMCRMUU4CA3H','F06_TEST','test',true],[862,'dms.documents.preview','FDBCRMUU65RPZ','F06_TEST','test',false],[863,'dms.documents.review_ai','FDBCRMUU65RPZ','F06_TEST','test',false],[868,'dms.documents.edit','FDUPMUU81606','F06_TEST','test',false]];
 for(const [key,code,name,module,action,active] of expected){const r=p.permissions.find(x=>x.id===key);assert.deepEqual([r.permission_code,r.permission_name,r.module_code,r.action_code,r.is_active,r.is_system_permission],[code,name,module,action,active,true]);}
 assert.equal(p.rule.length,1);const r=p.rule[0];assert.deepEqual([r.id,r.rule_code,r.rule_name,r.is_active,r.workspace_revision,r.current_sequence_number,r.next_sequence_number],[56,'MASTER_DMS_DOCUMENT','FDMCRMUU4CA3H',false,'308','260','261']);
}
export function assertProvenance(ledger){
 assert.equal(ledger.marker,'F06_LOCAL_20261001');assert.equal(ledger.productionRowsCopied,0);
 for(const [table,key,marker,operation] of [['permissions',753,'FCHRMUTSIHR5','Seven child read outcomes'],['permissions',862,'FDBCRMUU65RPZ','Create exact synthetic post-analysis batch fixture; no storage object'],['permissions',863,'FDBCRMUU65RPZ','Create exact synthetic post-analysis batch fixture; no storage object'],['global_numbering_rules',56,'FDMCRMUU4CA3H','Create exact synthetic DMS numbering resource']]){
  assert.equal(ledger.rows.filter(r=>r.table===table&&r.id===key&&r.marker===marker).length,1,'ORIGINAL_OWNER_REQUIRED');
  assert.ok(ledger.intents.some(i=>i.marker===marker&&typeof i.operation==='string'&&(key===753?i.operation.startsWith(operation):i.table===table&&i.operation===operation)),'ORIGINAL_INTENT_REQUIRED');
 }
}
export const activeLinksSql=`select count(*)::text from public.role_permissions rp join public.user_roles ur on ur.role_id=rp.role_id join public.roles r on r.id=ur.role_id join public.user_profiles p on p.id=ur.user_profile_id where rp.permission_id in(753,862,863) and r.is_active and ur.is_active and p.status='active'`;
export const actorsSql=`select count(*)::text from public.user_profiles p join auth.users u on u.id=p.auth_user_id where p.status='active' and u.raw_app_meta_data->>'f06_marker' like 'F06%'`;
const hashMap=(table,key,where='true',row='to_jsonb(r)')=>`(select coalesce(jsonb_object_agg((${key})::text,encode(sha256(convert_to((${row})::text,'UTF8')),'hex')),'{}') from ${table} r where ${where})`;
const digest=(table,where='true')=>`(select encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text,'UTF8')),'hex') from ${table} r where ${where})`;
export function snapshotSql(){return `select jsonb_build_object(
 'permissions',(select jsonb_agg(to_jsonb(p) order by id) from public.permissions p where id in(110,753,860,862,863,868)),
 'canonical',(select jsonb_agg(jsonb_build_array(id,permission_code) order by id) from public.permissions where permission_code in('numbering.rules.generate','dms.documents.view','dms.documents.upload','dms.documents.preview','dms.documents.review_ai','dms.documents.edit')),
 'otherPermissions',${digest('public.permissions','id not in(110,753,860,862,863,868)')},
 'rule',(${ruleSql().slice(0,-1)}),'otherRules',${digest('public.global_numbering_rules','id<>56')},
 'pairs',(select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]') from public.role_permissions r),
 'profiles',${hashMap('public.user_profiles','id')},'assignments',${hashMap('public.user_roles','id')},'roles',${hashMap('public.roles','id')},
 'auth',${hashMap('auth.users','id','true',"jsonb_build_array(email,role,banned_until,deleted_at)")},
 'identities',(select coalesce(jsonb_object_agg(user_id::text,h),'{}') from(select user_id,encode(sha256(convert_to(jsonb_agg(jsonb_build_array(id,provider) order by id)::text,'UTF8')),'hex') h from auth.identities group by user_id) z),
 'sessions',${hashMap('auth.sessions','id','true',"jsonb_build_array(id,user_id)")},'refresh',${hashMap('auth.refresh_tokens','id','true',"jsonb_build_array(id,user_id,session_id)")},
 'references',${hashMap('public.global_numbering_generated_references','id','numbering_rule_id=56')},
 'requests',${hashMap('erp_private.numbering_requests',"actor_id::text||':'||operation_id::text",'reference_id in(select id from public.global_numbering_generated_references where numbering_rule_id=56)')},
 'audits',${hashMap('public.audit_logs','id',"(entity_name='global_numbering_rules' and entity_id=56) or (entity_name='global_numbering_generated_references' and entity_id in(select id from public.global_numbering_generated_references where numbering_rule_id=56))")},
 'ruleReceipts',${digest('erp_private.master_lifecycle_receipts',"entity='global_numbering_rules' and record_id=56")},
 'sequences',(select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('last_sequence_number',last_sequence_number::text,'next_sequence_number',next_sequence_number::text) order by id),'[]') from public.global_numbering_sequence_states r where numbering_rule_id=56),
 'providers',jsonb_build_array(${digest('public.erp_ai_provider_configs')},${digest('public.erp_email_provider_configs')}),
 'activeLinks',(${activeLinksSql}),'activeBrowserActors',(${actorsSql}));`;}
export function assertAdmission(s,p){assertPreflight(p);assert.deepEqual(s.permissions,p.permissions,'PREFLIGHT_PERMISSION_CHANGED');assert.deepEqual(s.rule,p.rule,'PREFLIGHT_RULE_CHANGED');assert.deepEqual(s.canonical,p.permissions.map(r=>[r.id,r.permission_code]));assert.equal(s.activeLinks,'0');assert.equal(s.activeBrowserActors,'0');}
export function assertTransition(before,after,active){
 assert.deepEqual(before.permissions.map(r=>r.id),allIds);assert.deepEqual(after.permissions.map(r=>r.id),allIds);
 assert.equal(before.rule.length,1);assert.equal(after.rule.length,1);
 for(const [i,r] of before.permissions.entries()){const a=after.permissions[i];if(mutableIds.includes(r.id)){assert.equal(r.is_active,!active);assert.equal(a.is_active,active);assert.deepEqual(without(a,['is_active','updated_at']),without(r,['is_active','updated_at']));assert.ok(Number.isFinite(Date.parse(a.updated_at))&&Date.parse(a.updated_at)>=Date.parse(r.updated_at));}else assert.deepEqual(a,r,'VERIFY_ONLY_CHANGED');}
 const r=before.rule[0],a=after.rule[0];assert.equal(r.is_active,!active);assert.equal(a.is_active,active);assert.equal(decimal(a.workspace_revision),decimal(r.workspace_revision)+BigInt(1));assert.deepEqual(without(a,['is_active','updated_at','workspace_revision']),without(r,['is_active','updated_at','workspace_revision']),'RULE_NONWINDOW_CHANGED');assert.ok(Number.isFinite(Date.parse(a.updated_at))&&Date.parse(a.updated_at)>=Date.parse(r.updated_at));
 assert.deepEqual(without(after,['permissions','rule']),without(before,['permissions','rule']),'WINDOW_CHANGED_OTHER_STATE');
}
export function transitionSql(before,active){
 assert.equal(before.activeLinks,'0');assert.equal(before.activeBrowserActors,'0');assert.deepEqual(before.permissions.map(r=>r.id),allIds);assert.equal(before.rule[0].id,56);
 return `lock table public.permissions,public.role_permissions,public.roles,public.user_roles,public.user_profiles in share row exclusive mode;
 do $guard$ declare affected integer;observed jsonb;begin
 perform id from public.global_numbering_rules where id=56 for update;
 if (${snapshotSql().slice(0,-1)}) is distinct from ${json(before)} then raise exception 'EXACT_WINDOW_PREIMAGE_CHANGED';end if;
 update public.permissions set is_active=${active} where id in(753,862,863) and is_active=${!active};get diagnostics affected=row_count;if affected<>3 then raise exception 'PERMISSION_COUNT_CHANGED';end if;
 update public.global_numbering_rules set is_active=${active} where id=56 and rule_code='MASTER_DMS_DOCUMENT' and rule_name='FDMCRMUU4CA3H' and is_active=${!active};get diagnostics affected=row_count;if affected<>1 then raise exception 'RULE_COUNT_CHANGED';end if;
 observed:=(${snapshotSql().slice(0,-1)});
 if exists(select 1 from jsonb_array_elements(observed->'permissions') x cross join jsonb_array_elements(${json(before.permissions)}) p where x->>'id'=p->>'id' and (x->>'id')::bigint not in(753,862,863) and x is distinct from p) then raise exception 'VERIFY_ONLY_PERMISSION_CHANGED';end if;
 if exists(select 1 from jsonb_array_elements(observed->'permissions') x cross join jsonb_array_elements(${json(before.permissions)}) p where x->>'id'=p->>'id' and (x->>'id')::bigint in(753,862,863) and ((x->>'updated_at')::timestamptz is distinct from transaction_timestamp() or (x->>'updated_at')::timestamptz<(p->>'updated_at')::timestamptz)) then raise exception 'PERMISSION_TRIGGER_TIME_CHANGED';end if;
 if (observed->'rule'->0->>'updated_at')::timestamptz is distinct from transaction_timestamp() or (observed->'rule'->0->>'updated_at')::timestamptz<${quote(before.rule[0].updated_at)}::timestamptz then raise exception 'RULE_TRIGGER_TIME_CHANGED';end if;
 if observed-array['permissions','rule'] is distinct from ${json(without(before,['permissions','rule']))}
 or (select jsonb_agg(x-array['is_active','updated_at'] order by (x->>'id')::bigint) from jsonb_array_elements(observed->'permissions') x) is distinct from ${json(before.permissions.map(r=>without(r,['is_active','updated_at'])))}
 or exists(select 1 from jsonb_array_elements(observed->'permissions') x where (x->>'is_active')::boolean is distinct from (case when (x->>'id')::bigint in(753,862,863) then ${active} else (select (p->>'is_active')::boolean from jsonb_array_elements(${json(before.permissions)}) p where p->>'id'=x->>'id') end))
 or (observed->'rule'->0)-array['is_active','updated_at','workspace_revision'] is distinct from ${json(without(before.rule[0],['is_active','updated_at','workspace_revision']))}
 or (observed->'rule'->0->>'is_active')::boolean is distinct from ${active}
 or (observed->'rule'->0->>'workspace_revision')::numeric is distinct from ${decimal(before.rule[0].workspace_revision)+BigInt(1)} then raise exception 'WINDOW_POSTCONDITION_CHANGED';end if;
 end $guard$;
 ${snapshotSql()}`;
}
function exactAppend(before,after,allowed,label){const added=Object.keys(after).filter(k=>!Object.hasOwn(before,k));assert.deepEqual(added.sort(),allowed.map(String).sort(),label+'_EXTRA');for(const [k,v] of Object.entries(before))assert.equal(after[k],v,label+'_HISTORY_CHANGED');}
export function assertAfterN03(opened,current,{base,prepared,final,checked}){
 assert.equal(base.marker,'F06N03B0520');uuid(base.nonce);uuid(base.authId);assert.equal(base.sourceSha256,n03Bundle);assert.equal(checked.state,'PASS_EXACT_N03_CLOSED_WINDOW_ONLY');assert.equal(checked.repairs,0);assert.equal(checked.nonce,base.nonce);assert.equal(checked.sourceSha256,n03Bundle);assert.equal(final.nonce,base.nonce);assert.equal(prepared.nonce,base.nonce);assert.deepEqual(checked.identity,final.identity);
 assert.deepEqual(current.permissions,opened.permissions);for(const k of ['canonical','otherPermissions','otherRules','ruleReceipts','providers','sessions','refresh'])assert.deepEqual(current[k],opened[k],k+'_CHANGED');assert.equal(current.activeLinks,'0');assert.equal(current.activeBrowserActors,'0');assert.deepEqual(current.rule,[final.currentRule]);
 assert.deepEqual(without(current.rule[0],['current_sequence_number','next_sequence_number','updated_at','updated_by','workspace_revision']),without(opened.rule[0],['current_sequence_number','next_sequence_number','updated_at','updated_by','workspace_revision']),'RULE_DEFINITION_CHANGED');
 const x=final.identity;id(x.referenceId);uuid(x.operationId);id(prepared.profileId);const roles=Object.values(prepared.roles).map(r=>id(r.roleId));assert.equal(roles.length,2);
 for(const [kind,keys] of [['profiles',[prepared.profileId]],['roles',roles],['assignments',Object.values(prepared.assignmentIds)],['auth',[base.authId]],['identities',[base.authId]]])exactAppend(opened[kind],current[kind],keys,kind);
 const newPairs=Object.values(prepared.roles).flatMap(r=>r.pairs);assert.equal(newPairs.length,5);assert.equal(new Set(newPairs.map(r=>r.id)).size,5);assert.deepEqual(newPairs.map(r=>r.permission_id).sort((a,b)=>a-b),[110,753,860,862,863]);
 assert.deepEqual(current.pairs.filter(r=>!roles.includes(r.role_id)),opened.pairs,'PRIOR_PAIR_CHANGED');assert.deepEqual(current.pairs.filter(r=>roles.includes(r.role_id)).map(r=>({id:r.id,role_id:r.role_id,permission_id:r.permission_id})).sort((a,b)=>a.id-b.id),[...newPairs].sort((a,b)=>a.id-b.id));
 exactAppend(opened.references,current.references,[x.referenceId],'REFERENCE');exactAppend(opened.requests,current.requests,[prepared.profileId+':'+x.operationId],'REQUEST');
 const auditIds=final.observation.audits.filter(r=>r.entity_name==='global_numbering_generated_references').map(r=>id(r.id));assert.equal(auditIds.length,2);exactAppend(opened.audits,current.audits,auditIds,'AUDIT');assertSequenceHistoryPreserved(opened.sequences,current.sequences,id(x.sequenceId));
}
