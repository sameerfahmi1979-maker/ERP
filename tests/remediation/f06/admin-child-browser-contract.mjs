// Pure, finite AC browser-fixture contracts. Import performs no runtime I/O.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {id,uuid,quote} from './scoped-browser-contract.mjs';
export {id,uuid,quote,fixtureOwner,ownerSql,permissionsSql,validatePermissions,roleCreateSql} from './scoped-browser-contract.mjs';
export const sha=value=>createHash('sha256').update(value).digest('hex');
export const json=value=>quote(JSON.stringify(value))+'::jsonb';
const marker='F06ADMINC0520',reader='F06ADMINR0521';
const role=(suffix,permissions)=>Object.freeze({marker:marker+'_'+suffix,roleCode:(marker+'_'+suffix).toLowerCase(),fullName:marker+' '+suffix,permissions:Object.freeze(permissions)});
export const ac=Object.freeze({marker,reader,country:'AA',iso3:'QAA',
 actors:Object.freeze({editor:{marker,email:marker.toLowerCase()+'@example.invalid',fullName:'F06 synthetic browser '+marker},reader:{marker:reader,email:reader.toLowerCase()+'@example.invalid',fullName:'F06 synthetic browser '+reader}}),
 roles:Object.freeze({editor:role('EDITOR',['master_data.parties.view','master_data.parties.edit','master_data.parties.manage_services','organizations.view','organizations.manage','master_data.finance_basics.view','master_data.finance_basics.manage']),branch:role('BRANCH',['branches.view']),reader:role('READER',['master_data.parties.view','organizations.view','master_data.finance_basics.view'])}),
 buildId:'WC2bXgQxoD6en940K7pTW',origin:'http://127.0.0.1:16609',
 builtManifest:'C:/dev/agt-erp-f06/CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F06/local/browser-acceptance-private/ac-built-manifest-main.json'});
export const permissions=Object.freeze([...new Set(Object.values(ac.roles).flatMap(r=>r.permissions))].sort());
// Exact deployed-source packet, not a replacement for main's full build/process proof.
export const applicationSources=Object.freeze([
 'src/app/(protected)/admin/master-data/parties/record/[id]/page.tsx',
 'src/features/master-data/parties/party-workspace-form.tsx',
 'src/features/master-data/parties/party-tax-finance-tab.tsx',
 'src/features/master-data/parties/party-finance-profile-editor.tsx',
 'src/features/master-data/parties/party-services-tab.tsx',
 'src/server/actions/master-data/party-finance-profiles.ts',
 'src/server/actions/master-data/party-service-categories.ts',
 'src/server/finance-reference-labels.ts',
 'src/features/master-data/finance-basics/center-form-state.ts',
 'src/features/master-data/finance-basics/actions.ts',
 'src/features/master-data/finance-basics/components/finance-center-workspace-form.tsx',
 'src/app/(protected)/admin/master-data/finance-basics/cost-centers/record/new/page.tsx',
 'src/app/(protected)/admin/master-data/finance-basics/cost-centers/record/[id]/page.tsx',
 'src/app/(protected)/admin/master-data/finance-basics/profit-centers/record/new/page.tsx',
 'src/app/(protected)/admin/master-data/finance-basics/profit-centers/record/[id]/page.tsx',
 'src/features/organizations/company-signatories-section.tsx',
 'src/features/organizations/use-company-signatory-editor.ts',
 'src/server/actions/common-master-data/owner-company-signatories.ts',
 'src/components/erp/organizations/branch-select.tsx',
 'src/hooks/lookups/use-org-queries.ts','src/lib/lookups/configuration-fetchers.ts',
]);
export const stages=Object.freeze(['finance-invalid','finance-created','finance-replayed','finance-noop','finance-read-recovered',
 'service-invalid','service-created','service-replayed','service-removed','signatory-invalid','signatory-created','signatory-edited',
 'signatory-noop','signatory-archived','signatory-restored','signatory-final-archived','cost-invalid','cost-created','cost-replayed','cost-noop','profit-created']);
