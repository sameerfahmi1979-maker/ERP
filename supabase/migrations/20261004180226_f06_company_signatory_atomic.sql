-- F06-T01/T06: existing GLOBAL capability ORs, retained child history, atomic receipt/audit.
-- Does not confer signing authority, impose primary/name uniqueness, or restrict inactive companies.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
alter table public.owner_company_signatories add column workspace_revision bigint not null default 1;
create trigger f06_signatory_revision before insert or update on public.owner_company_signatories for each row execute function erp_private.workspace_revision();
create index if not exists idx_f06_signatory_company_cursor on public.owner_company_signatories(company_id,id);
do $$declare predicate text;begin
 select pg_get_expr(conbin,conrelid) into strict predicate from pg_constraint where conrelid='erp_private.master_lifecycle_receipts'::regclass and conname='master_lifecycle_receipts_entity_check';
 alter table erp_private.master_lifecycle_receipts drop constraint master_lifecycle_receipts_entity_check;
 execute 'alter table erp_private.master_lifecycle_receipts add constraint master_lifecycle_receipts_entity_check check (('||predicate||') or entity=''owner_company_signatories'')';
end$$;

create function erp_private.company_signatory_admitted(p_write boolean) returns boolean
language sql security definer set search_path='' as $$
 select auth.uid() is not null and erp_private.business_principal_is_active()
  and (erp_private.permission_in_scope('common_md.view',null,null) or erp_private.permission_in_scope('common_md.organizations.view',null,null) or erp_private.permission_in_scope('organizations.view',null,null))
  and (not p_write or erp_private.permission_in_scope('common_md.manage',null,null) or erp_private.permission_in_scope('common_md.organizations.manage',null,null) or erp_private.permission_in_scope('organizations.manage',null,null));
$$;
alter function erp_private.company_signatory_admitted(boolean) owner to postgres;
revoke all on function erp_private.company_signatory_admitted(boolean) from public,anon,authenticated,service_role;

create function erp_private.guard_company_signatory_identity() returns trigger
language plpgsql security definer set search_path='' as $$begin
 if new.company_id is distinct from old.company_id or new.id is distinct from old.id then raise exception 'Signatory company binding is immutable' using errcode='23514';end if;
 return new;
end$$;
alter function erp_private.guard_company_signatory_identity() owner to postgres;
revoke all on function erp_private.guard_company_signatory_identity() from public,anon,authenticated,service_role;
create trigger f06_signatory_identity before update on public.owner_company_signatories for each row execute function erp_private.guard_company_signatory_identity();

-- Projection avoids requiring organization read permission in addition to the
-- existing common-master read OR. A missing parent is not a successful empty list.
create function erp_private.read_company_signatories(p_company_id bigint,p_after bigint,p_limit integer)
returns setof public.owner_company_signatories language plpgsql security definer set search_path='' as $$begin
 if not erp_private.company_signatory_admitted(false) then raise exception 'Global signatory read permission required' using errcode='42501';end if;
 if p_company_id is null or p_company_id not between 1 and 9007199254740991 or p_after is null or p_after not between 0 and 9007199254740991 or p_limit is null or p_limit not between 1 and 200 then raise exception 'Invalid signatory read request' using errcode='22023';end if;
 if not exists(select 1 from public.owner_companies where id=p_company_id) then raise exception 'Company unavailable' using errcode='PT404';end if;
 return query select s.* from public.owner_company_signatories s where s.company_id=p_company_id and s.id>p_after order by s.id limit p_limit;
end$$;
alter function erp_private.read_company_signatories(bigint,bigint,integer) owner to postgres;
revoke all on function erp_private.read_company_signatories(bigint,bigint,integer) from public,anon,authenticated,service_role;
grant execute on function erp_private.read_company_signatories(bigint,bigint,integer) to authenticated;
create function public.read_company_signatories(p_company_id bigint,p_after bigint default 0,p_limit integer default 200)
returns setof public.owner_company_signatories language sql security invoker set search_path='' as $$select * from erp_private.read_company_signatories(p_company_id,p_after,p_limit);$$;
alter function public.read_company_signatories(bigint,bigint,integer) owner to postgres;
revoke all on function public.read_company_signatories(bigint,bigint,integer) from public,anon,service_role;
grant execute on function public.read_company_signatories(bigint,bigint,integer) to authenticated;

