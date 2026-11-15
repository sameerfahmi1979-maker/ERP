begin;
set local lock_timeout = '5s';

create table erp_private.report_source_generations (
  relation_name text not null,
  shard smallint not null,
  generation bigint not null default 0,
  primary key (relation_name, shard)
);
revoke all on erp_private.report_source_generations from public, anon, authenticated, service_role;
alter table erp_private.report_source_generations enable row level security;

create function erp_private.advance_report_source_generation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update erp_private.report_source_generations
  set generation = generation + 1
  where relation_name = tg_table_name
    and shard = (pg_current_xact_id()::text::bigint % 64)::smallint;
  return null;
end;
$$;
revoke all on function erp_private.advance_report_source_generation() from public, anon, authenticated, service_role;

do $$
declare
  relation text;
begin
  foreach relation in array array[
    'banks','branches','countries','departments','designations','employee_access_cards',
    'employee_assets','employee_assignments','employee_attendance_daily_summary','employee_clearance_items',
    'employee_dependents','employee_disciplinary_records','employee_eos_cases','employee_identity_documents',
    'employee_leave_balances','employee_leave_requests','employee_medical_insurances','employee_medical_records',
    'employee_overtime_records','employee_payroll_holds','employee_payroll_profiles','employee_ppe_issues',
    'employee_pro_processes','employee_salary_components','employee_salary_revision_effects',
    'employee_training_certificates','employee_wps_profiles','employees','erp_user_employee_links',
    'hr_access_card_types','hr_candidates','hr_employee_categories','hr_employment_types','hr_identity_document_types',
    'hr_interviews','hr_job_requisitions','hr_leave_types','hr_offers','hr_onboarding_tasks','hr_pro_process_types',
    'hr_salary_component_types','hr_training_types','owner_companies','permissions','user_profiles','work_sites'
  ] loop
    insert into erp_private.report_source_generations (relation_name, shard)
    select relation, shard from generate_series(0, 63) shard;
    execute format(
      'create trigger phase3_report_source_change after insert or update or delete or truncate on public.%I
       for each statement execute function erp_private.advance_report_source_generation()', relation);
  end loop;
end;
$$;

create function public.phase3_report_source_generations()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_object_agg(relation_name, revision)
  from (
    select relation_name, sum(generation)::text as revision
    from erp_private.report_source_generations
    group by relation_name
  ) totals;
$$;
revoke all on function public.phase3_report_source_generations() from public, anon, authenticated, service_role;
grant execute on function public.phase3_report_source_generations() to service_role;
notify pgrst, 'reload schema';
commit;