export const commands=Object.freeze(['resources-prepare','editor-prepare',...stages.map(s=>'observe-'+s),'editor-retire','reader-prepare','observe-reader','reader-retire','resources-retire']);
export const roleIds=r=>Object.values(r.roles).map(r=>id(r.roleId)).sort((a,b)=>a-b);
export function assertBuiltManifest(manifest,currentHashes,buildId){
 assert.deepEqual(Object.keys(manifest).sort(),['buildId','origin','sourceHashes']);assert.equal(manifest.buildId,ac.buildId);assert.equal(buildId,ac.buildId);assert.equal(manifest.origin,ac.origin);
 assert.deepEqual(Object.keys(manifest.sourceHashes).sort(),[...applicationSources].sort());assert.deepEqual(manifest.sourceHashes,currentHashes);
 for(const value of Object.values(currentHashes))assert.match(value,/^[a-f0-9]{64}$/);
}
export function preserveExcept(before,after,allowed=[]){const stable=x=>Object.fromEntries(Object.entries(x).filter(([k])=>!allowed.includes(k)));assert.deepEqual(stable(after),stable(before),'EXACT_PREIMAGE_CHANGED');}
// Changed stages may append new operations, never rewrite or replace old history.
export function assertAppendOnlyHistory(before,after){
 for(const kind of ['audits','receipts']){
  assert.ok(Array.isArray(before[kind])&&Array.isArray(after[kind]),'HISTORY_ARRAY_REQUIRED');
  const key=kind==='audits'?row=>String(id(row.id)):row=>uuid(row.actor)+':'+uuid(row.operation_id);
  const previous=new Map(before[kind].map(row=>[key(row),row])),current=new Map(after[kind].map(row=>[key(row),row]));
  assert.equal(previous.size,before[kind].length,'DUPLICATE_PRIOR_HISTORY_ID');assert.equal(current.size,after[kind].length,'DUPLICATE_CURRENT_HISTORY_ID');
  for(const [identity,row] of previous){assert.ok(current.has(identity),'PRIOR_HISTORY_MISSING:'+kind);assert.deepEqual(current.get(identity),row,'PRIOR_HISTORY_CHANGED:'+kind);}
 }
}
export function prerequisiteSql(owner){return `select jsonb_build_object('company',(select to_jsonb(r) from public.owner_companies r where id=${id(owner.companyId)}),
 'branch',(select to_jsonb(r) from public.branches r where id=${id(owner.branchId)}),
 'types',(select jsonb_agg(to_jsonb(r) order by category_code) from public.global_lookup_categories r where category_code in ('COST_CENTER_TYPES','PROFIT_CENTER_TYPES')));`;}
export function assertPrerequisites(value,owner,ledger){
 assert.equal(value.company?.id,owner.companyId);assert.equal(value.company.company_code,'F06_A');assert.equal(value.company.status,'active');
 assert.equal(value.branch?.id,owner.branchId);assert.equal(value.branch.branch_code,'F06_A1');assert.equal(value.branch.owner_company_id,owner.companyId);assert.equal(value.branch.status,'active');
 assert.equal(value.types?.length,2);
 for(const [index,code] of ['COST_CENTER_TYPES','PROFIT_CENTER_TYPES'].entries()){
  const row=value.types[index];id(row.id);assert.equal(row.category_code,code);assert.equal(row.category_scope,'GLOBAL');assert.equal(row.description,'F06_FTYPE_1004');assert.equal(row.is_active,true);
  assert.equal(ledger.rows.filter(r=>r.table==='global_lookup_categories'&&r.id===row.id&&r.marker==='F06_FTYPE_1004').length,1,'EXACT_TYPE_OWNER_REQUIRED');
 }
 assert.ok(ledger.intents.some(i=>i.marker==='F06_FTYPE_1004'&&i.operation==='Two missing synthetic type categories, one value each; browser codes F06_FTYPE_1004_C/P; retain inactive centres and typed history; retire only exact owned lookup fixtures after browser checks.'),'EXACT_TYPE_INTENT_REQUIRED');
 return value;
}
export const resourceSpecs=Object.freeze({country:['countries','country_code','AA'],nature:['party_natures','nature_code',marker+'_NATURE'],status:['party_statuses','status_code',marker+'_STATUS'],party:['parties','party_code',marker+'_PARTY'],category:['party_service_categories_master','category_code',marker+'_SERVICE'],costType:['global_lookup_values','value_code',marker+'_COST'],profitType:['global_lookup_values','value_code',marker+'_PROFIT'],costParent:['cost_centers','cost_center_code',marker+'_C_PARENT'],profitParent:['profit_centers','profit_center_code',marker+'_P_PARENT']});
export function absenceSql(base){return `select (${Object.values(resourceSpecs).map(([table,col,code])=>`(select count(*) from public.${table} where ${col}=${quote(code)}${table==='countries'?" or iso3_code='QAA'":''})`).join('+')}+
 (select count(*) from public.owner_company_signatories where full_name=${quote(marker+' signatory')})+
 (select count(*) from public.cost_centers where cost_center_code=${quote(marker+'_C')})+(select count(*) from public.profit_centers where profit_center_code=${quote(marker+'_P')})+
 (select count(*) from auth.users where id in (${Object.values(base.actors).map(a=>quote(uuid(a.authId))+'::uuid').join(',')}) or lower(email) in (${Object.values(ac.actors).map(a=>quote(a.email)).join(',')}) or raw_app_meta_data->>'f06_marker' in (${quote(marker)},${quote(reader)}))+
 (select count(*) from public.roles where role_code in (${Object.values(ac.roles).map(r=>quote(r.roleCode)).join(',')}) or notes in (${Object.values(ac.roles).map(r=>quote(r.marker)).join(',')})))::text;`;}
