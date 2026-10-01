BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Ownership never survives loss of delivery authority; company scope is not global.
CREATE FUNCTION erp_private.f09_schedule_delivery_scope(company_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT erp_private.permission_in_scope('reports.run',$1,NULL)
    AND erp_private.permission_in_scope('reports.export',$1,NULL)
    AND erp_private.permission_in_scope('reports.email',$1,NULL);
$$;
REVOKE ALL ON FUNCTION erp_private.f09_schedule_delivery_scope(bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f09_schedule_delivery_scope(bigint) TO authenticated;
ALTER TABLE public.erp_report_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rpt_schedules_select ON public.erp_report_schedules;
DROP POLICY IF EXISTS rpt_schedules_insert ON public.erp_report_schedules;
DROP POLICY IF EXISTS rpt_schedules_update ON public.erp_report_schedules;
DROP POLICY IF EXISTS rpt_schedules_delete ON public.erp_report_schedules;
CREATE POLICY f09_schedule_read ON public.erp_report_schedules FOR SELECT TO authenticated USING (
 erp_private.permission_in_scope('reports.schedule.view',owner_company_id,NULL)
 OR erp_private.permission_in_scope('reports.schedule.manage',owner_company_id,NULL)
 OR (created_by=public.current_user_profile_id() AND erp_private.f09_schedule_delivery_scope(owner_company_id))
);
CREATE POLICY f09_schedule_create ON public.erp_report_schedules FOR INSERT TO authenticated WITH CHECK (
 created_by=public.current_user_profile_id() AND erp_private.f09_schedule_delivery_scope(owner_company_id)
 AND deleted_at IS NULL AND deleted_by IS NULL
);
CREATE POLICY f09_schedule_update ON public.erp_report_schedules FOR UPDATE TO authenticated USING (
 erp_private.f09_schedule_delivery_scope(owner_company_id)
 AND (created_by=public.current_user_profile_id() OR erp_private.permission_in_scope('reports.schedule.manage',owner_company_id,NULL))
) WITH CHECK (
 erp_private.f09_schedule_delivery_scope(owner_company_id)
 AND (created_by=public.current_user_profile_id() OR erp_private.permission_in_scope('reports.schedule.manage',owner_company_id,NULL))
 AND (deleted_by IS NULL OR deleted_by=public.current_user_profile_id())
);
-- Browser JWTs cannot forge creator/report identity or worker outcome facts.
-- Deletion is audited soft deletion, not a public hard-delete capability.
REVOKE ALL ON public.erp_report_schedules FROM PUBLIC,anon;
REVOKE INSERT,UPDATE,DELETE ON public.erp_report_schedules FROM authenticated;
GRANT SELECT ON public.erp_report_schedules TO authenticated;
GRANT INSERT(schedule_code,report_id,created_by,owner_company_id,schedule_name,filters_json,
 selected_template_id,output_format,recipient_to,recipient_cc,email_subject_template,email_body_template,
 frequency,day_of_week,day_of_month,time_of_day,timezone,next_run_at,is_active)
 ON public.erp_report_schedules TO authenticated;
GRANT UPDATE(owner_company_id,schedule_name,filters_json,selected_template_id,output_format,
 recipient_to,recipient_cc,email_subject_template,email_body_template,frequency,day_of_week,
 day_of_month,time_of_day,timezone,next_run_at,is_active,updated_at,deleted_at,deleted_by)
 ON public.erp_report_schedules TO authenticated;
COMMIT;
