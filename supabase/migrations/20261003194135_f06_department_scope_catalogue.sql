begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Label-only Department ownership catalogue. Base company/branch RLS is not
-- broadened: knowing a label never grants access to the underlying record.
-- No actor, company, table or SQL input can widen this projection.
create function erp_private.department_scope_catalogue() returns jsonb
language sql stable security definer set search_path='' as $$
 with permitted_branches as materialized (
  select b.id,b.owner_company_id,b.branch_name_en,b.branch_name_ar,b.branch_code,b.status,
   erp_private.master_permission('departments','manage',b.owner_company_id,b.id) as can_manage
  from public.branches b where (select erp_private.business_principal_is_active()) and (
   erp_private.master_permission('departments','view',b.owner_company_id,b.id)
   or erp_private.master_permission('departments','manage',b.owner_company_id,b.id))
 ), permitted_companies as materialized (
  select c.id,c.legal_name_en,c.company_code,c.status,
   erp_private.master_permission('departments','manage',c.id,null) as can_manage
  from public.owner_companies c where (select erp_private.business_principal_is_active()) and (
   erp_private.master_permission('departments','view',c.id,null)
   or erp_private.master_permission('departments','manage',c.id,null)
   or exists(select 1 from permitted_branches b where b.owner_company_id=c.id))
 )
 select jsonb_build_object(
  'companies',coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from permitted_companies c),'[]'::jsonb),
  'branches',coalesce((select jsonb_agg(to_jsonb(b) order by b.id) from permitted_branches b),'[]'::jsonb));
$$;
alter function erp_private.department_scope_catalogue() owner to postgres;
revoke all on function erp_private.department_scope_catalogue() from public,anon,service_role;
grant execute on function erp_private.department_scope_catalogue() to authenticated;

create function public.get_department_scope_catalogue() returns jsonb
language sql stable security invoker set search_path='' as $$
 select erp_private.department_scope_catalogue();
$$;
revoke all on function public.get_department_scope_catalogue() from public,anon,service_role;
grant execute on function public.get_department_scope_catalogue() to authenticated;
notify pgrst,'reload schema';
commit;