export function resourceCreateSql(prereq){
 const types=Object.fromEntries(prereq.types.map(t=>[t.category_code,id(t.id)]));
 // Separate statements give existing reference triggers visibility of each parent.
 return `insert into public.countries(country_code,iso3_code,name_en,nationality_en,is_active,is_system,is_locked,is_gcc,is_uae,sort_order) values('AA','QAA',${quote(marker+' country')},${quote(marker+' nationality')},true,false,false,false,false,0);
 insert into public.party_natures(nature_code,name_en,description,is_active,is_system,sort_order) values(${quote(marker+'_NATURE')},${quote(marker+' nature')},${quote(marker)},true,false,0);
 insert into public.party_statuses(status_code,name_en,description,is_active,is_system,sort_order) values(${quote(marker+'_STATUS')},${quote(marker+' status')},${quote(marker)},true,false,0);
 insert into public.parties(party_code,display_name,legal_name_en,party_nature_id,country_id,party_status_id,is_active,is_locked,is_system,remarks) select ${quote(marker+'_PARTY')},${quote(marker+' party')},${quote(marker+' party')},n.id,c.id,s.id,true,false,false,${quote(marker)} from public.countries c,public.party_natures n,public.party_statuses s where c.country_code='AA' and n.nature_code=${quote(marker+'_NATURE')} and s.status_code=${quote(marker+'_STATUS')};
 insert into public.party_service_categories_master(category_code,category_name_en,description,is_system,is_active,sort_order) values(${quote(marker+'_SERVICE')},${quote(marker+' service')},${quote(marker)},false,true,0);
 insert into public.global_lookup_values(category_id,value_code,value_label_en,description,is_active,is_system,is_locked,is_default,sort_order,metadata_json) values(${types.COST_CENTER_TYPES},${quote(marker+'_COST')},${quote(marker+' cost type')},${quote(marker)},true,false,false,false,0,'{}'),(${types.PROFIT_CENTER_TYPES},${quote(marker+'_PROFIT')},${quote(marker+' profit type')},${quote(marker)},true,false,false,false,0,'{}');
 select jsonb_build_object(${Object.entries(resourceSpecs).filter(([k])=>!k.endsWith('Parent')).map(([key,[table,col,code]])=>`${quote(key)},(select id from public.${table} where ${col}=${quote(code)})`).join(',')});`;
}
// Separate statement: referenced lookup rows must be visible to the existing guard.
export function parentsCreateSql(){return ['cost','profit'].map(kind=>`insert into public.${kind}_centers(${kind}_center_code,${kind}_center_name_en,${kind}_center_type_code,owner_company_id,branch_id,parent_${kind}_center_id,is_active,is_locked,is_system,sort_order,notes)
 values(${quote(marker+(kind==='cost'?'_C_PARENT':'_P_PARENT'))},${quote(marker+' '+kind+' parent')},${quote(marker+(kind==='cost'?'_COST':'_PROFIT'))},null,null,null,true,false,false,0,${quote(marker)}) returning jsonb_build_object('${kind}Parent',id);`).join('\n');}
