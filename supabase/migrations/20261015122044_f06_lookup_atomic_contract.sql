-- F06-T01 / SA44-F04. Additive: no catalogue rows, grants to roles, or history
-- are repaired, deleted, reseeded or normalized by this migration.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

alter table public.global_lookup_categories add column workspace_revision bigint not null default 1;
alter table public.global_lookup_values add column workspace_revision bigint not null default 1;
create trigger f06_lookup_revision before insert or update on public.global_lookup_categories
 for each row execute function erp_private.workspace_revision();
create trigger f06_lookup_revision before insert or update on public.global_lookup_values
 for each row execute function erp_private.workspace_revision();

create function erp_private.lookup_write_capability(p_capability text) returns boolean
language sql stable security definer set search_path='' as $$
 select p_capability in ('manage','lock') and erp_private.business_principal_is_active()
 and public.current_user_has_permission('master_data.lookups.'||p_capability);
$$;
alter function erp_private.lookup_write_capability(text) owner to postgres;
revoke all on function erp_private.lookup_write_capability(text) from public,anon,service_role;
grant execute on function erp_private.lookup_write_capability(text) to authenticated;

-- Retain the restrictive F03 policies and safe choice SELECTs. Bare writes are
-- closed even to managers: all application changes must have an atomic receipt.
alter policy insert_lookup_categories on public.global_lookup_categories to authenticated
 with check((select erp_private.lookup_write_capability('manage')));
alter policy insert_lookup_values on public.global_lookup_values to authenticated
 with check((select erp_private.lookup_write_capability('manage')));
alter policy update_lookup_categories on public.global_lookup_categories to authenticated
 using((select erp_private.lookup_write_capability('manage')) or (select erp_private.lookup_write_capability('lock')))
 with check((select erp_private.lookup_write_capability('manage')) or (select erp_private.lookup_write_capability('lock')));
alter policy update_lookup_values on public.global_lookup_values to authenticated
 using((select erp_private.lookup_write_capability('manage')) or (select erp_private.lookup_write_capability('lock')))
 with check((select erp_private.lookup_write_capability('manage')) or (select erp_private.lookup_write_capability('lock')));
revoke insert,update,delete on public.global_lookup_categories,public.global_lookup_values from public,authenticated,anon;
-- Defense in depth: explicitly revoke and later verify column write ACLs too.
do $$ declare t text; c record; begin
 foreach t in array array['global_lookup_categories','global_lookup_values'] loop
  for c in select a.attname from pg_attribute a where a.attrelid=('public.'||t)::regclass and a.attnum>0 and not a.attisdropped loop
   execute format('revoke insert(%I),update(%I) on public.%I from public,anon,authenticated',c.attname,c.attname,t);
  end loop;
 end loop;
end$$;

create table erp_private.lookup_mutation_receipts (
 actor uuid not null, operation_id uuid not null, request_hash text not null,
 requires_lock boolean not null, result jsonb not null,
 created_at timestamptz not null default now(), primary key(actor,operation_id)
);
alter table erp_private.lookup_mutation_receipts enable row level security;
alter table erp_private.lookup_mutation_receipts owner to postgres;
revoke all on erp_private.lookup_mutation_receipts from public,anon,authenticated,service_role;

-- No caller-supplied identity, generic entity, writable session GUC or receipt
-- writer. Invoked repeatedly after waits: a pre-wait capability is not a lease.
create function erp_private.assert_lookup_authority(p_action text,p_lock boolean,p_actor uuid,p_profile bigint)
returns void language plpgsql volatile security definer set search_path='' as $$
begin
 if auth.uid() is distinct from p_actor or p_actor is null or p_profile is null
  or public.current_user_profile_id() is distinct from p_profile
  or erp_private.business_principal_is_active() is not true
  or erp_private.lookup_write_capability(case when p_action='lock' then 'lock' else 'manage' end) is not true
  or (p_lock and erp_private.lookup_write_capability('lock') is not true) then
  raise exception 'Global lookup authority required' using errcode='42501';
 end if;
