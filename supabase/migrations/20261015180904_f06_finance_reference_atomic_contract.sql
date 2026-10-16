-- F06: bounded shared Banks / Payment Terms / Tax Types adoption.
-- Additive metadata only: no catalogue repair, deletion, reseed or code reuse.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
alter table public.banks add column workspace_revision bigint not null default 1;
alter table public.payment_terms add column workspace_revision bigint not null default 1;
alter table public.tax_types add column workspace_revision bigint not null default 1;

-- Preserve the COMPLETE accumulated receipt predicate, not an earlier copied list.
do $$ declare predicate text; begin
 select pg_get_expr(c.conbin,c.conrelid) into strict predicate from pg_constraint c
 where c.conrelid='erp_private.master_lifecycle_receipts'::regclass and c.conname='master_lifecycle_receipts_entity_check';
 alter table erp_private.master_lifecycle_receipts drop constraint master_lifecycle_receipts_entity_check;
 execute 'alter table erp_private.master_lifecycle_receipts add constraint master_lifecycle_receipts_entity_check check (('||predicate||') or entity in (''banks'',''payment_terms'',''tax_types''))';
end$$;

create function erp_private.finance_reference_system_admin(p_profile bigint) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from public.user_roles u join public.roles r on r.id=u.role_id
 where u.user_profile_id=p_profile and u.is_active and r.is_active and r.role_code='system_admin'
 and u.owner_company_id is null and u.branch_id is null);
$$;
create function erp_private.assert_finance_reference_authority(p_action text,p_locked boolean,p_actor uuid,p_profile bigint)
returns void language plpgsql volatile security definer set search_path='' as $$
begin
 if p_actor is null or p_profile is null or auth.uid() is distinct from p_actor
 or public.current_user_profile_id() is distinct from p_profile
 or erp_private.business_principal_is_active() is not true
 or (p_action='retire' and erp_private.finance_reference_system_admin(p_profile) is not true)
 or (p_action='lock' and erp_private.permission_in_scope('master_data.lookups.lock',null,null) is not true)
 or (p_action in ('save','active') and erp_private.permission_in_scope('master_data.finance_basics.manage',null,null) is not true)
 or (p_locked and p_action<>'lock' and erp_private.finance_reference_system_admin(p_profile) is not true) then
  raise exception 'Global finance catalogue authority required' using errcode='42501';
 end if;
end$$;

-- Statement-level trusted owner writes take the SAME domains before row locks.
create function erp_private.finance_reference_domains() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('f06-geography-relations',0));
 perform pg_advisory_xact_lock(hashtextextended('f06-finance-relationships',0));
 return null;
end$$;