create function erp_private.save_company_signatory(p_operation uuid,p_company_id bigint,p_id bigint,p_revision bigint,p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 prior public.owner_company_signatories%rowtype;candidate public.owner_company_signatories%rowtype;saved public.owner_company_signatories%rowtype;
 receipt erp_private.master_lifecycle_receipts%rowtype; actor bigint;h text;payload jsonb;k text;result jsonb;changed boolean;
 allowed text[]:=array['full_name','user_id','designation','signature_scope','is_primary','is_active','effective_from','effective_to','notes'];
 required text[]:=array['full_name','designation','signature_scope','is_primary','is_active','effective_from','effective_to','notes'];
begin
 if not erp_private.company_signatory_admitted(true) then raise exception 'Global signatory read and management permission required' using errcode='42501';end if;
 if p_operation is null or p_company_id is null or p_company_id not between 1 and 9007199254740991
  or (p_id is not null and p_id not between 1 and 9007199254740991) or (p_revision is not null and p_revision<1)
  or ((p_id is null)<>(p_revision is null)) or p_action is null or p_action not in ('save','archive','restore')
  or (p_id is null and p_action<>'save') or jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>20000
  then raise exception 'Invalid signatory save contract' using errcode='22023';end if;
 if p_action<>'save' and p_data<>'{}'::jsonb then raise exception 'Lifecycle fields are protected' using errcode='22023';end if;
 if p_action='save' then
  if not(p_data ?& required) or exists(select 1 from jsonb_object_keys(p_data) f where not(f=any(allowed))) then raise exception 'Incomplete or protected signatory fields' using errcode='22023';end if;
  if jsonb_typeof(p_data->'full_name')<>'string' or jsonb_typeof(p_data->'is_primary')<>'boolean' or jsonb_typeof(p_data->'is_active')<>'boolean'
   or exists(select 1 from jsonb_each(p_data) e where e.key in ('designation','signature_scope','effective_from','effective_to','notes') and jsonb_typeof(e.value) not in ('string','null'))
   or (p_data ? 'user_id' and jsonb_typeof(p_data->'user_id')<>'null' and (jsonb_typeof(p_data->'user_id')<>'number'
     or (p_data->>'user_id')::numeric<>trunc((p_data->>'user_id')::numeric) or (p_data->>'user_id')::numeric not between 1 and 9007199254740991)) then raise exception 'Use typed signatory values' using errcode='22023';end if;
  foreach k in array array['effective_from','effective_to'] loop
   if p_data->>k is not null and (p_data->>k !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or substring(p_data->>k,1,4)::integer<1 or to_char((p_data->>k)::date,'YYYY-MM-DD')<>p_data->>k) then raise exception 'Invalid signatory calendar date' using errcode='22023';end if;
  end loop;
 end if;
 actor:=public.current_user_profile_id();
 h:=encode(sha256(convert_to(jsonb_build_array('company-signatory',p_company_id,p_id,p_revision,p_action,p_data)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('f06-master-lifecycle:'||auth.uid()::text||':'||p_operation::text,0));
 -- Match administration lock order before taking the ordinary parent row lock.
 perform pg_advisory_xact_lock(hashtextextended('f06-geography-relations',0));
 perform pg_advisory_xact_lock(hashtextextended('f06-finance-relationships',0));
 select r.* into receipt from erp_private.master_lifecycle_receipts r where r.actor=auth.uid() and r.operation_id=p_operation;
 if found and (receipt.request_hash<>h or receipt.entity<>'owner_company_signatories') then raise exception 'Operation input changed' using errcode='22023';end if;
 perform 1 from public.owner_companies where id=p_company_id for update;
 if not found then raise exception 'Company unavailable' using errcode='PT404';end if;
 select * into prior from public.owner_company_signatories where id=coalesce(p_id,receipt.record_id) for update;
 if (p_id is not null or receipt.record_id is not null) and (prior.id is null or prior.company_id<>p_company_id) then raise exception 'Signatory unavailable for this company' using errcode='PT404';end if;
 if not erp_private.company_signatory_admitted(true) then raise exception 'Signatory permission changed' using errcode='42501';end if;
 if receipt.operation_id is not null then return receipt.result||jsonb_build_object('replayed',true);end if;
 if prior.id is not null and prior.workspace_revision is distinct from p_revision then raise exception 'Signatory changed' using errcode='PT409';end if;
 if p_action='save' then
  if prior.deleted_at is not null then raise exception 'Restore this signatory before editing' using errcode='23514';end if;
  payload:=p_data;
  foreach k in array array['full_name','designation','signature_scope','notes'] loop
   if jsonb_typeof(payload->k)='string' then payload:=jsonb_set(payload,array[k],coalesce(to_jsonb(nullif(regexp_replace(payload->>k,'^[[:space:]]+|[[:space:]]+$','','g'),'')),'null'::jsonb));end if;
  end loop;
  candidate:=jsonb_populate_record(prior,payload);
  if candidate.full_name is null or length(candidate.full_name)>200 or coalesce(length(candidate.designation),0)>200
   or coalesce(length(candidate.signature_scope),0)>500 or coalesce(length(candidate.notes),0)>2000
   or (candidate.effective_from is not null and candidate.effective_to is not null and candidate.effective_to<candidate.effective_from) then raise exception 'Invalid signatory fields or dates' using errcode='23514';end if;
  -- user_id is a reference only: no membership or signing authority is inferred.
  if candidate.user_id is not null and candidate.user_id is distinct from prior.user_id then
   perform 1 from public.user_profiles where id=candidate.user_id for key share;
   if not found then raise exception 'Referenced user unavailable' using errcode='23503';end if;
  end if;
  changed:=prior.id is null or exists(select 1 from jsonb_object_keys(payload) f where to_jsonb(prior)->f is distinct from to_jsonb(candidate)->f);
 else
  candidate:=prior;
  if p_action='archive' then candidate.deleted_at:=coalesce(prior.deleted_at,clock_timestamp());candidate.is_active:=false;
  else candidate.deleted_at:=null;end if;
  -- Restore retains the inactive state; activation is a separate explicit edit.
  changed:=candidate.deleted_at is distinct from prior.deleted_at or candidate.is_active is distinct from prior.is_active;
 end if;
 if changed then
  if prior.id is null then
   insert into public.owner_company_signatories(company_id,user_id,full_name,designation,signature_scope,is_primary,is_active,effective_from,effective_to,notes,created_by,updated_by)
    values(p_company_id,candidate.user_id,candidate.full_name,candidate.designation,candidate.signature_scope,candidate.is_primary,candidate.is_active,candidate.effective_from,candidate.effective_to,candidate.notes,actor,actor) returning * into saved;
  else
   update public.owner_company_signatories set user_id=candidate.user_id,full_name=candidate.full_name,designation=candidate.designation,signature_scope=candidate.signature_scope,
    is_primary=candidate.is_primary,is_active=candidate.is_active,effective_from=candidate.effective_from,effective_to=candidate.effective_to,notes=candidate.notes,
    deleted_at=candidate.deleted_at,updated_by=actor,updated_at=clock_timestamp() where id=prior.id returning * into saved;
  end if;
  insert into public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,entity_reference,owner_company_id,action,old_values,new_values)
   values(actor,'COMMON_MD','owner_company_signatories',saved.id,'company_'||p_company_id||'_signatory_'||saved.id,p_company_id,
    case when prior.id is null then 'create' when p_action='archive' then 'delete' else 'update' end,
    case when prior.id is null then null else jsonb_build_object('revision',prior.workspace_revision,'archived',prior.deleted_at is not null) end,
    jsonb_build_object('operation_id',p_operation,'operation',p_action,'revision',saved.workspace_revision,'archived',saved.deleted_at is not null,
      'fields',case when p_action='save' then (select jsonb_agg(f order by f) from jsonb_object_keys(payload) f where to_jsonb(prior)->f is distinct from to_jsonb(candidate)->f) else jsonb_build_array('deleted_at','is_active') end));
 else saved:=prior;end if;
 if not erp_private.company_signatory_admitted(true) then raise exception 'Signatory permission changed' using errcode='42501';end if;
 result:=jsonb_build_object('id',saved.id,'revision',saved.workspace_revision::text,'changed',changed,'replayed',false);
 insert into erp_private.master_lifecycle_receipts(actor,operation_id,request_hash,entity,record_id,result) values(auth.uid(),p_operation,h,'owner_company_signatories',saved.id,result);
 return result;
end$$;
alter function erp_private.save_company_signatory(uuid,bigint,bigint,bigint,text,jsonb) owner to postgres;
revoke all on function erp_private.save_company_signatory(uuid,bigint,bigint,bigint,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function erp_private.save_company_signatory(uuid,bigint,bigint,bigint,text,jsonb) to authenticated;
create function public.save_company_signatory(p_operation uuid,p_company_id bigint,p_id bigint,p_revision bigint,p_action text,p_data jsonb)
returns jsonb language sql security invoker set search_path='' as $$select erp_private.save_company_signatory(p_operation,p_company_id,p_id,p_revision,p_action,p_data);$$;
alter function public.save_company_signatory(uuid,bigint,bigint,bigint,text,jsonb) owner to postgres;
revoke all on function public.save_company_signatory(uuid,bigint,bigint,bigint,text,jsonb) from public,anon,service_role;
grant execute on function public.save_company_signatory(uuid,bigint,bigint,bigint,text,jsonb) to authenticated;
revoke insert,update,delete on public.owner_company_signatories from public,anon,authenticated;
do $$declare columns text;begin
 select string_agg(quote_ident(attname),',' order by attnum) into columns from pg_attribute where attrelid='public.owner_company_signatories'::regclass and attnum>0 and not attisdropped;
 execute format('revoke insert (%s),update (%s) on public.owner_company_signatories from public,anon,authenticated',columns,columns);
 if has_table_privilege('authenticated','public.owner_company_signatories','INSERT,UPDATE,DELETE') or has_any_column_privilege('authenticated','public.owner_company_signatories','INSERT,UPDATE')
  or has_table_privilege('anon','public.owner_company_signatories','INSERT,UPDATE,DELETE') or has_any_column_privilege('anon','public.owner_company_signatories','INSERT,UPDATE') then raise exception 'Unexpected inherited signatory write grant';end if;
end$$;
notify pgrst,'reload schema';
commit;