export function resourcesSql(r){return `select jsonb_build_object(${Object.entries(resourceSpecs).map(([key,[table]])=>`${quote(key)},(select to_jsonb(r) from public.${table} r where id=${id(r.ids[key])})`).join(',')});`;}
export function assertResources(rows,r,retired=false){
 for(const [key,[,column,code]] of Object.entries(resourceSpecs)){const row=rows[key];assert.equal(row?.id,id(r.ids[key]));assert.equal(row[column],code);assert.equal(row.is_active,!retired);assert.equal(row.is_system,false);if('is_locked' in row)assert.equal(row.is_locked,false);}
 assert.equal(rows.country.iso3_code,'QAA');assert.equal(rows.country.default_currency_code,null);assert.equal(rows.country.phone_code,null);assert.equal(rows.country.is_uae,false);assert.equal(rows.country.is_gcc,false);
 assert.equal(rows.party.country_id,r.ids.country);assert.equal(rows.party.party_nature_id,r.ids.nature);assert.equal(rows.party.party_status_id,r.ids.status);
 for(const kind of ['cost','profit']){const row=rows[kind+'Parent'];for(const k of ['owner_company_id','branch_id','parent_'+kind+'_center_id'])assert.equal(row[k],null);assert.equal(row[kind+'_center_type_code'],marker+(kind==='cost'?'_COST':'_PROFIT'));}
}
export function actorSql(base,r,which){
 assert.ok(['editor','reader'].includes(which));const auth=uuid(base.actors[which].authId),roles=roleIds(r);
 return `select jsonb_build_object('roles',(select jsonb_agg(to_jsonb(r) order by id) from public.roles r where id in (${roles})),
 'pairs',(select jsonb_agg(to_jsonb(r) order by role_id,permission_id) from public.role_permissions r where role_id in (${roles})),
 'auth',(select jsonb_build_object('id',id,'email',email,'confirmed',email_confirmed_at is not null,'banned',coalesce(banned_until>now(),false),'marker',raw_app_meta_data->>'f06_marker','role',role) from auth.users where id=${quote(auth)}::uuid),
 'profiles',(select coalesce(jsonb_agg(to_jsonb(p) order by id),'[]') from public.user_profiles p where auth_user_id=${quote(auth)}::uuid),
 'assignments',(select coalesce(jsonb_agg(to_jsonb(a) order by id),'[]') from public.user_roles a where user_profile_id in(select id from public.user_profiles where auth_user_id=${quote(auth)}::uuid)),
 'sessions',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'userId',user_id) order by id),'[]') from auth.sessions where user_id=${quote(auth)}::uuid),
 'refreshIds',(select coalesce(jsonb_agg(id::text order by id),'[]') from auth.refresh_tokens where user_id=${quote(auth)}));`;
}
export function assertRoles(state,r,editorActive=true,readerActive=true){
 assert.equal(state.roles.length,3);assert.equal(state.pairs.length,11);
 for(const [key,mode] of Object.entries(ac.roles)){const row=state.roles.find(x=>x.id===r.roles[key].roleId);assert.ok(row);for(const [k,v] of Object.entries({role_code:mode.roleCode,role_name:mode.fullName,notes:mode.marker,is_system_role:false,is_assignable:false,is_active:key==='reader'?readerActive:editorActive}))assert.equal(row[k],v);
 assert.deepEqual(state.pairs.filter(p=>p.role_id===row.id).map(p=>({id:p.id,role_id:p.role_id,permission_id:p.permission_id})),r.roles[key].pairs);}
}
export function actorPrepareSql(base,r,which,profileId){
 const actor=ac.actors[which],auth=uuid(base.actors[which].authId);id(profileId);const names=which==='editor'?['editor','branch']:['reader'];
 return `do $g$ begin if (select count(*) from public.user_profiles where id=${profileId} and auth_user_id=${quote(auth)}::uuid and full_name=${quote(actor.fullName)})<>1 or exists(select 1 from public.user_roles where user_profile_id=${profileId}) then raise exception 'ACTOR_PREIMAGE_CHANGED';end if;end $g$;
 update public.user_profiles set notes=${quote(actor.marker)},status='active',must_change_password=false,owner_company_id=${id(base.owner.companyId)},branch_id=${id(base.owner.branchId)} where id=${profileId} and auth_user_id=${quote(auth)}::uuid;
 insert into public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active) values ${names.map(name=>`(${profileId},${id(r.roles[name].roleId)},${name==='branch'?id(base.owner.companyId):'null'},${name==='branch'?id(base.owner.branchId):'null'},true)`).join(',')} returning jsonb_build_object('id',id,'roleId',role_id);`;
}
export function assertActor(state,base,r,which,prepared,retired=false){
 const actor=ac.actors[which];assert.equal(state.auth?.id,base.actors[which].authId);assert.equal(state.auth.email,actor.email);assert.equal(state.auth.confirmed,true);assert.equal(state.auth.banned,retired);assert.equal(state.auth.marker,actor.marker);assert.equal(state.auth.role,'authenticated');assert.equal(state.profiles.length,1);
 const p=state.profiles[0];assert.equal(p.id,id(prepared.profileId));assert.equal(p.notes,actor.marker);assert.equal(p.full_name,actor.fullName);assert.equal(p.status,retired?'inactive':'active');assert.equal(p.must_change_password,false);assert.equal(p.owner_company_id,base.owner.companyId);assert.equal(p.branch_id,base.owner.branchId);
 const names=which==='editor'?['editor','branch']:['reader'];assert.equal(state.assignments.length,names.length);
 for(const name of names){const a=state.assignments.find(a=>a.role_id===r.roles[name].roleId);assert.ok(a);assert.equal(a.id,prepared.assignments.find(a=>a.roleId===r.roles[name].roleId).id);assert.equal(a.user_profile_id,p.id);assert.equal(a.is_active,!retired);assert.equal(a.owner_company_id,name==='branch'?base.owner.companyId:null);assert.equal(a.branch_id,name==='branch'?base.owner.branchId:null);}
 if(retired){assert.deepEqual(state.sessions,[]);assert.deepEqual(state.refreshIds,[]);}
}
export function actorRetireSql(base,r,which,prepared,state){
 assertActor({...state,auth:{...state.auth,banned:false}},base,r,which,prepared);assert.equal(state.auth.banned,true);
 const auth=uuid(base.actors[which].authId),assignments=prepared.assignments.map(a=>id(a.id)),roles=which==='editor'?[r.roles.editor.roleId,r.roles.branch.roleId]:[r.roles.reader.roleId];
 const sessions=state.sessions.map(s=>{assert.match(s.id,/^[a-f0-9-]{36}$/);return quote(s.id);}),refresh=state.refreshIds.map(v=>{assert.match(v,/^[1-9][0-9]*$/);return quote(v);});
 return `update public.user_roles set is_active=false where id in (${assignments}) and user_profile_id=${id(prepared.profileId)} and role_id in (${roles});
 update public.user_profiles set status='inactive' where id=${prepared.profileId} and auth_user_id=${quote(auth)}::uuid and notes=${quote(ac.actors[which].marker)};
 update public.roles set is_active=false where id in (${roles}) and notes in (${(which==='editor'?['editor','branch']:['reader']).map(k=>quote(ac.roles[k].marker))});
 with r as(delete from auth.refresh_tokens where user_id=${quote(auth)} and id in (${refresh.join(',')||'null'}) returning id),s as(delete from auth.sessions where user_id=${quote(auth)}::uuid and id in (${sessions.join(',')||'null'}) and (select count(*) from r)>=0 returning id)
 select jsonb_build_object('sessions',(select coalesce(jsonb_agg(id::text order by id),'[]') from s),'refreshIds',(select coalesce(jsonb_agg(id::text order by id),'[]') from r));`;
}
export const entities=Object.freeze({finance:'party_finance_profiles',service:'party_service_category_assignments',signatory:'owner_company_signatories',cost:'cost_centers',profit:'profit_centers'});
export function payloads(base,r){return {finance:{default_currency_id:null,default_payment_term_id:null,default_payment_method_id:null,credit_limit:0,credit_currency_id:null,finance_hold:false,finance_hold_reason:null,finance_remarks:marker+' finance'},service:{service_category_id:id(r.ids.category),is_primary:false,remarks:marker+' service'},
 signatory:{user_id:null,full_name:marker+' signatory',designation:marker+' designation',signature_scope:marker+' text only',is_primary:false,is_active:false,effective_from:'2026-01-01',effective_to:'2026-12-31',notes:marker+' notes'},
 ...Object.fromEntries(['cost','profit'].map(kind=>[kind,{[kind+'_center_code']:marker+(kind==='cost'?'_C':'_P'),[kind+'_center_name_en']:marker+' '+kind+' child',[kind+'_center_name_ar']:null,[kind+'_center_type_code']:marker+(kind==='cost'?'_COST':'_PROFIT'),['parent_'+kind+'_center_id']:id(r.ids[kind+'Parent']),owner_company_id:id(base.owner.companyId),branch_id:id(base.owner.branchId),description_en:null,description_ar:null,notes:marker+' '+kind+' notes',is_active:true,sort_order:0}]))};}
