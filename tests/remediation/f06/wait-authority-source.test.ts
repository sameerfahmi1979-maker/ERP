// Offline source proof only: no SQL execution, snapshots, rollback or races claimed.
import {describe,expect,it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
const read=(name:string)=>fs.readFileSync(path.resolve('supabase/migrations',name),'utf8').replace(/\r\n/g,'\n');
const names=fs.readdirSync(path.resolve('supabase/migrations'));
function current(suffix:string){const matches=names.filter(n=>n.endsWith(suffix));expect(matches).toHaveLength(1);return read(matches[0]);}
const finance=current('_f06_finance_wait_authority.sql');
const provider=current('_f06_provider_wait_authority.sql');
const baseline={
 finance:read('20261003155834_f06_finance_center_atomic_saves.sql'),
 configuration:read('20261003053109_f06_provider_atomic_saves.sql'),
 flag:read('20261003055556_f06_provider_feature_flags.sql'),
 secret:read('20261003063636_f06_provider_secret_transaction.sql'),
 health:read('20261003054646_f06_provider_health_receipts.sql'),
};
const functionNames={finance:'erp_private.save_finance_center_record',configuration:'public.save_provider_configuration',flag:'public.save_provider_feature_flag',secret:'public.save_email_provider_secret',health:'public.record_provider_health'} as const;
type Kind=keyof typeof functionNames;
function body(source:string,kind:Kind){const name=functionNames[kind].replace('.','\\.');const found=source.match(new RegExp('create (?:or replace )?function '+name+'\\([\\s\\S]*?end\\$\\$;','i'));expect(found).not.toBeNull();return found![0];}
const normalize=(s:string)=>s.replace(/\s+/g,' ').trim();
function block(source:string,label:string){const start='-- F06 current-authority '+label+' begin',end='-- F06 current-authority '+label+' end';expect(source.split(start)).toHaveLength(2);expect(source.split(end)).toHaveLength(2);return source.slice(source.indexOf(start)+start.length,source.indexOf(end));}
function follows(source:string,anchor:string,label:string){const prefix=source.slice(0,source.indexOf('-- F06 current-authority '+label+' begin')).trimEnd();expect(prefix.endsWith(anchor)).toBe(true);}
const pinnedAdmission=String.raw`actor_uid:=auth.uid();actor:=public.current_user_profile_id();
 if actor_uid is null or actor is null or auth.uid() is distinct from actor_uid
  or public.current_user_profile_id() is distinct from actor
  or erp_private.business_principal_is_active() is not true then
  raise exception 'Permission denied' using errcode='42501';end if;`;
const oldAdmission="if not erp_private.business_principal_is_active() then raise exception 'Permission denied' using errcode='42501';end if;";
const financeGuard=`if auth.uid() is distinct from actor_uid or public.current_user_profile_id() is distinct from actor
  or erp_private.business_principal_is_active() is not true then
  raise exception 'Permission denied' using errcode='42501';end if;
 select exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id
  where ur.user_profile_id=actor and ur.is_active and r.is_active and ur.owner_company_id is null
   and ur.branch_id is null and r.role_code='system_admin') into sysadmin;
 if (p_action='retire' and sysadmin is not true)
  or (p_action='lock' and erp_private.permission_in_scope('master_data.lookups.lock',null,null) is not true)
  or (p_action in ('save','active') and erp_private.permission_in_scope('master_data.finance_basics.manage',null,null) is not true) then
  raise exception 'Global catalogue permission required' using errcode='42501';end if;`;
const lockedPreimageGuard=`if coalesce((prior->>'is_locked')::boolean,false) and p_action<>'lock' and sysadmin is not true then
  raise exception 'Finance centre is locked' using errcode='42501';end if;`;
function stripChecks(source:string){return source.replace(/ -- F06 current-authority (\w+) begin[\s\S]*? -- F06 current-authority \1 end\n/g,'');}
describe('fresh finance/provider authority source boundaries',()=>{
 it.each(['finance','configuration','flag','secret','health'] as const)('%s keeps the original mutation body except reviewed authority delta',kind=>{
  let fresh=stripChecks(body(kind==='finance'?finance:provider,kind)).replace('create or replace function','create function');
  if(kind==='finance'){
   fresh=fresh.replace('actor_uid uuid;','').replace("actor_uid:=auth.uid();actor:=public.current_user_profile_id();\n if actor_uid is null or actor is null or erp_private.business_principal_is_active() is not true then\n  raise exception 'Permission denied' using errcode='42501';end if;",
    "if auth.uid() is null or not erp_private.business_principal_is_active() then raise exception 'Permission denied' using errcode='42501';end if;\n actor:=public.current_user_profile_id();");
  }
  if(kind==='configuration'||kind==='flag'){
   fresh=fresh.replace('actor_uid uuid;','').replace(pinnedAdmission,oldAdmission);
   if(kind==='configuration'){
    fresh=fresh.replace('requires_secret_authority boolean:=false;','');
    fresh=fresh.replace(/requires_secret_authority:=(old_row->>'secret_ref'[\s\S]*?candidate->k\));\n if requires_secret_authority and/,
      "if $1\n  and").replace("and public.current_user_has_permission('settings.'||p_kind||'.secrets.manage') is not true", "and not public.current_user_has_permission('settings.'||p_kind||'.secrets.manage')");
    const original=body(baseline.configuration,kind);
    const line=original.split('\n').find(l=>l.includes('actor:=public.current_user_profile_id();'))!;
    const next=original.split('\n')[original.split('\n').indexOf(line)+1];
    fresh=fresh.replace(next,line+'\n'+next);
   }else{
    fresh=fresh.replace('changed:=exists(select 1 from jsonb_object_keys(p_data) k where old_row->k is distinct from candidate->k);',
     'changed:=exists(select 1 from jsonb_object_keys(p_data) k where old_row->k is distinct from candidate->k);actor:=public.current_user_profile_id();');
   }
  }
  if(kind==='secret')fresh=fresh.replace('erp_private.provider_actor_session_valid(p_actor,p_session) is not true','not erp_private.provider_actor_session_valid(p_actor,p_session)');
  if(kind==='health')fresh=fresh.replace(',p_session uuid','').replace('p_actor is null or p_session is null or erp_private.provider_actor_session_valid(p_actor,p_session) is not true or not exists','not exists');
  expect(normalize(fresh)).toBe(normalize(body(baseline[kind],kind)));
 });
 it('finance rechecks identity, exact global capabilities and locked preimage at four deciding boundaries',()=>{
  const f=body(finance,'finance');
  follows(f,"perform pg_advisory_xact_lock(hashtextextended('f06-finance-relationships',0));",'domain');
  follows(f,"execute format('select to_jsonb(t) from public.%I t where id=$1 for share',p_entity) into saved using receipt.record_id;",'replay');
  follows(f,"execute format('select to_jsonb(t) from public.%I t where id=$1 for update',p_entity) into prior using p_id;",'target');
  follows(f,"values(auth.uid(),p_operation,h,p_entity,(saved->>'id')::bigint,result);",'terminal');
  for(const label of ['domain','replay','target','terminal']){
   const b=block(f,label);
   expect(normalize(b)).toBe(normalize(financeGuard+(label==='terminal'?'\n'+lockedPreimageGuard:'')));
   for(const required of ['auth.uid() is distinct from actor_uid','public.current_user_profile_id() is distinct from actor','erp_private.business_principal_is_active() is not true',
    'select exists','ur.is_active and r.is_active','ur.owner_company_id is null',"ur.branch_id is null and r.role_code='system_admin'","p_action='retire' and sysadmin is not true",
    "permission_in_scope('master_data.lookups.lock',null,null) is not true","p_action in ('save','active')","permission_in_scope('master_data.finance_basics.manage',null,null) is not true"])expect(b).toContain(required);
   expect(b).not.toContain('current_user_is_global_admin');
  }
  expect(block(f,'terminal')).toContain("coalesce((prior->>'is_locked')::boolean,false) and p_action<>'lock' and sysadmin is not true");
  expect(f.slice(f.indexOf('-- F06 current-authority terminal end'))).toMatch(/end\s+return result;\s+end\$\$;/);
  expect(f.match(/actor:=public.current_user_profile_id\(\)/g)).toHaveLength(1);
 });
 it.each(['configuration','flag'] as const)('%s pins identity and fresh authority before replay and after last receipt write',kind=>{
  const f=body(provider,kind);
  expect(f).toContain(pinnedAdmission);expect(f.match(/actor:=public.current_user_profile_id\(\)/g)).toHaveLength(1);
  follows(f,"perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||p_operation::text,0));",'operation');
  expect(f.indexOf('-- F06 current-authority operation end')).toBeLessThan(f.indexOf('select m.* into receipt'));
  follows(f,"values(auth.uid(),p_operation,h,entity,(saved->>'id')::bigint,result);",'terminal');
  const labels=kind==='configuration'?['operation','kind','target','terminal']:['operation','target','terminal'];
  for(const label of labels){
   const b=block(f,label);
   for(const needed of ['auth.uid() is distinct from actor_uid','public.current_user_profile_id() is distinct from actor','business_principal_is_active() is not true',"current_user_has_permission('settings.'||p_kind||'.manage')","errcode='42501'"])expect(b).toContain(needed);
   if(kind==='flag')expect(b).toContain("p_kind='email' and public.current_user_has_permission('settings.email.feature_flags.manage')");
  }
  if(kind==='configuration'){
   follows(f,"perform pg_advisory_xact_lock(hashtextextended('f06-provider:'||p_kind,0));",'kind');
   follows(f,"execute format('select to_jsonb(t) from public.%I t where id=$1 and deleted_at is null for update',entity) into old_row using p_id;",'target');
   expect(block(f,'terminal')).toContain("requires_secret_authority and public.current_user_has_permission('settings.'||p_kind||'.secrets.manage') is not true");
   expect(block(f,'operation')).not.toContain('.secrets.manage');
  }else follows(f,"execute format('select to_jsonb(t) from public.%I t where feature_code=$1 for update',entity) into old_row using p_code;",'target');
 });
 it.each(['secret','health'] as const)('%s binds current actor/session and preserves narrowly permitted global grants',kind=>{
  const f=body(provider,kind);
  for(const label of kind==='secret'?['operation','target','terminal']:['target','terminal']){
   const b=block(f,label);
   for(const required of ['provider_actor_session_valid(p_actor,p_session) is not true',"u.status='active' and u.must_change_password=false",'a.is_active and r.is_active','a.owner_company_id is null and a.branch_id is null',"r.role_code in ('system_admin','group_admin')","errcode='42501'"])expect(b).toContain(required);
   if(kind==='secret'){expect(b).toContain("p.permission_code='settings.email.secrets.manage'");expect(b).not.toContain("settings.email.manage");}
   else {expect(b).toContain("p.permission_code=capability or p_kind='email' and p.permission_code='settings.email.manage'");expect(b).not.toContain('settings.ai.manage');}
  }
  if(kind==='secret'){
   follows(f,"perform pg_advisory_xact_lock(hashtextextended('f06-email-secret:'||p_actor||':'||p_operation,0));",'operation');
   follows(f,'select * into target from public.erp_email_provider_configs where id=p_id and deleted_at is null and is_active for update;','target');
   expect(f.indexOf('-- F06 current-authority target end')).toBeLessThan(f.indexOf('select * into prior'));
   follows(f,'values(p_actor,p_operation,p_id,p_revision,fingerprint,result);','terminal');
  }else{
   follows(f,"execute format('select to_jsonb(t) from public.%I t where id=$1 and deleted_at is null and is_active for update',entity) into provider using p_id;",'target');
   const tail=f.slice(f.indexOf('-- F06 current-authority terminal end'));
   expect(tail).toMatch(/end\s+return jsonb_build_object/);
   expect(f.lastIndexOf('insert into public.audit_logs')).toBeGreaterThan(0);
   expect(f.lastIndexOf('insert into public.audit_logs')).toBeLessThan(f.indexOf('-- F06 current-authority terminal begin'));
  }
 });
 it('changes only the five reviewed functions and retains private/service-only execution boundaries',()=>{
  const all=finance+'\n'+provider;
  expect(all.match(/create (?:or replace )?function /g)).toHaveLength(5);
  expect(all).not.toMatch(/\b(?:create|alter)\s+(?:table|policy|trigger|role)\b/i);
  expect(all).not.toMatch(/\blanguage plpgsql\s+(?:stable|immutable)\b/i);
  expect(provider).toContain('drop function public.record_provider_health(text,bigint,bigint,bigint,boolean,integer);');
  expect(provider).toContain('revoke all on function public.record_provider_health(text,bigint,bigint,bigint,uuid,boolean,integer) from public,anon,authenticated;');
  expect(provider).toContain('grant execute on function public.record_provider_health(text,bigint,bigint,bigint,uuid,boolean,integer) to service_role;');
  expect(provider).toContain('grant execute on function public.save_email_provider_secret(bigint,uuid,bigint,bigint,uuid,text) to service_role;');
  expect(finance).toContain('grant execute on function erp_private.save_finance_center_record(text,uuid,bigint,bigint,text,jsonb) to authenticated;');
  for(const source of [finance,provider]){expect(source).toContain("set local lock_timeout='5s'");expect(source).toContain("set local statement_timeout='30s'");expect(source.trim()).toMatch(/commit;$/);}
 });
});
