-- F06: one actor/request-bound finance transaction; no new finance authority.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
alter table public.party_finance_profiles add column workspace_revision bigint not null default 1;
create trigger f06_finance_revision before insert or update on public.party_finance_profiles for each row execute function erp_private.workspace_revision();
create trigger f06_finance_domain before insert or update or delete on public.party_finance_profiles for each statement execute function erp_private.lock_party_relations();
do $$declare predicate text;begin
 select pg_get_expr(conbin,conrelid) into strict predicate from pg_constraint where conrelid='erp_private.master_lifecycle_receipts'::regclass and conname='master_lifecycle_receipts_entity_check';
 alter table erp_private.master_lifecycle_receipts drop constraint master_lifecycle_receipts_entity_check;
 execute 'alter table erp_private.master_lifecycle_receipts add constraint master_lifecycle_receipts_entity_check check (('||predicate||') or entity=''party_finance_profiles'')';
end$$;

create function erp_private.save_party_finance_profile(p_operation uuid,p_party_id bigint,p_revision bigint,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 prior public.party_finance_profiles%rowtype;candidate public.party_finance_profiles%rowtype;saved public.party_finance_profiles%rowtype;
 parent public.parties%rowtype;receipt erp_private.master_lifecycle_receipts%rowtype;
 actor bigint;h text;payload jsonb;k text;result jsonb;changed boolean;target text;ref_id bigint;active boolean;
 allowed text[]:=array['default_currency_id','default_payment_term_id','default_payment_method_id','credit_limit','credit_currency_id','finance_hold','finance_hold_reason','finance_remarks'];
begin
 if auth.uid() is null or not erp_private.business_principal_is_active()
  or not erp_private.permission_in_scope('master_data.parties.edit',null,null)
  or not erp_private.permission_in_scope('master_data.parties.view',null,null) then raise exception 'Shared party finance permission required' using errcode='42501';end if;
 if p_operation is null or p_party_id is null or p_party_id not between 1 and 9007199254740991
  or (p_revision is not null and p_revision<1) or jsonb_typeof(p_data) is distinct from 'object'
  or p_data='{}'::jsonb or octet_length(p_data::text)>20000 then raise exception 'Invalid finance save contract' using errcode='22023';end if;
 if exists(select 1 from jsonb_object_keys(p_data) f where not(f=any(allowed))) then raise exception 'Protected finance fields' using errcode='22023';end if;
 if exists(select 1 from jsonb_each(p_data) e where
  (e.key='finance_hold' and jsonb_typeof(e.value)<>'boolean') or
  (e.key in ('finance_hold_reason','finance_remarks') and jsonb_typeof(e.value) not in ('string','null')) or
  (e.key in ('default_currency_id','credit_currency_id','default_payment_term_id','default_payment_method_id') and jsonb_typeof(e.value)<>'null' and
    (jsonb_typeof(e.value)<>'number' or (e.value#>>'{}')::numeric<>trunc((e.value#>>'{}')::numeric) or (e.value#>>'{}')::numeric not between 1 and 9007199254740991)) or
  (e.key='credit_limit' and jsonb_typeof(e.value)<>'null' and (jsonb_typeof(e.value)<>'number' or
    (e.value#>>'{}')::numeric<0 or (e.value#>>'{}')::numeric>=100000000000000 or
    (e.value#>>'{}')::numeric<>round((e.value#>>'{}')::numeric,4)))) then raise exception 'Use typed finance values with at most four decimal places' using errcode='22023';end if;
 actor:=public.current_user_profile_id();
 h:=encode(sha256(convert_to(jsonb_build_array('party-finance-save',p_party_id,p_revision,p_data)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('f06-master-lifecycle:'||auth.uid()::text||':'||p_operation::text,0));
 perform pg_advisory_xact_lock(hashtextextended('f06-geography-relations',0));
 perform pg_advisory_xact_lock(hashtextextended('f06-party-relations',0));
 select r.* into receipt from erp_private.master_lifecycle_receipts r where r.actor=auth.uid() and r.operation_id=p_operation;
 if found and (receipt.request_hash<>h or receipt.entity<>'party_finance_profiles') then raise exception 'Operation input changed' using errcode='22023';end if;
 -- Parent lock serializes first-profile creation when no child row exists yet.
 select * into parent from public.parties where id=p_party_id for update;
 if not found or (parent.is_locked and not exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id
  where ur.user_profile_id=actor and ur.is_active and r.is_active and ur.owner_company_id is null and ur.branch_id is null and r.role_code='system_admin')) then raise exception 'Party unavailable' using errcode='42501';end if;
 select * into prior from public.party_finance_profiles where party_id=p_party_id for update;
 if not erp_private.business_principal_is_active()
  or not erp_private.permission_in_scope('master_data.parties.edit',null,null)
  or not erp_private.permission_in_scope('master_data.parties.view',null,null)
  or (parent.is_locked and not exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id
   where ur.user_profile_id=actor and ur.is_active and r.is_active and ur.owner_company_id is null and ur.branch_id is null and r.role_code='system_admin')) then raise exception 'Finance permission changed' using errcode='42501';end if;
 if receipt.operation_id is not null then
  if prior.id is distinct from receipt.record_id then raise exception 'Finance profile unavailable' using errcode='PT404';end if;
  return receipt.result||jsonb_build_object('replayed',true);
 end if;
 if not parent.is_active then raise exception 'Reactivate the parent before changing finance details' using errcode='23503';end if;
 if (prior.id is null and p_revision is not null) or (prior.id is not null and prior.workspace_revision is distinct from p_revision) then raise exception 'Finance profile changed' using errcode='PT409';end if;
 payload:=p_data;
 foreach k in array array['finance_hold_reason','finance_remarks'] loop
  if jsonb_typeof(payload->k)='string' then payload:=jsonb_set(payload,array[k],coalesce(to_jsonb(nullif(btrim(payload->>k),'')),'null'::jsonb));end if;
 end loop;
 candidate:=jsonb_populate_record(prior,case when prior.id is null then jsonb_build_object('finance_hold',false)||payload else payload end);
 if coalesce(length(candidate.finance_hold_reason),0)>2000 or coalesce(length(candidate.finance_remarks),0)>4000
  or (candidate.finance_hold and nullif(btrim(candidate.finance_hold_reason),'') is null) then raise exception 'A finance hold requires a reason; text is too long or incomplete' using errcode='23514';end if;
 -- New references must be active; unchanged inactive references retain history.
 for ref_id in select distinct v from unnest(array[
  case when candidate.default_currency_id is distinct from prior.default_currency_id then candidate.default_currency_id end,
  case when candidate.credit_currency_id is distinct from prior.credit_currency_id then candidate.credit_currency_id end]) v where v is not null order by v loop
  select is_active into active from public.currencies where id=ref_id for share;
  if active is distinct from true then raise exception 'Choose an active currency' using errcode='23503';end if;
 end loop;
 foreach k in array array['default_payment_term_id','default_payment_method_id'] loop
  if to_jsonb(candidate)->k is distinct from to_jsonb(prior)->k and to_jsonb(candidate)->>k is not null then
   target:=case k when 'default_payment_term_id' then 'payment_terms' else 'payment_methods' end;
   execute format('select is_active from public.%I where id=$1 for share',target) into active using (to_jsonb(candidate)->>k)::bigint;
   if active is distinct from true then raise exception 'Choose an active payment reference' using errcode='23503';end if;
  end if;
 end loop;
 changed:=prior.id is null or exists(select 1 from jsonb_object_keys(payload) f where to_jsonb(prior)->f is distinct from to_jsonb(candidate)->f);
 if changed then
  if candidate.finance_hold is distinct from coalesce(prior.finance_hold,false) then
   candidate.finance_hold_by:=case when candidate.finance_hold then actor else null end;
   candidate.finance_hold_at:=case when candidate.finance_hold then clock_timestamp() else null end;
  end if;
  if prior.id is null then
   insert into public.party_finance_profiles(party_id,default_currency_id,default_payment_term_id,default_payment_method_id,credit_limit,credit_currency_id,finance_hold,finance_hold_reason,finance_hold_by,finance_hold_at,finance_remarks,created_by,updated_by)
    values(p_party_id,candidate.default_currency_id,candidate.default_payment_term_id,candidate.default_payment_method_id,candidate.credit_limit,candidate.credit_currency_id,candidate.finance_hold,candidate.finance_hold_reason,candidate.finance_hold_by,candidate.finance_hold_at,candidate.finance_remarks,actor,actor) returning * into saved;
  else
   update public.party_finance_profiles set default_currency_id=candidate.default_currency_id,default_payment_term_id=candidate.default_payment_term_id,
    default_payment_method_id=candidate.default_payment_method_id,credit_limit=candidate.credit_limit,credit_currency_id=candidate.credit_currency_id,
    finance_hold=candidate.finance_hold,finance_hold_reason=candidate.finance_hold_reason,finance_hold_by=candidate.finance_hold_by,finance_hold_at=candidate.finance_hold_at,
    finance_remarks=candidate.finance_remarks,updated_by=actor,updated_at=clock_timestamp() where id=prior.id returning * into saved;
  end if;
  insert into public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
   values(actor,'MASTER_DATA','party_finance_profiles',saved.id,'party_'||p_party_id||'_finance',case when prior.id is null then 'create' else 'update' end,
    jsonb_build_object('operation_id',p_operation,'revision',saved.workspace_revision,'fields',(select jsonb_agg(f order by f)from jsonb_object_keys(payload)f where to_jsonb(prior)->f is distinct from to_jsonb(candidate)->f)));
 else saved:=prior;end if;
 -- Late lookup/audit waits cannot admit a revoked user using an earlier check.
 if not erp_private.business_principal_is_active()
  or not erp_private.permission_in_scope('master_data.parties.edit',null,null)
  or not erp_private.permission_in_scope('master_data.parties.view',null,null)
  or (parent.is_locked and not exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id
   where ur.user_profile_id=actor and ur.is_active and r.is_active and ur.owner_company_id is null and ur.branch_id is null and r.role_code='system_admin')) then raise exception 'Finance permission changed' using errcode='42501';end if;
 result:=jsonb_build_object('id',saved.id,'revision',saved.workspace_revision::text,'changed',changed,'replayed',false);
 insert into erp_private.master_lifecycle_receipts(actor,operation_id,request_hash,entity,record_id,result) values(auth.uid(),p_operation,h,'party_finance_profiles',saved.id,result);
 return result;
end$$;
alter function erp_private.save_party_finance_profile(uuid,bigint,bigint,jsonb) owner to postgres;
revoke all on function erp_private.save_party_finance_profile(uuid,bigint,bigint,jsonb) from public,anon,authenticated,service_role;
grant execute on function erp_private.save_party_finance_profile(uuid,bigint,bigint,jsonb) to authenticated;
create function public.save_party_finance_profile(p_operation uuid,p_party_id bigint,p_revision bigint,p_data jsonb)
returns jsonb language sql security invoker set search_path='' as $$select erp_private.save_party_finance_profile(p_operation,p_party_id,p_revision,p_data);$$;
alter function public.save_party_finance_profile(uuid,bigint,bigint,jsonb) owner to postgres;
revoke all on function public.save_party_finance_profile(uuid,bigint,bigint,jsonb) from public,anon,service_role;
grant execute on function public.save_party_finance_profile(uuid,bigint,bigint,jsonb) to authenticated;
revoke insert,update,delete on public.party_finance_profiles from public,anon,authenticated;
do $$declare columns text;begin
 select string_agg(quote_ident(attname),',' order by attnum) into columns from pg_attribute where attrelid='public.party_finance_profiles'::regclass and attnum>0 and not attisdropped;
 execute format('revoke insert (%s),update (%s) on public.party_finance_profiles from public,anon,authenticated',columns,columns);
 if has_table_privilege('authenticated','public.party_finance_profiles','INSERT,UPDATE,DELETE') or has_any_column_privilege('authenticated','public.party_finance_profiles','INSERT,UPDATE')
  or has_table_privilege('anon','public.party_finance_profiles','INSERT,UPDATE,DELETE') or has_any_column_privilege('anon','public.party_finance_profiles','INSERT,UPDATE') then raise exception 'Unexpected inherited finance write grant';end if;
end$$;
notify pgrst,'reload schema';
commit;
