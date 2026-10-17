-- F06 current authority after concurrent waits. Source-only until isolated verification.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create or replace function erp_private.save_finance_center_record(p_entity text,p_operation uuid,p_id bigint,p_revision bigint,p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare prior jsonb;saved jsonb;candidate jsonb;payload jsonb;receipt erp_private.master_lifecycle_receipts%rowtype;
 fields text[];allowed text[];prefix text;code_field text;name_field text;k text;columns_sql text;values_sql text;updates_sql text;
 h text;changed boolean;result jsonb;actor bigint;sysadmin boolean;actor_uid uuid;
begin
 actor_uid:=auth.uid();actor:=public.current_user_profile_id();
 if actor_uid is null or actor is null or erp_private.business_principal_is_active() is not true then
  raise exception 'Permission denied' using errcode='42501';end if;
 select exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id
  where ur.user_profile_id=actor and ur.is_active and r.is_active and ur.owner_company_id is null
   and ur.branch_id is null and r.role_code='system_admin') into sysadmin;
 if p_entity is null or p_entity not in ('cost_centers','profit_centers')
  or p_action is null or p_action not in ('save','active','lock','retire') or p_operation is null
  or jsonb_typeof(p_data) is distinct from 'object' or p_data='{}'::jsonb or octet_length(p_data::text)>16000
  or (p_id is null and (p_revision is not null or p_action<>'save'))
  or (p_id is not null and (p_id<1 or p_revision is null or p_revision<1)) then
  raise exception 'Invalid finance centre save contract' using errcode='22023';end if;
 if (p_action='retire' and not sysadmin)
  or (p_action='lock' and not erp_private.permission_in_scope('master_data.lookups.lock',null,null))
  or (p_action in ('save','active') and not erp_private.permission_in_scope('master_data.finance_basics.manage',null,null)) then
  raise exception 'Global catalogue permission required' using errcode='42501';end if;
 prefix:=case p_entity when 'cost_centers' then 'cost' else 'profit' end;
 code_field:=prefix||'_center_code';name_field:=prefix||'_center_name_en';
 fields:=array[code_field,name_field,prefix||'_center_name_ar',prefix||'_center_type_code','parent_'||prefix||'_center_id',
  'owner_company_id','branch_id','description_en','description_ar','notes','is_active','sort_order'];
 allowed:=case p_action when 'lock' then array['is_locked'] when 'active' then array['is_active','deactivation_reason']
  when 'retire' then array['is_active'] else fields end;
 if exists(select 1 from jsonb_object_keys(p_data) x where not x=any(allowed))
  or (p_action='lock' and not p_data?'is_locked') or (p_action='active' and not p_data?'is_active')
  or (p_action='retire' and p_data<>jsonb_build_object('is_active',false)) then
  raise exception 'Protected or missing finance centre fields' using errcode='22023';end if;
 for k in select jsonb_object_keys(p_data) loop
  if k=any(array['is_active','is_locked']) then
   if jsonb_typeof(p_data->k)<>'boolean' then raise exception 'Use typed finance centre fields' using errcode='22023',detail=k;end if;
  elsif k=any(array['sort_order','owner_company_id','branch_id','parent_cost_center_id','parent_profit_center_id']) then
   if not(k<>'sort_order' and p_data->k='null'::jsonb) and
    (jsonb_typeof(p_data->k)<>'number' or (p_data->>k)::numeric<>trunc((p_data->>k)::numeric)
     or (p_data->>k)::numeric<case when k='sort_order' then 0 else 1 end) then
    raise exception 'Use typed finance centre fields' using errcode='22023',detail=k;end if;
  elsif jsonb_typeof(p_data->k) not in ('string','null') then
   raise exception 'Use typed finance centre fields' using errcode='22023',detail=k;
  end if;
 end loop;
 h:=encode(sha256(convert_to(jsonb_build_array(p_entity,p_action,p_id,p_revision,p_data)::text,'UTF8')),'hex');
 -- Same lock order as the parent/child triggers; no network work in transaction.
 perform pg_advisory_xact_lock(hashtextextended('f06-finance-relationships',0));
 -- F06 current-authority domain begin
 if auth.uid() is distinct from actor_uid or public.current_user_profile_id() is distinct from actor
  or erp_private.business_principal_is_active() is not true then
  raise exception 'Permission denied' using errcode='42501';end if;
 select exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id
  where ur.user_profile_id=actor and ur.is_active and r.is_active and ur.owner_company_id is null
   and ur.branch_id is null and r.role_code='system_admin') into sysadmin;
 if (p_action='retire' and sysadmin is not true)
  or (p_action='lock' and erp_private.permission_in_scope('master_data.lookups.lock',null,null) is not true)
  or (p_action in ('save','active') and erp_private.permission_in_scope('master_data.finance_basics.manage',null,null) is not true) then
  raise exception 'Global catalogue permission required' using errcode='42501';end if;
 -- F06 current-authority domain end

 select m.* into receipt from erp_private.master_lifecycle_receipts m where m.actor=auth.uid() and m.operation_id=p_operation;
 if found then
  if receipt.request_hash<>h then raise exception 'Operation input changed' using errcode='22023';end if;
  execute format('select to_jsonb(t) from public.%I t where id=$1 for share',p_entity) into saved using receipt.record_id;
 -- F06 current-authority replay begin
 if auth.uid() is distinct from actor_uid or public.current_user_profile_id() is distinct from actor
  or erp_private.business_principal_is_active() is not true then
  raise exception 'Permission denied' using errcode='42501';end if;
 select exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id
  where ur.user_profile_id=actor and ur.is_active and r.is_active and ur.owner_company_id is null
   and ur.branch_id is null and r.role_code='system_admin') into sysadmin;
 if (p_action='retire' and sysadmin is not true)
  or (p_action='lock' and erp_private.permission_in_scope('master_data.lookups.lock',null,null) is not true)
  or (p_action in ('save','active') and erp_private.permission_in_scope('master_data.finance_basics.manage',null,null) is not true) then
  raise exception 'Global catalogue permission required' using errcode='42501';end if;
 -- F06 current-authority replay end

  if saved is null or ((saved->>'is_locked')::boolean and p_action<>'lock' and not sysadmin) then
   raise exception 'Finance centre unavailable' using errcode='42501';end if;
  return receipt.result||jsonb_build_object('replayed',true);
 end if;
 if p_id is not null then
  execute format('select to_jsonb(t) from public.%I t where id=$1 for update',p_entity) into prior using p_id;
 -- F06 current-authority target begin
 if auth.uid() is distinct from actor_uid or public.current_user_profile_id() is distinct from actor
  or erp_private.business_principal_is_active() is not true then
  raise exception 'Permission denied' using errcode='42501';end if;
 select exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id
  where ur.user_profile_id=actor and ur.is_active and r.is_active and ur.owner_company_id is null
   and ur.branch_id is null and r.role_code='system_admin') into sysadmin;
 if (p_action='retire' and sysadmin is not true)
  or (p_action='lock' and erp_private.permission_in_scope('master_data.lookups.lock',null,null) is not true)
  or (p_action in ('save','active') and erp_private.permission_in_scope('master_data.finance_basics.manage',null,null) is not true) then
  raise exception 'Global catalogue permission required' using errcode='42501';end if;
 -- F06 current-authority target end

  if prior is null then raise exception 'Finance centre unavailable' using errcode='PT404';end if;
  if (prior->>'is_locked')::boolean and p_action<>'lock' and not sysadmin then raise exception 'Finance centre is locked' using errcode='42501';end if;
  if (prior->>'workspace_revision')::bigint<>p_revision then raise exception 'Finance centre changed' using errcode='PT409';end if;
  if (p_data?code_field and p_data->code_field is distinct from prior->code_field)
    then
   raise exception 'Finance centre identity and system status are immutable' using errcode='22023';end if;
 end if;
 payload:=p_data;
 for k in select jsonb_object_keys(payload) loop
  if jsonb_typeof(payload->k)='string' and k<>code_field then
   payload:=jsonb_set(payload,array[k],case when k=name_field
    then to_jsonb(btrim(payload->>k)) else coalesce(to_jsonb(nullif(btrim(payload->>k),'')),'null'::jsonb) end);
  end if;
 end loop;
 candidate:=coalesce(prior,jsonb_build_object('is_active',true,'sort_order',0,'is_locked',false,'is_system',false))||payload;
 if candidate->>code_field is null or candidate->>name_field is null then raise exception 'Invalid finance centre values' using errcode='22023';end if;
 -- Active records cannot acquire an irrelevant deactivation reason through a no-op.
 if (candidate->>'is_active')::boolean and payload?'deactivation_reason' then
  candidate:=candidate||jsonb_build_object('deactivation_reason',null);payload:=payload||jsonb_build_object('deactivation_reason',null);
 end if;
 changed:=p_id is null or exists(select 1 from jsonb_object_keys(payload) x where coalesce(prior->x,'null'::jsonb) is distinct from candidate->x);
 if changed then
  candidate:=candidate||jsonb_build_object('updated_by',actor);
  if (candidate->>'is_active')::boolean then
   candidate:=candidate||jsonb_build_object('deactivated_at',null,'deactivated_by',null,'deactivation_reason',null);
  elsif p_id is null or (prior->>'is_active')::boolean then
   candidate:=candidate||jsonb_build_object('deactivated_at',clock_timestamp(),'deactivated_by',actor);
  end if;
  fields:=fields||array['is_locked','updated_by','deactivated_at','deactivated_by','deactivation_reason'];
  -- All SQL identifiers originate in the fixed table/column allowlists above.
  -- Values remain one JSON parameter, converted through the table's own type.
  if p_id is null then
   fields:=fields||array['created_by'];candidate:=candidate||jsonb_build_object('created_by',actor);
   select string_agg(format('%I',f),','),string_agg(format('v.%I',f),',') into columns_sql,values_sql from unnest(fields) f;
   execute format('insert into public.%I(%s) select %s from jsonb_populate_record(null::public.%I,$1) v returning to_jsonb(%I.*)',
    p_entity,columns_sql,values_sql,p_entity,p_entity) into saved using candidate;
  else
   select string_agg(format('%I=v.%I',f,f),',') into updates_sql from unnest(fields) f;
   execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I,$1) v where t.id=$2 returning to_jsonb(t.*)',
    p_entity,updates_sql,p_entity) into saved using candidate,p_id;
  end if;
  insert into public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,entity_reference,owner_company_id,branch_id,action,old_values,new_values)
   values(actor,'master_data',p_entity,(saved->>'id')::bigint,saved->>code_field,(saved->>'owner_company_id')::bigint,(saved->>'branch_id')::bigint,
    case when p_id is null then 'create' when p_action='retire' then 'retire'
     when p_action='lock' then case when (saved->>'is_locked')::boolean then 'lock' else 'unlock' end
     when prior->'is_active' is distinct from saved->'is_active' then case when (saved->>'is_active')::boolean then 'activate' else 'deactivate' end else 'update' end,
    prior-array['created_at','updated_at'],(saved-array['created_at','updated_at'])||jsonb_build_object('operation_id',p_operation));
 else saved:=prior;end if;
 result:=jsonb_build_object('id',(saved->>'id')::bigint,'revision',saved->>'workspace_revision','changed',changed,'replayed',false);
 insert into erp_private.master_lifecycle_receipts(actor,operation_id,request_hash,entity,record_id,result)
  values(auth.uid(),p_operation,h,p_entity,(saved->>'id')::bigint,result);
 -- F06 current-authority terminal begin
 if auth.uid() is distinct from actor_uid or public.current_user_profile_id() is distinct from actor
  or erp_private.business_principal_is_active() is not true then
  raise exception 'Permission denied' using errcode='42501';end if;
 select exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id
  where ur.user_profile_id=actor and ur.is_active and r.is_active and ur.owner_company_id is null
   and ur.branch_id is null and r.role_code='system_admin') into sysadmin;
 if (p_action='retire' and sysadmin is not true)
  or (p_action='lock' and erp_private.permission_in_scope('master_data.lookups.lock',null,null) is not true)
  or (p_action in ('save','active') and erp_private.permission_in_scope('master_data.finance_basics.manage',null,null) is not true) then
  raise exception 'Global catalogue permission required' using errcode='42501';end if;
 if coalesce((prior->>'is_locked')::boolean,false) and p_action<>'lock' and sysadmin is not true then
  raise exception 'Finance centre is locked' using errcode='42501';end if;
 -- F06 current-authority terminal end

 return result;
end$$;
alter function erp_private.save_finance_center_record(text,uuid,bigint,bigint,text,jsonb) owner to postgres;
revoke all on function erp_private.save_finance_center_record(text,uuid,bigint,bigint,text,jsonb) from public,anon,service_role;
grant execute on function erp_private.save_finance_center_record(text,uuid,bigint,bigint,text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
