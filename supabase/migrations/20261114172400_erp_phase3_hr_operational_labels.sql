begin;
set local lock_timeout = '5s';

create function erp_private.phase3_hr_operational_label(p_kind text, p_employee bigint, p_record bigint)
returns jsonb language sql stable security definer set search_path = '' as $$
  with subject as materialized (
    select e.id, e.owner_company_id, e.branch_id, e.department_id, e.primary_work_site_id
    from public.employees e
    where e.id=p_employee and e.deleted_at is null and erp_private.business_principal_is_active()
      and case when p_kind in ('employee-site','employee-department')
        then e.id in (select erp_private.readable_employee_ids())
        else public.current_user_can_view_employee_operations(e.id) end
  ), references_in_scope as (
    select e.owner_company_id, e.branch_id,
      case p_kind
        when 'employee-site' then e.primary_work_site_id
        when 'employee-department' then e.department_id
        when 'assignment-site' then a.work_site_id
        when 'assignment-department' then a.department_id
        when 'readiness-site' then r.work_site_id end as id
    from subject e
    left join public.employee_assignments a on p_kind in ('assignment-site','assignment-department') and a.id=p_record and a.employee_id=e.id and a.deleted_at is null
    left join public.employee_site_readiness r on p_kind='readiness-site' and r.id=p_record and r.employee_id=e.id and r.deleted_at is null
  ), label as (
    select s.id, s.site_name as name_en
    from references_in_scope e join public.work_sites s on s.id=e.id and s.deleted_at is null
    where p_kind in ('employee-site','assignment-site','readiness-site') and (
      s.available_to_all_organizations or erp_private.administrator_work_site_permission('view',s.owner_company_id,s.branch_id))
    union all
    select d.id, d.department_name_en
    from references_in_scope e join public.departments d on d.id=e.id and d.deleted_at is null
    where p_kind in ('employee-department','assignment-department') and (
      d.available_to_all_organizations or erp_private.master_permission('departments','view',d.owner_company_id,d.branch_id))
  )
  select to_jsonb(label) from label;
$$;
revoke all on function erp_private.phase3_hr_operational_label(text,bigint,bigint) from public, anon, authenticated, service_role;
grant execute on function erp_private.phase3_hr_operational_label(text,bigint,bigint) to authenticated;

create view public.phase3_hr_assignments with (security_invoker = true) as
select a.*, labels.site, labels.department,
  labels.site->>'name_en' as site_label, labels.department->>'name_en' as department_label
from public.employee_assignments a cross join lateral (
  select erp_private.phase3_hr_operational_label('assignment-site',a.employee_id,a.id) as site,
         erp_private.phase3_hr_operational_label('assignment-department',a.employee_id,a.id) as department
) labels;

create view public.phase3_hr_site_readiness with (security_invoker = true) as
select r.*, labels.site, labels.site->>'name_en' as site_label
from public.employee_site_readiness r cross join lateral (
  select erp_private.phase3_hr_operational_label('readiness-site',r.employee_id,r.id) as site
) labels;

create view public.phase3_hr_employee_master_labels with (security_invoker = true) as
select e.id, e.owner_company_id, e.branch_id,
  erp_private.phase3_hr_operational_label('employee-site',e.id,null) as site,
  erp_private.phase3_hr_operational_label('employee-department',e.id,null) as department
from public.employees e where e.deleted_at is null;

revoke all on public.phase3_hr_assignments,public.phase3_hr_site_readiness,public.phase3_hr_employee_master_labels from public, anon, authenticated, service_role;
grant select on public.phase3_hr_assignments,public.phase3_hr_site_readiness,public.phase3_hr_employee_master_labels to authenticated;
notify pgrst, 'reload schema';
commit;
