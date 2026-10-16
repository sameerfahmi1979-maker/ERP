-- F06: only the two mounted party administration catalogues. Existing lookup
-- reads and role grants remain unchanged; catalogue writes require GLOBAL scope.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

alter table public.party_service_categories_master add column workspace_revision bigint not null default 1;
alter table public.party_relationship_types add column workspace_revision bigint not null default 1;
create trigger f06_admin_master_revision before insert or update on public.party_service_categories_master for each row execute function erp_private.workspace_revision();
create trigger f06_admin_master_revision before insert or update on public.party_relationship_types for each row execute function erp_private.workspace_revision();

-- Every entry point, including trusted direct DML, locks BEFORE row acquisition.
-- Exact shared ordering: geography -> party relationships -> catalogue domain ->
-- catalogue/reference rows. New assignment adapters must take these domains
-- before their party/assignment locks, never acquire the catalogue domain last.
create function erp_private.lock_party_admin_master_relations() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('f06-geography-relations',0));
 perform pg_advisory_xact_lock(hashtextextended('f06-party-relations',0));
 perform pg_advisory_xact_lock(hashtextextended('f06-party-admin-masters-relations',0));
 return null;
end$$;
alter function erp_private.lock_party_admin_master_relations() owner to postgres;
revoke all on function erp_private.lock_party_admin_master_relations() from public,anon,authenticated,service_role;
do $$declare target text;begin
 foreach target in array array['party_service_categories_master','party_relationship_types','party_service_category_assignments','party_relationships','party_government_authority_profiles'] loop
  execute format('create trigger f06_admin_master_domain before insert or update or delete on public.%I for each statement execute function erp_private.lock_party_admin_master_relations()',target);
 end loop;
end$$;

create function erp_private.validate_party_admin_master() returns trigger
language plpgsql security definer set search_path='' as $$
declare n jsonb:=to_jsonb(new);o jsonb:=case when TG_OP='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
 code_field text;name_field text;arabic_field text;parent bigint;
begin
 if TG_TABLE_NAME='party_service_categories_master' then code_field:='category_code';name_field:='category_name_en';arabic_field:='category_name_ar';
 elsif TG_TABLE_NAME='party_relationship_types' then code_field:='relationship_code';name_field:='name_en';arabic_field:='name_ar';
 else raise exception 'Unsupported catalogue' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('f06-party-admin-masters-relations',0));
 if TG_OP='UPDATE' and (n->code_field is distinct from o->code_field or n->'is_system' is distinct from o->'is_system') then
  raise exception 'Catalogue code and system flag are immutable' using errcode='22023';end if;
 if (n->>code_field) is null or (n->>code_field)!~'^[A-Z0-9_]{1,100}$'
  or (n->>name_field) is null or length(btrim(n->>name_field)) not between 1 and 200
  or coalesce(length(n->>arabic_field),0)>200 or coalesce(length(n->>'description'),0)>2000
  or (n->>'sort_order')::integer<0 then raise exception 'Invalid catalogue values' using errcode='22023';end if;
 if TG_TABLE_NAME='party_service_categories_master' then
  parent:=(n->>'parent_category_id')::bigint;
  if parent is not null then
   if parent=new.id or exists(with recursive ancestors as (
    select c.id,c.parent_category_id from public.party_service_categories_master c where c.id=parent
    union select c.id,c.parent_category_id from public.party_service_categories_master c join ancestors a on c.id=a.parent_category_id
   ) select 1 from ancestors where id=new.id) then raise exception 'Category hierarchy cycle' using errcode='23503';end if;
   if TG_OP='INSERT' or n->'parent_category_id' is distinct from o->'parent_category_id' or (new.is_active and o->>'is_active'='false') then
    perform 1 from public.party_service_categories_master where id=parent and is_active for share;
    if not found then raise exception 'Choose an active parent category' using errcode='23503';end if;
   end if;
  end if;
  if TG_OP='UPDATE' and old.is_active and not new.is_active and (
   exists(select 1 from public.party_service_categories_master where parent_category_id=new.id and is_active)
   or exists(select 1 from public.party_service_category_assignments where service_category_id=new.id and is_active)
   -- This profile has no lifecycle flag: clearing its reference is explicit.
   or exists(select 1 from public.party_government_authority_profiles where service_category_id=new.id)) then
   raise exception 'Service category has live dependencies' using errcode='23503';end if;
 elsif TG_OP='UPDATE' and old.is_active and not new.is_active and exists(
  select 1 from public.party_relationships where relationship_type_id=new.id and is_active) then
  raise exception 'Relationship type has active dependencies' using errcode='23503';end if;
 return new;
