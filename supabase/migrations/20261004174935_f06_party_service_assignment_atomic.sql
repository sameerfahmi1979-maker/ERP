-- F06: bounded party service assignment add/retire adapter. Catalogue62 is unchanged.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
alter table public.party_service_category_assignments add column workspace_revision bigint not null default 1;
create trigger f06_service_assignment_revision before insert or update on public.party_service_category_assignments
 for each row execute function erp_private.workspace_revision();

-- Trusted direct writers retain the same immutable assignment identity. The
-- existing62 BEFORE STATEMENT trigger already obtains all three domains first.
create function erp_private.service_assignment_identity() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.party_id is distinct from old.party_id or new.service_category_id is distinct from old.service_category_id then
  raise exception 'Service assignment identity is immutable' using errcode='22023';end if;
 return new;
end$$;
revoke all on function erp_private.service_assignment_identity() from public,anon,authenticated,service_role;
create trigger f06_service_assignment_identity before update on public.party_service_category_assignments
 for each row execute function erp_private.service_assignment_identity();

do $$declare predicate text;begin
 select pg_get_expr(conbin,conrelid) into strict predicate from pg_constraint where conrelid='erp_private.master_lifecycle_receipts'::regclass and conname='master_lifecycle_receipts_entity_check';
 alter table erp_private.master_lifecycle_receipts drop constraint master_lifecycle_receipts_entity_check;
 execute 'alter table erp_private.master_lifecycle_receipts add constraint master_lifecycle_receipts_entity_check check (('||predicate||') or entity=''party_service_category_assignments'')';
end$$;

create function erp_private.save_party_service_assignment(p_operation uuid,p_action text,p_party bigint,p_id bigint,p_revision bigint,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor bigint;h text;parent public.parties%rowtype;prior public.party_service_category_assignments%rowtype;saved public.party_service_category_assignments%rowtype;
 receipt erp_private.master_lifecycle_receipts%rowtype;category bigint;primary_value boolean;remarks_value text;active boolean;changed boolean;result jsonb;
begin
 if auth.uid() is null or not erp_private.business_principal_is_active()
  or not erp_private.permission_in_scope('master_data.parties.manage_services',null,null)
  or not erp_private.permission_in_scope('master_data.parties.view',null,null) then raise exception 'Shared party services permission required' using errcode='42501';end if;
 if p_operation is null or p_action is null or p_action not in ('add','remove') or p_party is null or p_party not between 1 and 9007199254740991
  or jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>20000
  or (p_action='add' and (p_id is not null or p_revision is not null))
  or (p_action='remove' and (p_id is null or p_id not between 1 and 9007199254740991 or p_revision is null or p_revision<1 or p_data<>'{}'::jsonb)) then
  raise exception 'Invalid service assignment contract' using errcode='22023';end if;
 if p_action='add' then
  if exists(select 1 from jsonb_object_keys(p_data) f where f not in ('service_category_id','is_primary','remarks'))
   or jsonb_typeof(p_data->'service_category_id') is distinct from 'number'
   or (p_data->>'service_category_id')::numeric<>trunc((p_data->>'service_category_id')::numeric)
   or (p_data->>'service_category_id')::numeric not between 1 and 9007199254740991
   or (p_data?'is_primary' and jsonb_typeof(p_data->'is_primary')<>'boolean')
   or (p_data?'remarks' and jsonb_typeof(p_data->'remarks') not in ('string','null')) then
   raise exception 'Invalid service assignment fields' using errcode='22023';end if;
  category:=(p_data->>'service_category_id')::bigint;
  primary_value:=coalesce((p_data->>'is_primary')::boolean,false);
  remarks_value:=nullif(btrim(p_data->>'remarks'),'');
  if coalesce(length(remarks_value),0)>4000 then raise exception 'Service remarks are too long' using errcode='22023';end if;
 end if;
 actor:=public.current_user_profile_id();
 h:=encode(sha256(convert_to(jsonb_build_array('party-service-assignment',p_action,p_party,p_id,p_revision,p_data)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('f06-master-lifecycle:'||auth.uid()::text||':'||p_operation::text,0));
 -- Match catalogue62 BEFORE STATEMENT ordering BEFORE taking any row lock.
 perform pg_advisory_xact_lock(hashtextextended('f06-geography-relations',0));
 perform pg_advisory_xact_lock(hashtextextended('f06-party-relations',0));
 perform pg_advisory_xact_lock(hashtextextended('f06-party-admin-masters-relations',0));
 select r.* into receipt from erp_private.master_lifecycle_receipts r where r.actor=auth.uid() and r.operation_id=p_operation;
 if found and (receipt.request_hash<>h or receipt.entity<>'party_service_category_assignments') then raise exception 'Operation input changed' using errcode='22023';end if;
 select * into parent from public.parties where id=p_party for update;
 if not found or (parent.is_locked and not exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id
  where ur.user_profile_id=actor and ur.is_active and r.is_active and ur.owner_company_id is null and ur.branch_id is null and r.role_code='system_admin')) then raise exception 'Party unavailable' using errcode='42501';end if;
 if receipt.operation_id is not null then
  select * into prior from public.party_service_category_assignments where id=receipt.record_id and party_id=p_party for update;
 elsif p_action='remove' then
  select * into prior from public.party_service_category_assignments where id=p_id and party_id=p_party for update;
 else
  select * into prior from public.party_service_category_assignments where party_id=p_party and service_category_id=category and is_active for update;
 end if;
 -- A child-row wait must not return a receipt under a revoked locked-party role.
 if not erp_private.business_principal_is_active()
  or not erp_private.permission_in_scope('master_data.parties.manage_services',null,null)
  or not erp_private.permission_in_scope('master_data.parties.view',null,null)
  or (parent.is_locked and not exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id
   where ur.user_profile_id=actor and ur.is_active and r.is_active and ur.owner_company_id is null and ur.branch_id is null and r.role_code='system_admin')) then raise exception 'Services permission changed' using errcode='42501';end if;
 if receipt.operation_id is not null then
  if prior.id is null then raise exception 'Service assignment unavailable' using errcode='PT404';end if;
  return receipt.result||jsonb_build_object('replayed',true);
 end if;
 if p_action='remove' then
  if prior.id is null then raise exception 'Service assignment unavailable' using errcode='PT404';end if;
  if prior.workspace_revision is distinct from p_revision then raise exception 'Service assignment changed' using errcode='PT409';end if;
  -- Retirement is allowed on an inactive parent/category: remove a dependency
  -- without reviving it. Locked-party authority still applies above and below.
  changed:=prior.is_active;
  if changed then
   update public.party_service_category_assignments set is_active=false,updated_at=clock_timestamp(),updated_by=actor where id=prior.id returning * into saved;
  else saved:=prior;end if;
 else
  if not parent.is_active then raise exception 'Choose an active party' using errcode='23503';end if;
  select is_active into active from public.party_service_categories_master where id=category for share;
  if active is distinct from true then raise exception 'Choose an active service category' using errcode='23503';end if;
  if prior.id is not null then
   if prior.is_primary is distinct from primary_value or prior.remarks is distinct from remarks_value then raise exception 'Service category already assigned with different details' using errcode='23505';end if;
   changed:=false;saved:=prior;
  else
   if primary_value and exists(select 1 from public.party_service_category_assignments where party_id=p_party and is_primary and is_active) then
    raise exception 'Another primary assignment exists; remove it explicitly first' using errcode='23505';end if;
   changed:=true;
   insert into public.party_service_category_assignments(party_id,service_category_id,is_primary,is_active,remarks,created_by,updated_by)
    values(p_party,category,primary_value,true,remarks_value,actor,actor) returning * into saved;
  end if;
 end if;
 if changed then
  insert into public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
   values(actor,'MASTER_DATA','party_service_category_assignments',saved.id,'party_'||p_party||'_svc_'||saved.service_category_id,
    case when p_action='add' then 'create' else 'deactivate' end,
    jsonb_build_object('operation_id',p_operation,'revision',saved.workspace_revision,'party_id',p_party,'service_category_id',saved.service_category_id,'is_primary',saved.is_primary,'is_active',saved.is_active));
 end if;
 -- Category/audit waits can happen after admission. Recheck the identical role
 -- condition here: denial rolls mutation and audit back together.
 if not erp_private.business_principal_is_active()
  or not erp_private.permission_in_scope('master_data.parties.manage_services',null,null)
  or not erp_private.permission_in_scope('master_data.parties.view',null,null)
  or (parent.is_locked and not exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id
   where ur.user_profile_id=actor and ur.is_active and r.is_active and ur.owner_company_id is null and ur.branch_id is null and r.role_code='system_admin')) then raise exception 'Services permission changed' using errcode='42501';end if;
 result:=jsonb_build_object('id',saved.id,'party_id',p_party,'service_category_id',saved.service_category_id,'revision',saved.workspace_revision::text,'is_active',saved.is_active,'changed',changed,'replayed',false);
 insert into erp_private.master_lifecycle_receipts(actor,operation_id,request_hash,entity,record_id,result)
  values(auth.uid(),p_operation,h,'party_service_category_assignments',saved.id,result);
 return result;
