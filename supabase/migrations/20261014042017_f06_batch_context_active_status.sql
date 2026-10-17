begin;

-- Companies and branches use status, while party eligibility uses is_active.
-- Correct only those two organization predicates; preserve locks and scope.
create or replace function erp_private.batch_fresh_context(company bigint,branch bigint,context jsonb,locking boolean)
returns boolean language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
begin
 if auth.uid() is null or not erp_private.batch_scope_allowed(public.current_user_profile_id(),company,branch) then return false;end if;
 if company is not null then
  if locking then perform 1 from public.owner_companies where id=company for share;end if;
  if not exists(select 1 from public.owner_companies where id=company and status='active') then return false;end if;
 end if;
 if branch is not null then
  if company is null then return false;end if;
  if locking then perform 1 from public.branches where id=branch for share;end if;
  if not exists(select 1 from public.branches where id=branch and owner_company_id=company and status='active') then return false;end if;
 end if;
 if locking then perform 1 from public.erp_ai_feature_flags where feature_code='DMS_BATCH_INTAKE' for share;end if;
 if not exists(select 1 from public.erp_ai_feature_flags where feature_code='DMS_BATCH_INTAKE' and is_enabled) then return false;end if;
 if context is distinct from 'null'::jsonb then
  if context->>'type' is distinct from 'party' or not erp_private.batch_integer(context->'id',1,9007199254740991) then return false;end if;
  -- Match the existing party read-policy capabilities before this narrow
  -- definer reads/locks a party. Invoker callers also verify actual row RLS.
  if not (public.current_user_has_permission('master_data.parties.view')
   or public.current_user_has_permission('master_data.party_master.view') or public.current_user_has_role('system_admin')) then return false;end if;
  if locking then perform 1 from public.parties where id=(context->>'id')::numeric::bigint for share;end if;
  if not exists(select 1 from public.parties where id=(context->>'id')::numeric::bigint and is_active and not is_locked) then return false;end if;
 end if;
 return erp_private.business_principal_is_active() and erp_private.batch_scope_allowed(public.current_user_profile_id(),company,branch);
end $$;
alter function erp_private.batch_fresh_context(bigint,bigint,jsonb,boolean) owner to postgres;
revoke all on function erp_private.batch_fresh_context(bigint,bigint,jsonb,boolean) from public,anon,service_role;
grant execute on function erp_private.batch_fresh_context(bigint,bigint,jsonb,boolean) to authenticated;

commit;