end$$;
alter function erp_private.validate_party_admin_master() owner to postgres;
revoke all on function erp_private.validate_party_admin_master() from public,anon,authenticated,service_role;
create trigger f06_admin_master_integrity before insert or update on public.party_service_categories_master for each row execute function erp_private.validate_party_admin_master();
create trigger f06_admin_master_integrity before insert or update on public.party_relationship_types for each row execute function erp_private.validate_party_admin_master();

-- Same domain lock serializes new/reactivated uses against retirement. Existing
-- inactive references remain historical and can be removed without reactivation.
create function erp_private.validate_party_admin_master_reference() returns trigger
language plpgsql security definer set search_path='' as $$
declare n jsonb:=to_jsonb(new);o jsonb:=case when TG_OP='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
 field text;target text;active boolean;
begin
 if TG_TABLE_NAME in ('party_service_category_assignments','party_government_authority_profiles') then field:='service_category_id';target:='party_service_categories_master';
 elsif TG_TABLE_NAME='party_relationships' then field:='relationship_type_id';target:='party_relationship_types';
 else raise exception 'Unsupported catalogue reference' using errcode='22023';end if;
 if n->>field is null or n->>'is_active'='false' or
  (TG_OP='UPDATE' and n->field is not distinct from o->field and coalesce(o->>'is_active','true')='true') then return new;end if;
 perform pg_advisory_xact_lock(hashtextextended('f06-party-admin-masters-relations',0));
 execute format('select is_active from public.%I where id=$1 for share',target) into active using (n->>field)::bigint;
 if active is distinct from true then raise exception 'Choose an active catalogue reference' using errcode='23503';end if;
 return new;
end$$;
alter function erp_private.validate_party_admin_master_reference() owner to postgres;
revoke all on function erp_private.validate_party_admin_master_reference() from public,anon,authenticated,service_role;
create trigger f06_admin_master_reference before insert or update on public.party_service_category_assignments for each row execute function erp_private.validate_party_admin_master_reference();
create trigger f06_admin_master_reference before insert or update on public.party_government_authority_profiles for each row execute function erp_private.validate_party_admin_master_reference();
create trigger f06_admin_master_reference before insert or update on public.party_relationships for each row execute function erp_private.validate_party_admin_master_reference();

-- Preserve every previously admitted receipt entity (including parallel F06 work).
do $$declare predicate text;begin
 select pg_get_expr(conbin,conrelid) into strict predicate from pg_constraint
 where conrelid='erp_private.master_lifecycle_receipts'::regclass and conname='master_lifecycle_receipts_entity_check';
 alter table erp_private.master_lifecycle_receipts drop constraint master_lifecycle_receipts_entity_check;
 execute 'alter table erp_private.master_lifecycle_receipts add constraint master_lifecycle_receipts_entity_check check (('
  ||predicate||') or entity in (''party_service_categories_master'',''party_relationship_types''))';
end$$;