export function variants(base,r){const p=payloads(base,r),edit={...p.signatory,notes:marker+' edited notes'},updateCost={...p.cost};delete updateCost.cost_center_code;
 return [
 ['finance-created','finance',null,null,'save',p.finance,1,true],['finance-noop','finance','finance',1,'save',p.finance,1,false],
 ['service-created','service',null,null,'add',p.service,1,true],['service-removed','service','service',1,'remove',{},2,true],
 ['signatory-created','signatory',null,null,'save',p.signatory,1,true],['signatory-edited','signatory','signatory',1,'save',edit,2,true],['signatory-noop','signatory','signatory',2,'save',edit,2,false],
 ['signatory-archived','signatory','signatory',2,'archive',{},3,true],['signatory-restored','signatory','signatory',3,'restore',{},4,true],['signatory-final-archived','signatory','signatory',4,'archive',{},5,true],
 ['cost-created','cost',null,null,'save',p.cost,1,true],['cost-noop','cost','cost',1,'save',updateCost,1,false],['profit-created','profit',null,null,'save',p.profit,1,true]];
}
export function observationSql(base,r,editor){
 id(editor.profileId);const actor=id(editor.profileId),p=id(r.ids.party),ids=key=>`(select id from ${key})`;
 const rows=Object.entries(entities).map(([key,table])=>`${key} as(select * from public.${table} where ${key==='finance'||key==='service'?`party_id=${p}`:key==='signatory'?`full_name=${quote(marker+' signatory')}`:`${key}_center_code=${quote(marker+(key==='cost'?'_C':'_P'))}`} or created_by=${actor})`);
 const hashes=variants(base,r).map(([name,key,target,revision,action,data])=>{const record=target?ids(target):'null',rev=revision??'null';let args;
  if(key==='finance')args=`'party-finance-save',${p},${rev},${json(data)}`;
  else if(key==='service')args=`'party-service-assignment',${quote(action)},${p},${record},${rev},${json(data)}`;
  else if(key==='signatory')args=`'company-signatory',${id(base.owner.companyId)},${record},${rev},${quote(action)},${json(data)}`;
  else args=`${quote(entities[key])},'save',${record},${rev},${json(data)}`;
  return `${quote(name)},encode(sha256(convert_to(jsonb_build_array(${args})::text,'UTF8')),'hex')`;});
 return `with ${rows.join(',')} select jsonb_build_object('rows',jsonb_build_object(${Object.keys(entities).map(k=>`${quote(k)},(select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]') from ${k} r)`).join(',')}),
 'hashes',jsonb_build_object(${hashes.join(',')}),'audits',(select coalesce(jsonb_agg(to_jsonb(a) order by id),'[]') from public.audit_logs a where actor_user_profile_id=${actor}),
 'receipts',(select coalesce(jsonb_agg(to_jsonb(x) order by operation_id),'[]') from erp_private.master_lifecycle_receipts x where actor=${quote(uuid(base.actors.editor.authId))}::uuid));`;
}
export function assertObservation(o,base,r,editor,stage,{retired=false}={}){
 const index=stage==='initial'?-1:stages.indexOf(stage);assert.ok(index>=-1&& (stage==='initial'||index>=0),'UNKNOWN_STAGE');const allowed=variants(base,r).filter(v=>stages.indexOf(v[0])<=index),expected=payloads(base,r),owned={};
 assert.equal(new Set(o.receipts.map(x=>x.operation_id)).size,o.receipts.length);const seen=new Set(),changed=[];
 for(const receipt of o.receipts){uuid(receipt.operation_id);assert.equal(receipt.actor,base.actors.editor.authId);const v=allowed.find(v=>o.hashes[v[0]]===receipt.request_hash);assert.ok(v,'UNKNOWN_REQUEST_PAYLOAD_OR_REVISION');assert.ok(!seen.has(v[0]),'DUPLICATE_LOGICAL_OPERATION');seen.add(v[0]);const [,key,,,,,revision,didChange]=v;
  const row=o.rows[key][0];assert.ok(row);assert.equal(receipt.entity,entities[key]);assert.equal(receipt.record_id,row.id);
  assert.deepEqual(receipt.result,{id:row.id,...(key==='service'?{party_id:r.ids.party,service_category_id:r.ids.category,is_active:v[0]!=='service-removed'}:{}),revision:String(revision),changed:didChange,replayed:false});
  if(didChange)changed.push({receipt,v});
 }
 for(const v of allowed.filter(v=>v[7]))assert.ok(seen.has(v[0]),'MISSING_COMMITTED_OPERATION:'+v[0]);assert.equal(o.audits.length,changed.length,'EXACT_AUDIT_COUNT');
 for(const {receipt,v} of changed){const [,key,,,,,revision]=v,rows=o.audits.filter(a=>a.new_values?.operation_id===receipt.operation_id);assert.equal(rows.length,1);const a=rows[0];assert.equal(a.actor_user_profile_id,editor.profileId);assert.equal(a.entity_name,entities[key]);assert.equal(a.entity_id,receipt.record_id);assert.equal(a.module_code,key==='signatory'?'COMMON_MD':key==='cost'||key==='profit'?'master_data':'MASTER_DATA');assert.equal(a.action,v[0].endsWith('created')?'create':v[0]==='service-removed'?'deactivate':v[4]==='archive'?'delete':'update');assert.equal(String(a.new_values.revision??a.new_values.workspace_revision),String(revision));}
 for(const key of Object.keys(entities)){const current=allowed.filter(v=>v[1]===key&&v[7]).at(-1);assert.equal(o.rows[key].length,current?1:0,'EXACT_TARGET_COUNT:'+key);if(!current)continue;const row=o.rows[key][0];owned[key]=id(row.id);assert.equal(row.created_by,editor.profileId);assert.equal(row.updated_by,editor.profileId);assert.equal(String(row.workspace_revision),String(current[6]+(retired&&(key==='cost'||key==='profit')?1:0)));
  const fields={...expected[key]};if(key==='finance'||key==='service')fields.party_id=r.ids.party;if(key==='signatory'){fields.company_id=base.owner.companyId;if(current[6]>=2)fields.notes=marker+' edited notes';assert.equal(row.deleted_at!==null,current[4]==='archive');}
  if(key==='service')fields.is_active=current[0]!=='service-removed';if(retired&&(key==='cost'||key==='profit'))fields.is_active=false;
  for(const [k,v] of Object.entries(fields))assert.deepEqual(row[k],v,'TARGET_FIELD:'+key+'.'+k);
  if(key==='finance'){assert.equal(row.finance_hold_by,null);assert.equal(row.finance_hold_at,null);}if(key==='cost'||key==='profit'){assert.equal(row.is_locked,false);assert.equal(row.is_system,false);}
 }
 return owned;
}
export function identitySql(base,r=null){const actors=Object.values(base.actors).map(a=>quote(uuid(a.authId))+'::uuid').join(','),roles=r?roleIds(r).join(','):'null';return `select jsonb_build_object(
 'profiles',(select coalesce(jsonb_object_agg(id::text,md5(to_jsonb(p)::text)),'{}') from public.user_profiles p where auth_user_id not in (${actors}) or auth_user_id is null),
 'assignments',(select md5(coalesce(jsonb_agg(to_jsonb(a) order by id),'[]')::text) from public.user_roles a where user_profile_id not in(select id from public.user_profiles where auth_user_id in (${actors}))),
 'roles',(select md5(coalesce(jsonb_agg(to_jsonb(a) order by id),'[]')::text) from public.roles a where ${r?`id not in (${roles})`:'true'}),
 'pairs',(select md5(coalesce(jsonb_agg(to_jsonb(a) order by role_id,permission_id),'[]')::text) from public.role_permissions a where ${r?`role_id not in (${roles})`:'true'}),
 'auth',(select coalesce(jsonb_object_agg(id::text,md5(jsonb_build_array(email,role,banned_until,deleted_at)::text)),'{}') from auth.users where id not in (${actors})),
 'providers',(select coalesce(jsonb_object_agg(id::text,md5(jsonb_build_array(user_id,provider)::text)),'{}') from auth.identities where user_id not in (${actors})),
 'sessions',(select coalesce(jsonb_object_agg(id::text,user_id::text),'{}') from auth.sessions where user_id not in (${actors})),
 'refresh',(select coalesce(jsonb_object_agg(id::text,jsonb_build_array(user_id,session_id)),'{}') from auth.refresh_tokens where user_id not in (${Object.values(base.actors).map(a=>quote(a.authId)).join(',')})));`;}
export const inventorySql=`select jsonb_agg(table_name order by table_name) from information_schema.tables where table_schema='public' and table_type='BASE TABLE' and table_name not in ('user_profiles','user_roles','roles','role_permissions');`;
export function preservationSql(tables,r=null,o=null){
 const exclusions={};for(const [key,[table]] of Object.entries(resourceSpecs))if(r)(exclusions[table]??=[]).push(id(r.ids[key]));
 if(o){for(const [key,table] of Object.entries(entities))for(const row of o.rows[key])(exclusions[table]??=[]).push(id(row.id));exclusions.audit_logs=o.audits.map(a=>id(a.id));}
 const parts=tables.map(table=>{assert.match(table,/^[a-z_][a-z0-9_]*$/);const ids=exclusions[table]??[];return `select ${quote(table)} name,md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) hash from public.${table} r${ids.length?` where id not in (${ids.join(',')})`:''}`;});
 const ops=o?.receipts.map(x=>quote(uuid(x.operation_id))+'::uuid')??[];
 parts.push(`select 'erp_private.master_lifecycle_receipts',md5(coalesce(jsonb_agg(to_jsonb(r) order by actor,operation_id),'[]')::text) from erp_private.master_lifecycle_receipts r${ops.length?` where not (actor=${quote(uuid(o.receipts[0].actor))}::uuid and operation_id in (${ops.join(',')}))`:''}`);
 return `select jsonb_object_agg(name,hash) from (${parts.join(' union all ')}) x;`;
}
export function resourceRetireSql(r,o){
 const guard=Object.entries(resourceSpecs).map(([key,[table,col,code]])=>`not exists(select 1 from public.${table} where id=${id(r.ids[key])} and ${col}=${quote(code)} and is_active and not is_system)`).join(' or ');
 return `do $g$ begin if ${guard} then raise exception 'RESOURCE_PREIMAGE_CHANGED';end if;end $g$;
 ${['cost','profit'].map(k=>`update public.${k}_centers set is_active=false,deactivated_at=clock_timestamp(),deactivation_reason=${quote(marker+' retired')} where id=${id(o.rows[k][0].id)} and ${k}_center_code=${quote(marker+(k==='cost'?'_C':'_P'))};`).join('\n')}
 ${['costParent','profitParent','party','category','nature','status','costType','profitType','country'].map(key=>{const [table,col,code]=resourceSpecs[key],deactivate=['costParent','profitParent','party','costType','profitType','country'].includes(key);return `update public.${table} set is_active=false${deactivate?`,deactivated_at=clock_timestamp(),deactivation_reason=${quote(marker+' retired')}`:''} where id=${id(r.ids[key])} and ${col}=${quote(code)} and not is_system;`;}).join('\n')}
 select 'RETIRED_EXACT_AC_RESOURCES';`;
}