-- Future-write guard. Omitted/unchanged historical values are not repaired.
create function erp_private.guard_finance_reference_row() returns trigger
language plpgsql security invoker set search_path='' as $$
declare beforej jsonb; afterj jsonb; codefield text; namefield text; k text; n numeric; maxlen integer;
begin
 if TG_OP='DELETE' then raise exception 'Retire finance records; history cannot be deleted' using errcode='42501';end if;
 if current_user in ('authenticated','anon') then raise exception 'Use the governed finance operation' using errcode='42501';end if;
 afterj:=to_jsonb(new);beforej:=case when TG_OP='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
 codefield:=case TG_TABLE_NAME when 'banks' then 'bank_code' when 'payment_terms' then 'term_code' else 'tax_code' end;
 namefield:=case TG_TABLE_NAME when 'banks' then 'bank_name_en' when 'payment_terms' then 'term_name_en' else 'tax_name_en' end;
 if TG_OP='UPDATE' and (beforej->'id' is distinct from afterj->'id' or beforej->codefield is distinct from afterj->codefield
 or beforej->'created_at' is distinct from afterj->'created_at' or beforej->'created_by' is distinct from afterj->'created_by'
 or beforej->'is_system' is distinct from afterj->'is_system') then
  raise exception 'Finance identity is immutable' using errcode='22023';end if;
 for k in select jsonb_object_keys(afterj) loop
  if TG_OP='UPDATE' and afterj->k is not distinct from beforej->k then continue;end if;
  if k=codefield and (afterj->>k is null or afterj->>k !~ '^[A-Z0-9_]{2,50}$') then
   raise exception 'Invalid finance code' using errcode='22023',detail=k;
  elsif k=namefield and (afterj->>k is null or length(btrim(afterj->>k)) not between 2 and 255) then
   raise exception 'English name requires 2 to 255 characters' using errcode='22023',detail=k;
  elsif k=any(array['sort_order','due_days']) and ((afterj->>k)::numeric<0 or (afterj->>k)::numeric>2147483647) then
   raise exception 'Use a nonnegative whole number' using errcode='22023',detail=k;
  elsif k=any(array['advance_percentage','retention_percentage','tax_rate']) then
   n:=(afterj->>k)::numeric;
   if n<0 or n>100 then raise exception 'Percentage must be between 0 and 100' using errcode='22023',detail=k;end if;
  end if;
  maxlen:=case when k like '%_name_ar' then 255 when k='short_name' or k='bank_type_code' or k='tax_treatment_code' then 50
   when k in ('description_en','description_ar','calculation_notes') then 1000 when k='notes' then 2000
   when k='deactivation_reason' then 500 when k='contact_phone' then 30 when k='contact_email' then 320 when k='website_url' then 2048 else null end;
  if maxlen is not null and length(afterj->>k)>maxlen then raise exception 'Finance text is too long' using errcode='22023',detail=k;end if;
  if k='swift_code' and afterj->>k is not null and afterj->>k !~ '^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$' then
   raise exception 'Invalid SWIFT code' using errcode='22023',detail=k;end if;
  if k='contact_email' and afterj->>k is not null and afterj->>k !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
   raise exception 'Invalid contact email' using errcode='22023',detail=k;end if;
  if k='website_url' and afterj->>k is not null and afterj->>k !~ '^https?://[^[:space:]/]+[^[:space:]]*$' then
   raise exception 'Invalid website URL' using errcode='22023',detail=k;end if;
 end loop;
 return new;
end$$;

do $$ declare t text;c record; begin
 foreach t in array array['banks','payment_terms','tax_types'] loop
  execute format('create trigger f06_finance_reference_domains before insert or update or delete on public.%I for each statement execute function erp_private.finance_reference_domains()',t);
  execute format('create trigger f06_finance_reference_guard before insert or update or delete on public.%I for each row execute function erp_private.guard_finance_reference_row()',t);
  execute format('create trigger f06_finance_reference_revision before insert or update on public.%I for each row execute function erp_private.workspace_revision()',t);
  execute format('revoke insert,update,delete on public.%I from public,anon,authenticated',t);
  for c in select a.attname from pg_attribute a where a.attrelid=('public.'||t)::regclass and a.attnum>0 and not a.attisdropped loop
   execute format('revoke insert(%I),update(%I) on public.%I from public,anon,authenticated',c.attname,c.attname,t);
  end loop;
 end loop;
end$$;

-- Retain active safe-choice visibility and the F03 restrictive principal policy.
-- Global catalogue managers and lock-only administrators must also see inactive
-- rows to inspect/re-enable them; scoped manage/lock grants do not become global.
alter policy select_banks_authenticated on public.banks to authenticated using(
 (select erp_private.business_principal_is_active()) and (is_active
 or public.current_user_has_permission('master_data.finance_basics.view')
 or erp_private.permission_in_scope('master_data.finance_basics.manage',null,null)
 or erp_private.permission_in_scope('master_data.lookups.lock',null,null)));
alter policy select_payment_terms_authenticated on public.payment_terms to authenticated using(
 (select erp_private.business_principal_is_active()) and (is_active
 or public.current_user_has_permission('master_data.finance_basics.view')
 or erp_private.permission_in_scope('master_data.finance_basics.manage',null,null)
 or erp_private.permission_in_scope('master_data.lookups.lock',null,null)));