create function erp_private.save_party_admin_master(p_entity text,p_operation uuid,p_id bigint,p_revision bigint,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare permission text;code_field text;name_field text;arabic_field text;allowed text[];k text;h text;
 prior jsonb;candidate jsonb;saved jsonb;payload jsonb;actor bigint;changed boolean;result jsonb;
 receipt erp_private.master_lifecycle_receipts%rowtype;
begin
 if p_entity='party_service_categories_master' then permission:='master_data.parties.manage_services';code_field:='category_code';name_field:='category_name_en';arabic_field:='category_name_ar';
 elsif p_entity='party_relationship_types' then permission:='master_data.parties.manage_relationships';code_field:='relationship_code';name_field:='name_en';arabic_field:='name_ar';
 else raise exception 'Unsupported catalogue' using errcode='22023';end if;
 if auth.uid() is null or not erp_private.business_principal_is_active() or not erp_private.permission_in_scope(permission,null,null) then
  raise exception 'Global catalogue permission required' using errcode='42501';end if;
 actor:=public.current_user_profile_id();
 if p_operation is null or jsonb_typeof(p_data) is distinct from 'object' or p_data='{}'::jsonb or octet_length(p_data::text)>16000
  or (p_id is null and p_revision is not null) or (p_id is not null and (p_id<1 or p_id>9007199254740991 or p_revision is null or p_revision<1)) then
  raise exception 'Invalid catalogue save identity' using errcode='22023';end if;
 allowed:=array[code_field,name_field,arabic_field,'description','is_active','sort_order'];
 if p_entity='party_service_categories_master' then allowed:=allowed||array['parent_category_id'];end if;
 if exists(select 1 from jsonb_object_keys(p_data) f where not(f=any(allowed))) then raise exception 'Protected catalogue fields' using errcode='22023';end if;
 if exists(select 1 from jsonb_each(p_data) e where
  (e.key in (code_field,name_field) and jsonb_typeof(e.value)<>'string') or
  (e.key in (arabic_field,'description') and jsonb_typeof(e.value) not in ('string','null')) or
  (e.key='is_active' and jsonb_typeof(e.value)<>'boolean') or
  (e.key='sort_order' and (jsonb_typeof(e.value)<>'number' or (e.value#>>'{}')::numeric<>trunc((e.value#>>'{}')::numeric) or (e.value#>>'{}')::numeric not between 0 and 2147483647)) or
  (e.key='parent_category_id' and jsonb_typeof(e.value)<>'null' and (jsonb_typeof(e.value)<>'number' or (e.value#>>'{}')::numeric<>trunc((e.value#>>'{}')::numeric) or (e.value#>>'{}')::numeric not between 1 and 9007199254740991))) then
  raise exception 'Use typed catalogue values' using errcode='22023';end if;
 h:=encode(sha256(convert_to(jsonb_build_array(p_entity,p_id,p_revision,p_data)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('f06-party-admin-master:'||auth.uid()::text||':'||p_operation::text,0));
 perform pg_advisory_xact_lock(hashtextextended('f06-geography-relations',0));
 perform pg_advisory_xact_lock(hashtextextended('f06-party-relations',0));
 perform pg_advisory_xact_lock(hashtextextended('f06-party-admin-masters-relations',0));
 select m.* into receipt from erp_private.master_lifecycle_receipts m where m.actor=auth.uid() and m.operation_id=p_operation;
 if found then
  if receipt.request_hash<>h or receipt.entity<>p_entity then raise exception 'Operation input changed' using errcode='22023';end if;
  execute format('select to_jsonb(t) from public.%I t where id=$1 for update',p_entity) into prior using receipt.record_id;
 else
  if p_id is not null then execute format('select to_jsonb(t) from public.%I t where id=$1 for update',p_entity) into prior using p_id;end if;
 end if;
 -- Admission and row locks may wait. Never replay or mutate using stale authority.
 if not erp_private.business_principal_is_active() or not erp_private.permission_in_scope(permission,null,null) then
  raise exception 'Global catalogue permission required' using errcode='42501';end if;
 if receipt.operation_id is not null then
  if prior is null then raise exception 'Catalogue record unavailable' using errcode='PT404';end if;
  return receipt.result||jsonb_build_object('replayed',true);
 end if;
 if p_id is not null then
  if prior is null then raise exception 'Catalogue record unavailable' using errcode='PT404';end if;
  if (prior->>'workspace_revision')::bigint<>p_revision then raise exception 'Catalogue record changed' using errcode='PT409';end if;
  if p_data?code_field and p_data->code_field is distinct from prior->code_field then raise exception 'Catalogue code is immutable' using errcode='22023';end if;
 end if;
 payload:=p_data;
 foreach k in array array[name_field,arabic_field,'description'] loop
  if jsonb_typeof(payload->k)='string' then payload:=jsonb_set(payload,array[k],case when k=name_field then to_jsonb(btrim(payload->>k)) else coalesce(to_jsonb(nullif(btrim(payload->>k),'')),'null'::jsonb) end);end if;
 end loop;
 candidate:=coalesce(prior,jsonb_build_object('is_active',true,'is_system',false,'sort_order',0))||payload;
 if candidate->>code_field is null or candidate->>name_field is null then raise exception 'Code and name are required' using errcode='22023';end if;
 changed:=p_id is null or exists(select 1 from jsonb_object_keys(payload) field_key where prior->field_key is distinct from candidate->field_key);
 if changed then
  candidate:=candidate||jsonb_build_object('updated_by',actor,'updated_at',clock_timestamp());
  if p_id is null then candidate:=candidate||jsonb_build_object('created_by',actor,'is_system',false);end if;
  if p_entity='party_service_categories_master' then
   if p_id is null then
    insert into public.party_service_categories_master(category_code,category_name_en,category_name_ar,parent_category_id,description,is_system,is_active,sort_order,created_by,updated_by)
     select r.category_code,r.category_name_en,r.category_name_ar,r.parent_category_id,r.description,false,r.is_active,r.sort_order,actor,actor from jsonb_populate_record(null::public.party_service_categories_master,candidate) r returning to_jsonb(party_service_categories_master.*) into saved;
   else
    update public.party_service_categories_master t set category_name_en=r.category_name_en,category_name_ar=r.category_name_ar,parent_category_id=r.parent_category_id,description=r.description,is_active=r.is_active,sort_order=r.sort_order,updated_by=actor,updated_at=clock_timestamp()
     from jsonb_populate_record(null::public.party_service_categories_master,candidate) r where t.id=p_id returning to_jsonb(t.*) into saved;
   end if;
  else
   if p_id is null then
    insert into public.party_relationship_types(relationship_code,name_en,name_ar,description,is_system,is_active,sort_order,created_by,updated_by)
     select r.relationship_code,r.name_en,r.name_ar,r.description,false,r.is_active,r.sort_order,actor,actor from jsonb_populate_record(null::public.party_relationship_types,candidate) r returning to_jsonb(party_relationship_types.*) into saved;
   else
    update public.party_relationship_types t set name_en=r.name_en,name_ar=r.name_ar,description=r.description,is_active=r.is_active,sort_order=r.sort_order,updated_by=actor,updated_at=clock_timestamp()
     from jsonb_populate_record(null::public.party_relationship_types,candidate) r where t.id=p_id returning to_jsonb(t.*) into saved;
   end if;
  end if;
  if saved is null then raise exception 'Catalogue record unavailable' using errcode='PT404';end if;
  insert into public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,entity_reference,action,old_values,new_values)
   values(actor,'master_data',p_entity,(saved->>'id')::bigint,saved->>code_field,case when p_id is null then 'create' when prior->'is_active' is distinct from saved->'is_active' then case when saved->>'is_active'='true' then 'activate' else 'deactivate' end else 'update' end,
    prior-array['created_at','updated_at'],(saved-array['created_at','updated_at'])||jsonb_build_object('operation_id',p_operation));
 else saved:=prior;end if;
 -- Audit/trigger locks can also wait: any later revocation rolls everything back.
 if not erp_private.business_principal_is_active() or not erp_private.permission_in_scope(permission,null,null) then raise exception 'Global catalogue permission required' using errcode='42501';end if;
 result:=jsonb_build_object('id',(saved->>'id')::bigint,'revision',saved->>'workspace_revision','changed',changed,'replayed',false);
 insert into erp_private.master_lifecycle_receipts(actor,operation_id,request_hash,entity,record_id,result) values(auth.uid(),p_operation,h,p_entity,(saved->>'id')::bigint,result);
 return result;
end$$;
alter function erp_private.save_party_admin_master(text,uuid,bigint,bigint,jsonb) owner to postgres;
revoke all on function erp_private.save_party_admin_master(text,uuid,bigint,bigint,jsonb) from public,anon,authenticated,service_role;
grant execute on function erp_private.save_party_admin_master(text,uuid,bigint,bigint,jsonb) to authenticated;
create function public.save_party_admin_master(p_entity text,p_operation uuid,p_id bigint,p_revision bigint,p_data jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select erp_private.save_party_admin_master(p_entity,p_operation,p_id,p_revision,p_data); $$;
alter function public.save_party_admin_master(text,uuid,bigint,bigint,jsonb) owner to postgres;
revoke all on function public.save_party_admin_master(text,uuid,bigint,bigint,jsonb) from public,anon,service_role;
grant execute on function public.save_party_admin_master(text,uuid,bigint,bigint,jsonb) to authenticated;

revoke insert,update,delete on public.party_service_categories_master,public.party_relationship_types from public,anon,authenticated;
do $$declare target text;columns text;begin
 foreach target in array array['party_service_categories_master','party_relationship_types'] loop
  select string_agg(quote_ident(attname),',' order by attnum) into columns from pg_attribute where attrelid=format('public.%I',target)::regclass and attnum>0 and not attisdropped;
  execute format('revoke insert (%s),update (%s) on public.%I from public,anon,authenticated',columns,columns,target);
  if has_table_privilege('authenticated',format('public.%I',target),'INSERT,UPDATE,DELETE') or has_any_column_privilege('authenticated',format('public.%I',target),'INSERT,UPDATE')
   or has_table_privilege('anon',format('public.%I',target),'INSERT,UPDATE,DELETE') or has_any_column_privilege('anon',format('public.%I',target),'INSERT,UPDATE') then raise exception 'Unexpected inherited catalogue write grant';end if;
 end loop;
end$$;
notify pgrst,'reload schema';
commit;