end$$;
alter function erp_private.assert_lookup_authority(text,boolean,uuid,bigint) owner to postgres;
revoke all on function erp_private.assert_lookup_authority(text,boolean,uuid,bigint) from public,anon,authenticated,service_role;

-- Defense in depth for accidentally re-granted DML. The sanctioned RPC runs as
-- its fixed owner and independently authorizes each operation; caller-set GUCs
-- cannot make the authenticated role an owner. Trusted offline owner fixtures
-- remain possible and are not silently rewritten.
create function erp_private.guard_lookup_row() returns trigger
language plpgsql set search_path='' as $$
declare oldj jsonb; newj jsonb;
begin
 if TG_OP='UPDATE' then
  oldj:=to_jsonb(old);newj:=to_jsonb(new);
  if oldj->'id' is distinct from newj->'id' or oldj->'created_at' is distinct from newj->'created_at'
   or oldj->'created_by' is distinct from newj->'created_by' or oldj->'is_system' is distinct from newj->'is_system'
   or (TG_TABLE_NAME='global_lookup_categories' and oldj->'category_code' is distinct from newj->'category_code')
   or (TG_TABLE_NAME='global_lookup_values' and (oldj->'value_code' is distinct from newj->'value_code'
    or oldj->'category_id' is distinct from newj->'category_id')) then
   raise exception 'Lookup identity is immutable' using errcode='22023';
  end if;
 end if;
 if current_user in ('authenticated','anon') then
  -- No row-wide lock-only write and no unreceipted default transition.
  raise exception 'Use the governed lookup operation' using errcode='42501';
 end if;
 return new;
end$$;
alter function erp_private.guard_lookup_row() owner to postgres;
revoke all on function erp_private.guard_lookup_row() from public,anon,authenticated,service_role;
create trigger f06_lookup_guard before insert or update on public.global_lookup_categories
 for each row execute function erp_private.guard_lookup_row();
create trigger f06_lookup_guard before insert or update on public.global_lookup_values
 for each row execute function erp_private.guard_lookup_row();

