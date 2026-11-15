begin;
set local lock_timeout = '5s';

-- Use the existing exact-tuple predicate once per distinct owner/branch,
-- including global and company-only authority where it already applies.
create function erp_private.phase3_readable_work_sites()
returns setof bigint language sql stable security definer set search_path = '' as $$
  with scopes as materialized (
    select distinct s.owner_company_id, s.branch_id from public.work_sites s where s.deleted_at is null
  ), permitted as materialized (
    select s.owner_company_id, s.branch_id from scopes s
    where erp_private.administrator_work_site_permission('view',s.owner_company_id,s.branch_id)
  )
  select s.id from public.work_sites s join permitted p on p.owner_company_id=s.owner_company_id
    and p.branch_id is not distinct from s.branch_id where s.deleted_at is null;
$$;
revoke all on function erp_private.phase3_readable_work_sites() from public, anon, authenticated, service_role;
grant execute on function erp_private.phase3_readable_work_sites() to authenticated;
alter policy administrator_work_site_read on public.work_sites using (
  deleted_at is null and id in (select erp_private.phase3_readable_work_sites())
);
notify pgrst, 'reload schema';
commit;
