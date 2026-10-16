begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Active was previously an unconditional read predicate, including anonymous
-- clients. Company/branch metadata must obey the assignment's own scope.
-- Keep active, genuinely GLOBAL centres available as legacy shared lookups to
-- active ERP principals. This is not authority to open the administration page.
-- No role grants, company mappings, record updates or cache framework changes.
do $$declare t text;policy_name text;boundary text;begin
 foreach t in array array['cost_centers','profit_centers'] loop
  policy_name:='select_'||t||'_authenticated';
  if not exists(select 1 from pg_policies where schemaname='public' and tablename=t and policyname=policy_name and cmd='SELECT') then
   raise exception 'Expected finance read policy is missing: %',t;
  end if;
  boundary:=$predicate$
   (select erp_private.business_principal_is_active()) and (
    (is_active and owner_company_id is null and branch_id is null)
    or erp_private.permission_in_scope('master_data.finance_basics.view',owner_company_id,branch_id)
    or erp_private.permission_in_scope('master_data.finance_basics.manage',null,null)
    or erp_private.permission_in_scope('master_data.lookups.lock',null,null)
   )
  $predicate$;
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke select on public.%I from public,anon',t);
  execute format('alter policy %I on public.%I to authenticated using (%s)',policy_name,t,boundary);
  -- Restrictive guard composes with any additional permissive policies; a later
  -- broad policy cannot silently reopen other-company records.
  execute format('create policy f06_finance_read_scope on public.%I as restrictive for select to authenticated using (%s)',t,boundary);
 end loop;
end$$;
notify pgrst,'reload schema';
commit;