end$$;
alter function erp_private.save_party_service_assignment(uuid,text,bigint,bigint,bigint,jsonb) owner to postgres;
revoke all on function erp_private.save_party_service_assignment(uuid,text,bigint,bigint,bigint,jsonb) from public,anon,authenticated,service_role;
grant execute on function erp_private.save_party_service_assignment(uuid,text,bigint,bigint,bigint,jsonb) to authenticated;
create function public.save_party_service_assignment(p_operation uuid,p_action text,p_party bigint,p_id bigint,p_revision bigint,p_data jsonb)
returns jsonb language sql security invoker set search_path='' as $$select erp_private.save_party_service_assignment(p_operation,p_action,p_party,p_id,p_revision,p_data);$$;
alter function public.save_party_service_assignment(uuid,text,bigint,bigint,bigint,jsonb) owner to postgres;
revoke all on function public.save_party_service_assignment(uuid,text,bigint,bigint,bigint,jsonb) from public,anon,service_role;
grant execute on function public.save_party_service_assignment(uuid,text,bigint,bigint,bigint,jsonb) to authenticated;
revoke insert,update,delete on public.party_service_category_assignments from public,anon,authenticated;
do $$declare columns text;begin
 select string_agg(quote_ident(attname),',' order by attnum) into columns from pg_attribute where attrelid='public.party_service_category_assignments'::regclass and attnum>0 and not attisdropped;
 execute format('revoke insert (%s),update (%s) on public.party_service_category_assignments from public,anon,authenticated',columns,columns);
 if has_table_privilege('authenticated','public.party_service_category_assignments','INSERT,UPDATE,DELETE') or has_any_column_privilege('authenticated','public.party_service_category_assignments','INSERT,UPDATE')
  or has_table_privilege('anon','public.party_service_category_assignments','INSERT,UPDATE,DELETE') or has_any_column_privilege('anon','public.party_service_category_assignments','INSERT,UPDATE') then raise exception 'Unexpected inherited service assignment write grant';end if;
end$$;
notify pgrst,'reload schema';
commit;