create function public.save_lookup_configuration(
 p_kind text,p_action text,p_id bigint,p_revision bigint,p_category_id bigint,
 p_category_revision bigint,p_operation uuid,p_data jsonb
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor_uid uuid:=auth.uid();actor bigint:=public.current_user_profile_id();
 entity text; category public.global_lookup_categories%rowtype; oldj jsonb; candidate jsonb; saved jsonb;
 receipt erp_private.lookup_mutation_receipts%rowtype; allowed text[]; boolean_fields text[];
 h text; cols text; vals text; assigns text; identifier text; changed boolean; needs_lock boolean:=false;
 category_changed boolean:=false; displaced jsonb; demoted jsonb; defaults_count bigint; result jsonb;
 audit_before jsonb; audit_after jsonb;
begin
 if p_kind is null or p_kind not in ('category','value') or p_action is null or p_action not in ('save','active','lock','default')
  or (p_kind='category' and p_action='default') or p_operation is null
  or p_data is null or jsonb_typeof(p_data)<>'object' or pg_column_size(p_data)>16000
  or (p_id is not null and (p_id<1 or p_id>9007199254740991 or p_revision is null or p_revision<1 or p_revision>9007199254740991))
  or (p_id is null and (p_revision is not null or p_action<>'save'))
  or (p_kind='value' and (p_category_id is null or p_category_id<1 or p_category_id>9007199254740991
   or p_category_revision is null or p_category_revision<1 or p_category_revision>9007199254740991))
  or (p_kind='category' and (p_category_id is not null or p_category_revision is not null)) then
  raise exception 'Invalid lookup operation' using errcode='22023';
 end if;
 perform erp_private.assert_lookup_authority(p_action,false,actor_uid,actor);
 entity:=case p_kind when 'category' then 'global_lookup_categories' else 'global_lookup_values' end;
 identifier:=case p_kind when 'category' then 'category_code' else 'value_code' end;
 allowed:=case when p_action='lock' then array['is_locked'] when p_action='active' then array['is_active','deactivation_reason']
  when p_action='default' then array[]::text[] when p_kind='category' then
   array['category_name_en','category_name_ar','description','module_code','category_scope','supports_hierarchy',
    'supports_color','supports_icon','supports_effective_dates','supports_metadata','is_active','sort_order']
  else array['value_label_en','value_label_ar','description','parent_value_id','color_hex','icon_name','badge_variant',
    'sort_order','is_active','effective_from','effective_to','metadata_json'] end;
 if p_id is null then allowed:=allowed||identifier;end if;
 if exists(select 1 from jsonb_object_keys(p_data) k where not k=any(allowed))
  or (p_action='lock' and not p_data?'is_locked') or (p_action='active' and not p_data?'is_active') then
  raise exception 'Protected lookup field' using errcode='22023';end if;
 boolean_fields:=array['is_locked','is_active','supports_hierarchy','supports_color','supports_icon','supports_effective_dates','supports_metadata'];
 if exists(select 1 from jsonb_each(p_data) e where
  (e.key=any(boolean_fields) and jsonb_typeof(e.value)<>'boolean')
  or (e.key='sort_order' and (jsonb_typeof(e.value)<>'number' or e.value::text !~ '^[0-9]+$' or (e.value::text)::numeric>2147483647))
  or (e.key='parent_value_id' and e.value<>'null'::jsonb and (jsonb_typeof(e.value)<>'number' or e.value::text !~ '^[1-9][0-9]*$' or (e.value::text)::numeric>9007199254740991))
  or (e.key='metadata_json' and jsonb_typeof(e.value)<>'object')
  or (not e.key=any(boolean_fields||array['sort_order','parent_value_id','metadata_json']) and jsonb_typeof(e.value) not in ('string','null'))) then
  raise exception 'Use typed lookup fields' using errcode='22023';end if;
 h:=encode(sha256(convert_to(jsonb_build_array(p_kind,p_action,p_id,p_revision,p_category_id,p_category_revision,p_data)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('f06-lookup-operation:'||actor_uid::text||':'||p_operation::text,0));
 perform erp_private.assert_lookup_authority(p_action,false,actor_uid,actor);
 select r.* into receipt from erp_private.lookup_mutation_receipts r where r.actor=actor_uid and r.operation_id=p_operation;
 if found then
  if receipt.request_hash<>h then raise exception 'Operation input changed' using errcode='22023';end if;
  perform erp_private.assert_lookup_authority(p_action,receipt.requires_lock,actor_uid,actor);
  return receipt.result||jsonb_build_object('replayed',true);
 end if;
 -- Existing geography/finance consumers lock values AND category after their
 -- domain locks. Match that order before acquiring either lookup relation.
 perform pg_advisory_xact_lock(hashtextextended('f06-geography-relations',0));
 perform erp_private.assert_lookup_authority(p_action,false,actor_uid,actor);
 perform pg_advisory_xact_lock(hashtextextended('f06-finance-relationships',0));
 perform erp_private.assert_lookup_authority(p_action,false,actor_uid,actor);
 if p_kind='value' or p_id is not null then
  select * into category from public.global_lookup_categories c where c.id=case when p_kind='category' then p_id else p_category_id end for update;
  perform erp_private.assert_lookup_authority(p_action,false,actor_uid,actor);
  if category.id is null then raise exception 'Lookup category unavailable' using errcode='PT404';end if;
  if category.workspace_revision<>(case when p_kind='category' then p_revision else p_category_revision end) then
   raise exception 'Lookup category changed' using errcode='PT409';end if;
  -- Closed application writer boundary: deterministic order includes parent and
  -- displaced defaults, without cross-domain locks after these row locks.
  perform 1 from public.global_lookup_values v where v.category_id=category.id order by v.id for update;
  perform erp_private.assert_lookup_authority(p_action,false,actor_uid,actor);
 end if;
 if p_id is not null then
  if p_kind='category' then oldj:=to_jsonb(category);
  else select to_jsonb(v) into oldj from public.global_lookup_values v where v.id=p_id and v.category_id=p_category_id;end if;
  if oldj is null then raise exception 'Lookup record unavailable' using errcode='PT404';end if;
  if (oldj->>'workspace_revision')::bigint<>p_revision then raise exception 'Lookup record changed' using errcode='PT409';end if;
 end if;
 needs_lock:=coalesce((oldj->>'is_locked')::boolean,false) or (p_kind='value' and category.is_locked) or p_action='lock';
 perform erp_private.assert_lookup_authority(p_action,needs_lock,actor_uid,actor);
 candidate:=coalesce(oldj,case when p_kind='category' then jsonb_build_object(
  'category_scope','GLOBAL','supports_hierarchy',false,'supports_color',false,'supports_icon',false,
  'supports_effective_dates',false,'supports_metadata',true,'is_system',false,'is_locked',false,'is_active',true,'sort_order',0)
  else jsonb_build_object('category_id',p_category_id,'is_default',false,'is_system',false,'is_locked',false,
   'is_active',true,'sort_order',0,'metadata_json','{}'::jsonb) end)||p_data;
 if p_kind='value' then candidate:=candidate||jsonb_build_object('category_id',p_category_id);end if;
 -- Defaults have exactly one explicit command. Generic save cannot accidentally
 -- clear/replace one, including the former form-checkbox bypass.
 if p_action='default' then candidate:=candidate||jsonb_build_object('is_default',true);end if;
 if p_action='save' and p_kind='category' then
  if candidate->>'category_code' is null or length(candidate->>'category_code') not between 2 and 100 or candidate->>'category_code' !~ '^[A-Z0-9_]+$'
   or candidate->>'category_name_en' is null or length(btrim(candidate->>'category_name_en')) not between 2 and 200
   or coalesce(length(candidate->>'category_name_ar'),0)>200 or coalesce(length(candidate->>'module_code'),0)>50
   or coalesce(length(candidate->>'description'),0)>1000 or candidate->>'category_scope' not in ('GLOBAL','COMPANY','BRANCH','MODULE') then
   raise exception 'Invalid lookup category' using errcode='22023';end if;
 elsif p_action='save' then
  if candidate->>'value_code' is null or length(candidate->>'value_code') not between 1 and 100 or candidate->>'value_code' !~ '^[A-Z0-9_]+$'
   or candidate->>'value_label_en' is null or length(btrim(candidate->>'value_label_en')) not between 1 and 200
   or coalesce(length(candidate->>'value_label_ar'),0)>200 or coalesce(length(candidate->>'description'),0)>1000
   or coalesce(length(candidate->>'icon_name'),0)>50 or coalesce(length(candidate->>'badge_variant'),0)>50
   or (candidate->>'color_hex' is not null and candidate->>'color_hex' !~ '^#[0-9A-Fa-f]{6}$') then
   raise exception 'Invalid lookup value' using errcode='22023';end if;
  if candidate->>'parent_value_id' is not null and (p_id=(candidate->>'parent_value_id')::bigint or not exists(
   select 1 from public.global_lookup_values v where v.id=(candidate->>'parent_value_id')::bigint and v.category_id=p_category_id)) then
   raise exception 'Parent must belong to the same category' using errcode='22023';end if;
  -- Reject only a newly selected cyclic ancestry; historical rows are retained,
  -- not normalized or silently detached during unrelated edits.
  if candidate->'parent_value_id' is distinct from oldj->'parent_value_id' and candidate->>'parent_value_id' is not null and exists(
   with recursive ancestry(id,parent_value_id,path,cycle) as (
    select v.id,v.parent_value_id,array[v.id],false from public.global_lookup_values v where v.id=(candidate->>'parent_value_id')::bigint and v.category_id=p_category_id
    union all select v.id,v.parent_value_id,a.path||v.id,v.id=any(a.path)
     from ancestry a join public.global_lookup_values v on v.id=a.parent_value_id and v.category_id=p_category_id where not a.cycle
   ) select 1 from ancestry where cycle or id=p_id
  ) then raise exception 'Parent hierarchy would contain a cycle' using errcode='22023';end if;
  if (p_data?'effective_from' and p_data->>'effective_from' is not null and p_data->>'effective_from' !~ '^\d{4}-\d{2}-\d{2}$')
   or (p_data?'effective_to' and p_data->>'effective_to' is not null and p_data->>'effective_to' !~ '^\d{4}-\d{2}-\d{2}$') then
   raise exception 'Use ISO calendar dates' using errcode='22023';end if;
  if (candidate->>'effective_from')::date>(candidate->>'effective_to')::date then raise exception 'Invalid effective dates' using errcode='22023';end if;
 end if;
 if p_kind='value' and oldj is not null and (oldj->>'is_default')::boolean then
  if (oldj->>'is_active')::boolean and not (candidate->>'is_active')::boolean then
   raise exception 'Choose a replacement before retiring the default' using errcode='22023';end if;
  if category.supports_effective_dates and (candidate->'effective_from' is distinct from oldj->'effective_from' or candidate->'effective_to' is distinct from oldj->'effective_to'
   or ((candidate->>'is_active')::boolean and candidate->'is_active' is distinct from oldj->'is_active'))
   and (((candidate->>'effective_from')::date>(now() at time zone 'UTC')::date) or ((candidate->>'effective_to')::date<(now() at time zone 'UTC')::date)) then
   raise exception 'Choose a replacement before invalidating the default dates' using errcode='22023';end if;
 end if;
 if p_kind='category' and oldj is not null and (candidate->>'supports_effective_dates')::boolean
  and (candidate->'supports_effective_dates' is distinct from oldj->'supports_effective_dates' or
   ((candidate->>'is_active')::boolean and candidate->'is_active' is distinct from oldj->'is_active'))
  and exists(select 1 from public.global_lookup_values v where v.category_id=category.id and v.is_default
   and (not v.is_active or v.effective_from>(now() at time zone 'UTC')::date or v.effective_to<(now() at time zone 'UTC')::date)) then
   raise exception 'Category change would invalidate its default' using errcode='22023';end if;
 if coalesce(length(p_data->>'deactivation_reason'),0)>500 then raise exception 'Invalid reason' using errcode='22023';end if;
 -- Preserve omitted historical fields and unchanged deactivation evidence.
 if oldj is null and not (candidate->>'is_active')::boolean or oldj is not null and candidate->'is_active' is distinct from oldj->'is_active' then
  candidate:=candidate||jsonb_build_object('deactivated_at',case when (candidate->>'is_active')::boolean then null else clock_timestamp() end,
   'deactivated_by',case when (candidate->>'is_active')::boolean then null else actor end,
   'deactivation_reason',case when (candidate->>'is_active')::boolean then null else p_data->>'deactivation_reason' end);
 end if;
 execute format('select to_jsonb(r) from jsonb_populate_record(null::public.%I,$1) r',entity) into candidate using candidate;
 changed:=oldj is null or (oldj-array['workspace_revision','updated_at','updated_by']) is distinct from (candidate-array['workspace_revision','updated_at','updated_by']);
 if p_action='default' then
  if not category.is_active or not (candidate->>'is_active')::boolean or (category.supports_effective_dates and
   (((candidate->>'effective_from')::date>(now() at time zone 'UTC')::date) or ((candidate->>'effective_to')::date<(now() at time zone 'UTC')::date))) then
   raise exception 'Choose an active effective value' using errcode='22023';end if;
  select count(*) into defaults_count from public.global_lookup_values v where v.category_id=category.id and v.is_default;
  if defaults_count>1 then raise exception 'Existing default ambiguity requires review' using errcode='22023';end if;
  for displaced in select to_jsonb(v) from public.global_lookup_values v where v.category_id=category.id and v.is_default and v.id<>p_id order by v.id loop
   needs_lock:=needs_lock or (displaced->>'is_locked')::boolean;
  end loop;
  perform erp_private.assert_lookup_authority(p_action,needs_lock,actor_uid,actor);
 end if;
 if changed then
  if p_action='default' then
   for displaced in select to_jsonb(v) from public.global_lookup_values v where v.category_id=category.id and v.is_default and v.id<>p_id order by v.id loop
    update public.global_lookup_values v set is_default=false,updated_by=actor where v.id=(displaced->>'id')::bigint returning to_jsonb(v) into demoted;
    insert into public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,entity_reference,action,old_values,new_values)
    values(actor,'master_data','global_lookup_values',(displaced->>'id')::bigint,displaced->>'value_code','replace_lookup_default',
     jsonb_build_object('is_default',true,'revision',displaced->>'workspace_revision'),
     jsonb_build_object('operation_id',p_operation,'is_default',false,'revision',demoted->>'workspace_revision'));
   end loop;
  end if;
  candidate:=candidate||jsonb_build_object('updated_by',actor);
  if p_id is null then candidate:=candidate||jsonb_build_object('created_by',actor);end if;
  -- The candidate has fixed-schema coercion, but only the original whitelist
  -- and server-owned lifecycle fields are actually written.
  allowed:=allowed||array['updated_by'];
  if p_id is null then allowed:=allowed||array['created_by'];end if;
  if p_kind='value' and p_id is null then allowed:=allowed||array['category_id'];end if;
  if p_action='default' then allowed:=allowed||array['is_default'];end if;
  if candidate->'deactivated_at' is distinct from oldj->'deactivated_at' or p_id is null then
   allowed:=allowed||array['deactivated_at','deactivated_by','deactivation_reason'];end if;
  select string_agg(format('%I',k),',' order by k),string_agg(format('r.%I',k),',' order by k),string_agg(format('%I=r.%I',k,k),',' order by k)
   into cols,vals,assigns from (select distinct unnest(allowed) k) keys where candidate?k;
  if p_id is null then
   execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) r returning to_jsonb(%I)',entity,cols,vals,entity,entity) into saved using candidate;
  else
   execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I,$1) r where t.id=$2 returning to_jsonb(t)',entity,assigns,entity) into saved using candidate,p_id;
  end if;
  if saved is null then raise exception 'Lookup record unavailable' using errcode='PT404';end if;
  if p_kind='value' then
   update public.global_lookup_categories c set updated_by=actor where c.id=category.id returning * into category;
   category_changed:=true;
  else category:=jsonb_populate_record(null::public.global_lookup_categories,saved);end if;
  select jsonb_object_agg(k,oldj->k),jsonb_object_agg(k,saved->k) into audit_before,audit_after
   from (select distinct unnest(allowed) k) keys where k not in ('updated_by','created_by');
  insert into public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,entity_reference,action,old_values,new_values)
  values(actor,'master_data',entity,(saved->>'id')::bigint,saved->>identifier,case when p_id is null then 'create_lookup' else p_action||'_lookup' end,
   case when oldj is null then null else audit_before||jsonb_build_object('revision',oldj->>'workspace_revision') end,
   jsonb_build_object('operation_id',p_operation,'revision',saved->>'workspace_revision','category_id',category.id,
    'category_revision',category.workspace_revision::text,'category_changed',category_changed)||audit_after);
 else saved:=oldj;end if;
 result:=jsonb_build_object('id',saved->'id','revision',saved->>'workspace_revision','kind',p_kind,'action',p_action,
  'operation_id',p_operation,'category_id',category.id,'category_revision',category.workspace_revision::text,'changed',changed,'replayed',false);
 insert into erp_private.lookup_mutation_receipts(actor,operation_id,request_hash,requires_lock,result)
 values(actor_uid,p_operation,h,needs_lock,result);
 perform erp_private.assert_lookup_authority(p_action,needs_lock,actor_uid,actor);
 return result;
end$$;
alter function public.save_lookup_configuration(text,text,bigint,bigint,bigint,bigint,uuid,jsonb) owner to postgres;
revoke all on function public.save_lookup_configuration(text,text,bigint,bigint,bigint,bigint,uuid,jsonb) from public,anon,service_role;
grant execute on function public.save_lookup_configuration(text,text,bigint,bigint,bigint,bigint,uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
