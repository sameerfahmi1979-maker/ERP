begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Shared geography catalogues have no company owner. A company-scoped grant
-- must not become global write authority. Existing values/history are retained.
do $$declare t text;begin
 foreach t in array array['countries','emirates','cities','areas_zones','ports'] loop
  execute format('alter table public.%I add column workspace_revision bigint not null default 1',t);
  execute format('create trigger f06_geography_revision before insert or update on public.%I for each row execute function erp_private.workspace_revision()',t);
 end loop;
end$$;

create function erp_private.validate_geography_values() returns trigger
language plpgsql security definer set search_path='' as $$
declare n jsonb:=to_jsonb(new);o jsonb:=case when TG_OP='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
 k text;max_length integer;min_length integer;category text;selected text;reactivating boolean;
begin
 reactivating:=new.is_active and o->>'is_active'='false';
 -- Validate changed values only: do not silently repair historical data, and
 -- do not prevent unrelated corrections to rows with a legacy empty field.
 foreach k in array array['name_en','name_ar','nationality_en','nationality_ar','phone_code','abbreviation_en','abbreviation_ar',
  'region_type_code','area_type_code','port_type_code','default_currency_code','icao_code','iata_code','deactivation_reason'] loop
  if n?k and (TG_OP='INSERT' or n->k is distinct from o->k) then
   min_length:=case when k in ('name_en','nationality_en') then 2 when k in ('abbreviation_en','port_type_code') then 1 else 0 end;
   max_length:=case when k in ('name_en','name_ar') then 255 when k in ('nationality_en','nationality_ar') then 100
    when k='phone_code' then 10 when k in ('abbreviation_en','abbreviation_ar') then 20
    when k='deactivation_reason' then 500 when k='icao_code' then 4 when k in ('iata_code','default_currency_code') then 3 else 50 end;
   if (min_length>0 and n->>k is null) or coalesce(length(btrim(n->>k)),0)<min_length or length(n->>k)>max_length then
    raise exception 'Invalid geography field' using errcode='22023',detail=k;end if;
   if (k='icao_code' and n->>k is not null and n->>k !~ '^[A-Z]{4}$')
    or (k in ('iata_code','default_currency_code') and n->>k is not null and n->>k !~ '^[A-Z]{3}$') then
    raise exception 'Invalid geography field' using errcode='22023',detail=k;end if;
  end if;
 end loop;
 k:=case TG_TABLE_NAME when 'cities' then 'city_code' when 'areas_zones' then 'area_code' when 'ports' then 'port_code' end;
 if k is not null and (TG_OP='INSERT' or n->k is distinct from o->k) and (n->>k is null or n->>k !~ '^[A-Z0-9_]{2,100}$') then
  raise exception 'Invalid geography field' using errcode='22023',detail=k;end if;
 k:=case TG_TABLE_NAME when 'emirates' then 'region_type_code' when 'areas_zones' then 'area_type_code' when 'ports' then 'port_type_code' end;
 if k is not null and n->>k is not null and (TG_OP='INSERT' or n->k is distinct from o->k or reactivating) then
  category:=case TG_TABLE_NAME when 'emirates' then 'REGION_TYPES' when 'areas_zones' then 'AREA_TYPES' else 'PORT_TYPES' end;
  selected:=n->>k;
  perform 1 from public.global_lookup_values v join public.global_lookup_categories c on c.id=v.category_id
   where c.category_code=category and v.value_code=selected and c.is_active and v.is_active
    and (v.effective_from is null or v.effective_from<=current_date) and (v.effective_to is null or v.effective_to>=current_date)
   for share of v,c;
  if not found then raise exception 'Choose an available geography type' using errcode='23503',detail=k;end if;
 end if;
 if TG_TABLE_NAME='countries' and n->>'default_currency_code' is not null
  and (TG_OP='INSERT' or n->'default_currency_code' is distinct from o->'default_currency_code' or reactivating) then
  perform 1 from public.currencies where currency_code=n->>'default_currency_code' and is_active for share;
  if not found then raise exception 'Choose an active currency' using errcode='23503',detail='default_currency_code';end if;
 end if;
 return new;
end$$;
alter function erp_private.validate_geography_values() owner to postgres;
revoke all on function erp_private.validate_geography_values() from public,anon,authenticated,service_role;
do $$declare t text;begin
 foreach t in array array['countries','emirates','cities','areas_zones','ports'] loop
  execute format('create trigger f06_geography_values before insert or update on public.%I for each row execute function erp_private.validate_geography_values()',t);
 end loop;