alter policy select_tax_types_authenticated on public.tax_types to authenticated using(
 (select erp_private.business_principal_is_active()) and (is_active
 or public.current_user_has_permission('master_data.finance_basics.view')
 or erp_private.permission_in_scope('master_data.finance_basics.manage',null,null)
 or erp_private.permission_in_scope('master_data.lookups.lock',null,null)));

create function erp_private.save_finance_reference_record(p_entity text,p_operation uuid,p_id bigint,p_revision bigint,p_action text,p_data jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor_uid uuid:=auth.uid();actor bigint:=public.current_user_profile_id();
 prior jsonb;saved jsonb;candidate jsonb;payload jsonb;receipt erp_private.master_lifecycle_receipts%rowtype;
 fields text[];allowed text[];codefield text;namefield text;k text;h text;cols text;vals text;assigns text;
 changed boolean;locked boolean:=false;reactivating boolean;result jsonb;refcategory text;refcode text;categoryid bigint;
 category public.global_lookup_categories%rowtype;lookup public.global_lookup_values%rowtype;country public.countries%rowtype;n numeric;v jsonb;
begin
 if p_entity is null or p_entity not in ('banks','payment_terms','tax_types') or p_action is null or p_action not in ('save','active','lock','retire')
 or p_operation is null or p_data is null or jsonb_typeof(p_data)<>'object' or p_data='{}'::jsonb or octet_length(p_data::text)>16000
 or (p_id is null and (p_revision is not null or p_action<>'save'))
 or (p_id is not null and (p_id<1 or p_id>9007199254740991 or p_revision is null or p_revision<1 or p_revision>9007199254740991)) then
  raise exception 'Invalid finance save contract' using errcode='22023';end if;
 perform erp_private.assert_finance_reference_authority(p_action,false,actor_uid,actor);
 codefield:=case p_entity when 'banks' then 'bank_code' when 'payment_terms' then 'term_code' else 'tax_code' end;
 namefield:=case p_entity when 'banks' then 'bank_name_en' when 'payment_terms' then 'term_name_en' else 'tax_name_en' end;
 fields:=case p_entity when 'banks' then array['bank_name_en','bank_name_ar','short_name','country_id','bank_type_code','swift_code','website_url','contact_phone','contact_email']
 when 'payment_terms' then array['term_name_en','term_name_ar','due_days','advance_percentage','retention_percentage','calculation_notes']
 else array['tax_name_en','tax_name_ar','tax_rate','tax_treatment_code','is_vat','is_reverse_charge','applies_to_sales','applies_to_purchases','applies_to_scrap','effective_from','effective_to'] end
 ||array['description_en','description_ar','notes','sort_order','is_active'];
 allowed:=case p_action when 'lock' then array['is_locked'] when 'active' then array['is_active','deactivation_reason'] when 'retire' then array['is_active'] else fields end;
 if p_id is null then allowed:=allowed||codefield;end if;
 if exists(select 1 from jsonb_object_keys(p_data) x where not x=any(allowed))
 or (p_action='lock' and not p_data?'is_locked') or (p_action='active' and not p_data?'is_active')
 or (p_action='retire' and p_data<>jsonb_build_object('is_active',false)) then
  raise exception 'Protected or missing finance field' using errcode='22023';end if;
 -- Validate JSON before table-type conversion: never coerce strings or silently round financial values.
 for k,v in select e.key,e.value from jsonb_each(p_data) e loop
  if k=any(array['is_active','is_locked','is_vat','is_reverse_charge','applies_to_sales','applies_to_purchases','applies_to_scrap']) then
   if jsonb_typeof(v)<>'boolean' then raise exception 'Use typed finance fields' using errcode='22023',detail=k;end if;
  elsif k=any(array['country_id','sort_order','due_days','advance_percentage','retention_percentage','tax_rate']) then
   if k='country_id' and v='null'::jsonb then continue;end if;
   if jsonb_typeof(v)<>'number' then raise exception 'Use typed finance fields' using errcode='22023',detail=k;end if;
   n:=(v#>>'{}')::numeric;
   if k in ('advance_percentage','retention_percentage','tax_rate') then
    if n<0 or n>100 or n<>trunc(n,case when k='tax_rate' then 4 else 2 end) then
     raise exception 'Invalid finance percentage precision' using errcode='22023',detail=k;end if;
   elsif n<>trunc(n) or n<(case when k='country_id' then 1 else 0 end) or n>(case when k='country_id' then 9007199254740991 else 2147483647 end) then
    raise exception 'Invalid finance integer' using errcode='22023',detail=k;end if;
  elsif jsonb_typeof(v) not in ('string','null') or (k in (codefield,namefield,'tax_treatment_code','effective_from') and jsonb_typeof(v)<>'string') then
   raise exception 'Use typed finance fields' using errcode='22023',detail=k;
  end if;
  if k in ('effective_from','effective_to') and v<>'null'::jsonb then
   if (v#>>'{}') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Use ISO calendar dates' using errcode='22023',detail=k;end if;
   perform (v#>>'{}')::date;
  end if;
 end loop;
 -- Hash ORIGINAL JSON, before trimming/defaults. Same UUID cannot alter its request.
 h:=encode(sha256(convert_to(jsonb_build_array(p_entity,p_action,p_id,p_revision,p_data)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('f06-finance-reference:'||actor_uid::text||':'||p_operation::text,0));
 perform erp_private.assert_finance_reference_authority(p_action,false,actor_uid,actor);
 perform pg_advisory_xact_lock(hashtextextended('f06-geography-relations',0));
 perform erp_private.assert_finance_reference_authority(p_action,false,actor_uid,actor);
 perform pg_advisory_xact_lock(hashtextextended('f06-finance-relationships',0));
 perform erp_private.assert_finance_reference_authority(p_action,false,actor_uid,actor);
 select r.* into receipt from erp_private.master_lifecycle_receipts r where r.actor=actor_uid and r.operation_id=p_operation for share;
 perform erp_private.assert_finance_reference_authority(p_action,false,actor_uid,actor);
 if receipt.operation_id is not null then
  if receipt.entity<>p_entity or receipt.request_hash<>h then raise exception 'Operation input changed' using errcode='22023';end if;
  execute format('select to_jsonb(t) from public.%I t where t.id=$1 for share',p_entity) into saved using receipt.record_id;
  if saved is null then raise exception 'Finance record unavailable' using errcode='42501';end if;
  perform erp_private.assert_finance_reference_authority(p_action,coalesce((saved->>'is_locked')::boolean,false),actor_uid,actor);
  return receipt.result||jsonb_build_object('replayed',true);
 end if;
 -- Domains serialize these catalogues with geography/lookup mutations. Read the
 -- preliminary reference identity, then lock category/values/country/target in order.
 if p_id is not null then
  execute format('select to_jsonb(t) from public.%I t where t.id=$1',p_entity) into prior using p_id;
  if prior is null then raise exception 'Finance record unavailable' using errcode='PT404';end if;
 end if;
 payload:=p_data;
 for k in select jsonb_object_keys(payload) loop
  if p_id is not null and payload->k is not distinct from prior->k then continue;end if;
  if jsonb_typeof(payload->k)='string' and k not in ('effective_from','effective_to') then
   payload:=jsonb_set(payload,array[k],case when k in (namefield,codefield,'tax_treatment_code') then to_jsonb(btrim(payload->>k))
    else coalesce(to_jsonb(nullif(btrim(payload->>k),'')),'null'::jsonb) end);
  end if;
 end loop;
 candidate:=coalesce(prior,jsonb_build_object('is_active',true,'sort_order',0,'is_locked',false,'is_system',false)
  ||case p_entity when 'payment_terms' then jsonb_build_object('due_days',0,'advance_percentage',0,'retention_percentage',0)
   when 'tax_types' then jsonb_build_object('tax_rate',0,'is_vat',false,'is_reverse_charge',false,'applies_to_sales',true,'applies_to_purchases',true,'applies_to_scrap',false,'effective_from','2018-01-01') else '{}'::jsonb end)||payload;
 reactivating:=p_id is null or (coalesce((candidate->>'is_active')::boolean,false) and (prior->>'is_active')::boolean is false);
 refcategory:=case p_entity when 'banks' then 'BANK_TYPES' when 'tax_types' then 'TAX_TREATMENT_TYPES' else null end;
 refcode:=case p_entity when 'banks' then candidate->>'bank_type_code' when 'tax_types' then candidate->>'tax_treatment_code' else null end;
 if refcategory is not null and refcode is not null and (reactivating or (p_entity='banks' and prior->'bank_type_code' is distinct from candidate->'bank_type_code')
  or (p_entity='tax_types' and prior->'tax_treatment_code' is distinct from candidate->'tax_treatment_code')) then
  select c.* into category from public.global_lookup_categories c where c.category_code=refcategory for share;
  perform erp_private.assert_finance_reference_authority(p_action,false,actor_uid,actor);
  categoryid:=category.id;
  -- Lock ordered values consistently with the lookup writer, not a join's plan order.
  perform 1 from public.global_lookup_values v where v.category_id=categoryid order by v.id for share;
  perform erp_private.assert_finance_reference_authority(p_action,false,actor_uid,actor);
  select v.* into lookup from public.global_lookup_values v where v.category_id=categoryid and v.value_code=refcode;
  if category.is_active is not true or lookup.id is null or lookup.is_active is not true
   or (lookup.effective_from is not null and lookup.effective_from>current_date) or (lookup.effective_to is not null and lookup.effective_to<current_date) then
   raise exception 'Choose an active finance type' using errcode='22023',detail=case p_entity when 'banks' then 'bank_type_code' else 'tax_treatment_code' end;end if;
 end if;
 if p_entity='banks' and candidate->>'country_id' is not null and (reactivating or prior->'country_id' is distinct from candidate->'country_id') then
  select c.* into country from public.countries c where c.id=(candidate->>'country_id')::bigint for share;
  perform erp_private.assert_finance_reference_authority(p_action,false,actor_uid,actor);
  if country.id is null or country.is_active is not true then raise exception 'Choose an active country' using errcode='22023',detail='country_id';end if;
 end if;
 if p_id is not null then
  execute format('select to_jsonb(t) from public.%I t where t.id=$1 for update',p_entity) into prior using p_id;
  locked:=coalesce((prior->>'is_locked')::boolean,false);
  perform erp_private.assert_finance_reference_authority(p_action,locked,actor_uid,actor);
  if prior is null then raise exception 'Finance record unavailable' using errcode='PT404';end if;
  if (prior->>'workspace_revision')::bigint<>p_revision then raise exception 'Finance record changed' using errcode='PT409';end if;
 end if;
 if candidate->>codefield is null or candidate->>namefield is null or (p_entity='tax_types' and coalesce(candidate->>'tax_treatment_code','')=''
  and (reactivating or prior->'tax_treatment_code' is distinct from candidate->'tax_treatment_code')) then
  raise exception 'Required finance values are missing' using errcode='22023';end if;
 if p_entity='tax_types' and (candidate->>'effective_to')::date<(candidate->>'effective_from')::date then
  raise exception 'Effective to date precedes effective from date' using errcode='22023',detail='effective_to';end if;
 if (candidate->>'is_active')::boolean and payload?'deactivation_reason' then
  candidate:=candidate||jsonb_build_object('deactivation_reason',null);payload:=payload||jsonb_build_object('deactivation_reason',null);end if;
 changed:=p_id is null or exists(select 1 from jsonb_object_keys(payload) x where coalesce(prior->x,'null'::jsonb) is distinct from candidate->x);
 if changed then
  candidate:=candidate||jsonb_build_object('updated_by',actor);
  if (candidate->>'is_active')::boolean then candidate:=candidate||jsonb_build_object('deactivated_at',null,'deactivated_by',null,'deactivation_reason',null);
  elsif p_id is null or (prior->>'is_active')::boolean then candidate:=candidate||jsonb_build_object('deactivated_at',clock_timestamp(),'deactivated_by',actor);end if;
  fields:=fields||array['is_locked','updated_by','deactivated_at','deactivated_by','deactivation_reason'];
  if p_id is null then
   fields:=fields||array[codefield,'created_by'];candidate:=candidate||jsonb_build_object('created_by',actor);
   select string_agg(format('%I',f),','),string_agg(format('v.%I',f),',') into cols,vals from unnest(fields) f;
   execute format('insert into public.%I(%s) select %s from jsonb_populate_record(null::public.%I,$1) v returning to_jsonb(%I.*)',p_entity,cols,vals,p_entity,p_entity) into saved using candidate;
  else
   select string_agg(format('%I=v.%I',f,f),',') into assigns from unnest(fields) f;
   execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I,$1) v where t.id=$2 returning to_jsonb(t.*)',p_entity,assigns,p_entity) into saved using candidate,p_id;
  end if;
  perform erp_private.assert_finance_reference_authority(p_action,locked,actor_uid,actor);
  insert into public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,entity_reference,action,old_values,new_values)
  values(actor,'master_data',p_entity,(saved->>'id')::bigint,saved->>codefield,
   case when p_id is null then 'create' when p_action='retire' then 'retire' when p_action='lock' then case when (saved->>'is_locked')::boolean then 'lock' else 'unlock' end
    when prior->'is_active' is distinct from saved->'is_active' then case when (saved->>'is_active')::boolean then 'activate' else 'deactivate' end else 'update' end,
   prior-array['created_at','updated_at'],(saved-array['created_at','updated_at'])||jsonb_build_object('operation_id',p_operation));
  perform erp_private.assert_finance_reference_authority(p_action,locked,actor_uid,actor);
 else saved:=prior;end if;
 result:=jsonb_build_object('id',(saved->>'id')::bigint,'revision',saved->>'workspace_revision','changed',changed,'replayed',false);
 -- Cross-family actor/UUID collision rejects at the shared PK; the loser rolls
 -- its entire business mutation/audit back. It must never steal another receipt.
 insert into erp_private.master_lifecycle_receipts(actor,operation_id,request_hash,entity,record_id,result)
 values(actor_uid,p_operation,h,p_entity,(saved->>'id')::bigint,result);
 perform erp_private.assert_finance_reference_authority(p_action,locked,actor_uid,actor);
 return result;
end$$;

create function public.save_finance_reference_record(p_entity text,p_operation uuid,p_id bigint,p_revision bigint,p_action text,p_data jsonb)
returns jsonb language sql volatile security invoker set search_path='' as $$
 select erp_private.save_finance_reference_record(p_entity,p_operation,p_id,p_revision,p_action,p_data);
$$;
alter function erp_private.finance_reference_system_admin(bigint) owner to postgres;
alter function erp_private.assert_finance_reference_authority(text,boolean,uuid,bigint) owner to postgres;
alter function erp_private.finance_reference_domains() owner to postgres;
alter function erp_private.guard_finance_reference_row() owner to postgres;
alter function erp_private.save_finance_reference_record(text,uuid,bigint,bigint,text,jsonb) owner to postgres;
alter function public.save_finance_reference_record(text,uuid,bigint,bigint,text,jsonb) owner to postgres;
revoke all on function erp_private.finance_reference_system_admin(bigint),erp_private.assert_finance_reference_authority(text,boolean,uuid,bigint),erp_private.finance_reference_domains(),erp_private.guard_finance_reference_row() from public,anon,authenticated,service_role;
revoke all on function erp_private.save_finance_reference_record(text,uuid,bigint,bigint,text,jsonb),public.save_finance_reference_record(text,uuid,bigint,bigint,text,jsonb) from public,anon,service_role;
grant execute on function erp_private.save_finance_reference_record(text,uuid,bigint,bigint,text,jsonb),public.save_finance_reference_record(text,uuid,bigint,bigint,text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