end$$;

alter table erp_private.master_lifecycle_receipts drop constraint master_lifecycle_receipts_entity_check;
alter table erp_private.master_lifecycle_receipts add constraint master_lifecycle_receipts_entity_check check(entity in (
 'departments','work_calendars','work_shifts','global_numbering_rules','erp_email_provider_configs','erp_ai_provider_configs',
 'erp_email_feature_flags','erp_ai_feature_flags','erp_report_branding_profiles','erp_app_branding_settings',
 'erp_branding_assets','owner_company_branding','currencies','erp_report_templates','party_types',
 'countries','emirates','cities','areas_zones','ports'));

create function erp_private.save_geography_record(p_entity text,p_operation uuid,p_id bigint,p_revision bigint,p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare prior jsonb;saved jsonb;candidate jsonb;payload jsonb;receipt erp_private.master_lifecycle_receipts%rowtype;
 fields text[];allowed text[];code_field text;k text;columns_sql text;values_sql text;updates_sql text;
 h text;changed boolean;result jsonb;actor bigint;sysadmin boolean;
begin
 if auth.uid() is null or not erp_private.business_principal_is_active() then raise exception 'Permission denied' using errcode='42501';end if;
 actor:=public.current_user_profile_id();
 select exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id
  where ur.user_profile_id=actor and ur.is_active and r.is_active and ur.owner_company_id is null
   and ur.branch_id is null and r.role_code='system_admin') into sysadmin;
 if p_entity is null or p_entity not in ('countries','emirates','cities','areas_zones','ports')
  or p_action is null or p_action not in ('save','active','lock','retire') or p_operation is null
  or jsonb_typeof(p_data) is distinct from 'object' or p_data='{}'::jsonb or octet_length(p_data::text)>16000
  or (p_id is null and (p_revision is not null or p_action<>'save'))
  or (p_id is not null and (p_id<1 or p_revision is null or p_revision<1)) then
  raise exception 'Invalid geography save contract' using errcode='22023';end if;
 if (p_action='retire' and not sysadmin)
  or (p_action='lock' and not erp_private.permission_in_scope('master_data.lookups.lock',null,null))
  or (p_action in ('save','active') and not erp_private.permission_in_scope('master_data.geography.manage',null,null)) then
  raise exception 'Global catalogue permission required' using errcode='42501';end if;
 code_field:=case p_entity when 'countries' then 'country_code' when 'emirates' then 'emirate_code'
  when 'cities' then 'city_code' when 'areas_zones' then 'area_code' else 'port_code' end;
 fields:=array[code_field,'name_en','name_ar','is_active','sort_order']||case p_entity
  when 'countries' then array['iso3_code','nationality_en','nationality_ar','phone_code','default_currency_code','is_gcc','is_uae']
  when 'emirates' then array['abbreviation_en','abbreviation_ar','country_id','region_type_code']
  when 'cities' then array['emirate_id','country_id'] when 'areas_zones' then array['city_id','area_type_code']
  else array['emirate_id','country_id','port_type_code','icao_code','iata_code'] end;
 allowed:=case p_action when 'lock' then array['is_locked'] when 'active' then array['is_active','deactivation_reason']
  when 'retire' then array['is_active'] else fields end;
 if exists(select 1 from jsonb_object_keys(p_data) x where not x=any(allowed))
  or (p_action='lock' and not p_data?'is_locked') or (p_action='active' and not p_data?'is_active')
  or (p_action='retire' and p_data<>jsonb_build_object('is_active',false)) then
  raise exception 'Protected or missing geography fields' using errcode='22023';end if;
 for k in select jsonb_object_keys(p_data) loop
  if k=any(array['is_active','is_locked','is_gcc','is_uae']) then
   if jsonb_typeof(p_data->k)<>'boolean' then raise exception 'Use typed geography fields' using errcode='22023',detail=k;end if;
  elsif k=any(array['sort_order','country_id','emirate_id','city_id']) then
   if not(k='country_id' and p_data->k='null'::jsonb) and
    (jsonb_typeof(p_data->k)<>'number' or (p_data->>k)::numeric<>trunc((p_data->>k)::numeric)
     or (p_data->>k)::numeric<case when k='sort_order' then 0 else 1 end) then
    raise exception 'Use typed geography fields' using errcode='22023',detail=k;end if;
  elsif jsonb_typeof(p_data->k) not in ('string','null') then
   raise exception 'Use typed geography fields' using errcode='22023',detail=k;
  end if;
 end loop;
 h:=encode(sha256(convert_to(jsonb_build_array(p_entity,p_action,p_id,p_revision,p_data)::text,'UTF8')),'hex');
 -- Same lock order as the parent/child triggers; no network work in transaction.
 perform pg_advisory_xact_lock(hashtextextended('f06-geography-relations',0));
 select m.* into receipt from erp_private.master_lifecycle_receipts m where m.actor=auth.uid() and m.operation_id=p_operation;
 if found then
  if receipt.request_hash<>h then raise exception 'Operation input changed' using errcode='22023';end if;
  execute format('select to_jsonb(t) from public.%I t where id=$1 for share',p_entity) into saved using receipt.record_id;
  if saved is null or ((saved->>'is_locked')::boolean and p_action<>'lock' and not sysadmin) then
   raise exception 'Geography unavailable' using errcode='42501';end if;
  return receipt.result||jsonb_build_object('replayed',true);
 end if;
 if p_id is not null then
  execute format('select to_jsonb(t) from public.%I t where id=$1 for update',p_entity) into prior using p_id;
  if prior is null then raise exception 'Geography unavailable' using errcode='PT404';end if;
  if (prior->>'is_locked')::boolean and p_action<>'lock' and not sysadmin then raise exception 'Geography is locked' using errcode='42501';end if;
  if (prior->>'workspace_revision')::bigint<>p_revision then raise exception 'Geography changed' using errcode='PT409';end if;
  if (p_data?code_field and p_data->code_field is distinct from prior->code_field)
   or (p_entity='countries' and p_data?'iso3_code' and p_data->'iso3_code' is distinct from prior->'iso3_code') then
   raise exception 'Geography identity and system status are immutable' using errcode='22023';end if;
 end if;
 payload:=p_data;
 for k in select jsonb_object_keys(payload) loop
  if jsonb_typeof(payload->k)='string' and k<>code_field and k<>'iso3_code' then
   payload:=jsonb_set(payload,array[k],case when k in ('name_en','nationality_en','abbreviation_en','port_type_code')
    then to_jsonb(btrim(payload->>k)) else coalesce(to_jsonb(nullif(btrim(payload->>k),'')),'null'::jsonb) end);
  end if;
 end loop;
 candidate:=coalesce(prior,jsonb_build_object('is_active',true,'sort_order',0,'is_locked',false,'is_system',false)
  ||case when p_entity='countries' then jsonb_build_object('is_gcc',false,'is_uae',false) else '{}'::jsonb end)||payload;
 if candidate->>code_field is null or candidate->>'name_en' is null then raise exception 'Invalid geography values' using errcode='22023';end if;
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
  insert into public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,entity_reference,action,old_values,new_values)
   values(actor,'master_data',p_entity,(saved->>'id')::bigint,saved->>code_field,
    case when p_id is null then 'create' when p_action='retire' then 'retire'
     when p_action='lock' then case when (saved->>'is_locked')::boolean then 'lock' else 'unlock' end
     when prior->'is_active' is distinct from saved->'is_active' then case when (saved->>'is_active')::boolean then 'activate' else 'deactivate' end else 'update' end,
    prior-array['created_at','updated_at'],(saved-array['created_at','updated_at'])||jsonb_build_object('operation_id',p_operation));
 else saved:=prior;end if;
 result:=jsonb_build_object('id',(saved->>'id')::bigint,'revision',saved->>'workspace_revision','changed',changed,'replayed',false);
 insert into erp_private.master_lifecycle_receipts(actor,operation_id,request_hash,entity,record_id,result)
  values(auth.uid(),p_operation,h,p_entity,(saved->>'id')::bigint,result);
 return result;
end$$;
alter function erp_private.save_geography_record(text,uuid,bigint,bigint,text,jsonb) owner to postgres;
revoke all on function erp_private.save_geography_record(text,uuid,bigint,bigint,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function erp_private.save_geography_record(text,uuid,bigint,bigint,text,jsonb) to authenticated;
create function public.save_geography_record(p_entity text,p_operation uuid,p_id bigint,p_revision bigint,p_action text,p_data jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select erp_private.save_geography_record(p_entity,p_operation,p_id,p_revision,p_action,p_data);
$$;
alter function public.save_geography_record(text,uuid,bigint,bigint,text,jsonb) owner to postgres;
revoke all on function public.save_geography_record(text,uuid,bigint,bigint,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.save_geography_record(text,uuid,bigint,bigint,text,jsonb) to authenticated;
revoke insert,update,delete on public.countries,public.emirates,public.cities,public.areas_zones,public.ports from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
