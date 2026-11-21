BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

-- Installation records from BRANDING.1, ERP COMMON AI.13 and DMS AI.14.
-- Existing values, inactive records and explicit administrator choices win.
INSERT INTO public.erp_app_branding_settings (settings_code,app_name,app_short_name,tagline,is_active)
VALUES ('DEFAULT_APP_BRANDING','ALGT ERP','ALGT','Alliance Gulf Transport ERP',true)
ON CONFLICT (settings_code) DO NOTHING;

INSERT INTO public.erp_ai_feature_flags (feature_code,feature_name,description,is_enabled,requires_human_review,notes)
VALUES
 ('ERP_AI_DAILY_DASHBOARD','AI Daily Dashboard',
  'AI Daily Dashboard for existing ERP scope — risk, compliance, duplicates, DMS health, assistant activity',false,false,NULL),
 ('DMS_AI_OBSERVABILITY','DMS AI Observability Dashboard',
  'Phase 14 — AI token/cost observability dashboard. When true, /admin/dms/ai-observability is accessible to users with dms.ai_observability.view permission.',
  false,false,'Default false — enable after Phase 14 deployment and cost-rate configuration by admin.')
ON CONFLICT (feature_code) DO NOTHING;

-- Expose just each authorized screen's availability. Keep settings inventory,
-- provider credentials, and cross-company aggregate authority separate.
CREATE OR REPLACE FUNCTION erp_private.fa_read_ai_setup_feature(p_feature text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE enabled boolean;
BEGIN
 IF NOT erp_private.business_principal_is_active() THEN
  RAISE EXCEPTION 'Active application session required' USING ERRCODE='42501';
 END IF;

 CASE p_feature
 WHEN 'ERP_AI_DAILY_DASHBOARD' THEN
  IF NOT (public.current_user_has_permission('ai.dashboard.view')
    OR public.current_user_has_permission('ai.dashboard.admin')
    OR public.current_user_has_permission('ai.common.view')
    OR public.current_user_has_permission('ai.common.admin')) THEN
   RAISE EXCEPTION 'Global AI dashboard access required' USING ERRCODE='42501';
  END IF;
 WHEN 'DMS_AI_OBSERVABILITY' THEN
  IF NOT (public.current_user_has_permission('dms.ai_observability.view')
    OR public.current_user_has_permission('dms.ai_observability.admin')
    OR public.current_user_has_permission('dms.admin')
    OR public.current_user_has_permission('settings.ai.view')
    OR public.current_user_has_permission('settings.ai.manage')) THEN
   RAISE EXCEPTION 'Global DMS observability access required' USING ERRCODE='42501';
  END IF;
 ELSE
  RAISE EXCEPTION 'Unknown AI setup feature' USING ERRCODE='22023';
 END CASE;

 SELECT f.is_enabled INTO enabled FROM public.erp_ai_feature_flags f WHERE f.feature_code=p_feature;
 IF NOT FOUND THEN RETURN 'setup_required'; END IF;
 RETURN CASE WHEN enabled THEN 'enabled' ELSE 'disabled' END;
END;
$$;

CREATE OR REPLACE FUNCTION public.fa_read_ai_setup_feature(p_feature text)
RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT erp_private.fa_read_ai_setup_feature(p_feature);
$$;

REVOKE ALL ON FUNCTION erp_private.fa_read_ai_setup_feature(text),public.fa_read_ai_setup_feature(text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.fa_read_ai_setup_feature(text),public.fa_read_ai_setup_feature(text)
 TO authenticated;

-- REPORT.4 definitions, with the T19 versions of Attendance and Leave.
-- The current HR operations readers use hr.assignments.view. The employee badge
-- identity is retained inactive until a governed output definition is available.
-- No reports, outputs, features or schedules are enabled over an existing row.
WITH reviewed (
  report_code, report_name_en, report_name_ar, module_code, report_category,
  description_en, default_output_formats, default_orientation,
  branding_strategy, branding_source_path, required_permissions,
  sensitive_profile, sensitive_field_rules_json, filter_schema_json, column_schema_json,
  supports_numbering, numbering_rule_code, supports_scheduling,
  is_letter_type, sort_order, is_system, is_active
) AS (VALUES
('HR_EMPLOYEE_LIST', 'Employee List', 'قائمة الموظفين', 'HR', 'list',
 'Full employee list with key profile fields, filterable by company/department/status.',
 ARRAY['screen','pdf','excel','csv','print'], 'landscape',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.employees.view'],
 'normal', '{}'::jsonb,
 '{"filters":["owner_company_id","branch_id","department_id","designation_id","employee_status","date_from","date_to","search"]}'::jsonb,
 '{"columns":["employee_code","full_name_en","full_name_ar","owner_company","branch","department","designation","nationality","employee_status","joining_date","work_site","mobile","email"]}'::jsonb,
 false, null, false, false, 100, true, true),

('HR_EMPLOYEE_PROFILE', 'Employee Profile', 'ملف الموظف', 'HR', 'detail',
 'Single employee detail report with compliance, time, operations, and HR action summary.',
 ARRAY['screen','pdf','print'], 'portrait',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.employees.view'],
 'mixed_sensitive', '{"mask_fields":["date_of_birth"],"payroll_permission":"hr.payroll.view","medical_permission":"hr.medical.view"}'::jsonb,
 '{"filters":["employee_id"]}'::jsonb,
 '{"columns":["employee_code","full_name_en","designation","department","employee_status","joining_date"]}'::jsonb,
 false, null, false, false, 101, true, true),

('HR_COMPLIANCE_EXPIRY', 'Compliance Expiry Report', 'تقرير انتهاء الوثائق', 'HR', 'compliance',
 'Combined compliance expiry report for identity docs, medical insurance, and training certificates.',
 ARRAY['screen','pdf','excel','csv','print'], 'landscape',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.compliance.view'],
 'normal', '{"mask_fields":["document_number_masked"]}'::jsonb,
 '{"filters":["owner_company_id","department_id","document_type","expiry_from","expiry_to","status"]}'::jsonb,
 '{"columns":["employee_code","employee_name","company","department","document_category","document_type","document_number_masked","issue_date","expiry_date","days_remaining","status"]}'::jsonb,
 false, null, false, false, 102, true, true),

('HR_ATTENDANCE_SUMMARY', 'Attendance Summary', 'ملخص الحضور والانصراف', 'HR', 'summary',
 'Daily attendance summary per employee with hours worked, late minutes, and punch status.',
 ARRAY['screen','pdf','excel','csv','print'], 'landscape',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.attendance.view'],
 'normal', '{}'::jsonb,
 '{"filters":["owner_company_id","branch_id","department_id","work_site_id","date_from","date_to","attendance_status"]}'::jsonb,
 '{"columns":["employee_code","employee_name","company","department","attendance_date","attendance_type","shift_name","shift_context","first_in","last_out","total_hours","worked_minutes","worked_fact","late_minutes","early_out_minutes","missing_punch","approval_status","work_site","as_of_date"]}'::jsonb,
 false, null, false, false, 103, true, true),

('HR_LEAVE_BALANCE', 'Leave Balance Report', 'تقرير أرصدة الإجازات', 'HR', 'summary',
 'Recorded leave and current verified availability with reservations shown separately.',
 ARRAY['screen','pdf','excel','csv','print'], 'landscape',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.leave.view'],
 'normal', '{}'::jsonb,
 '{"filters":["owner_company_id","branch_id","department_id","date_from","date_to"]}'::jsonb,
 '{"columns":["employee_code","employee_name","company","leave_type","period_start","period_end","entitled_days","carry_forward","used_days","recorded_balance_days","verified_available_days","pending_reservation_days","balance_status","as_of_date"]}'::jsonb,
 false, null, false, false, 104, true, true),

('HR_LEAVE_REQUESTS', 'Leave Requests', 'طلبات الإجازات', 'HR', 'list',
 'Leave requests overlapping the selected dates, with exact posted or reserved days where verified.',
 ARRAY['screen','pdf','excel','csv','print'], 'landscape',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.leave.view'],
 'normal', '{}'::jsonb,
 '{"filters":["owner_company_id","branch_id","department_id","date_from","date_to","leave_status"]}'::jsonb,
 '{"columns":["employee_code","employee_name","company","leave_type","request_date","start_date","end_date","total_days","overlap_days","allocated_days","paid_allocated_days","allocation_scope","approval_status","approved_by","approved_at"]}'::jsonb,
 false, null, false, false, 105, true, true),

('HR_WPS_READINESS', 'WPS Readiness Report', 'تقرير جاهزية نظام الرواتب', 'HR', 'compliance',
 'WPS payroll readiness per employee. Does not expose IBAN or salary amounts.',
 ARRAY['screen','pdf','excel','csv','print'], 'landscape',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.payroll.view'],
 'payroll', '{"blocked_fields":["iban","account_number","salary"]}'::jsonb,
 '{"filters":["owner_company_id","department_id","readiness_status"]}'::jsonb,
 '{"columns":["employee_code","employee_name","company","bank_name","wps_applicable","wps_status","payment_method","missing_fields","hold_status","readiness_status"]}'::jsonb,
 false, null, false, false, 106, true, true),

('HR_ASSIGNMENT_BY_SITE', 'Assignment by Site', 'تعيينات الموظفين حسب الموقع', 'HR', 'list',
 'Employee site assignments and readiness status.',
 ARRAY['screen','pdf','excel','csv','print'], 'landscape',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.assignments.view'],
 'normal', '{}'::jsonb,
 '{"filters":["owner_company_id","work_site_id","date_from","date_to","employee_status"]}'::jsonb,
 '{"columns":["employee_code","employee_name","company","site","assignment_start","assignment_end","assignment_status"]}'::jsonb,
 false, null, false, false, 107, true, true),

('HR_PRO_PROCESSES', 'PRO Processes', 'العمليات الحكومية', 'HR', 'list',
 'PRO/government process tracking per employee.',
 ARRAY['screen','pdf','excel','csv','print'], 'landscape',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.actions.view'],
 'normal', '{}'::jsonb,
 '{"filters":["owner_company_id","department_id","employee_status","date_from","date_to"]}'::jsonb,
 '{"columns":["employee_code","employee_name","company","process_type","process_title","process_status","priority","request_date","target_date","completed_date","assigned_to","aging_days"]}'::jsonb,
 false, null, false, false, 108, true, true),

('HR_CANDIDATE_PIPELINE', 'Candidate Pipeline', 'مسار المرشحين', 'HR', 'list',
 'Recruitment candidate pipeline by stage, status, and requisition.',
 ARRAY['screen','pdf','excel','csv','print'], 'landscape',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.recruitment.view'],
 'recruitment', '{"blocked_fields":["expected_salary","offer_amount","notes"]}'::jsonb,
 '{"filters":["candidate_status","requisition_status","date_from","date_to","search"]}'::jsonb,
 '{"columns":["candidate_code","candidate_name","nationality","requisition","designation","candidate_status","pipeline_stage","source","rating","last_interview_date","interview_result","offer_status"]}'::jsonb,
 false, null, false, false, 109, true, true),

('HR_REQUISITIONS', 'Job Requisitions', 'طلبات التوظيف', 'HR', 'list',
 'Open and closed job requisitions with candidate counts.',
 ARRAY['screen','pdf','excel','csv','print'], 'landscape',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.recruitment.view'],
 'normal', '{}'::jsonb,
 '{"filters":["owner_company_id","department_id","requisition_status","date_from","date_to"]}'::jsonb,
 '{"columns":["requisition_code","title","department","designation","company","requested_count","status","opened_date","target_date","total_candidates","hired_count","pending_count"]}'::jsonb,
 false, null, false, false, 110, true, true),

('HR_ONBOARDING_TASKS', 'Onboarding Tasks', 'مهام الاستقبال والتأهيل', 'HR', 'list',
 'Onboarding task tracker for candidates and new employees.',
 ARRAY['screen','pdf','excel','csv','print'], 'landscape',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.recruitment.view'],
 'normal', '{}'::jsonb,
 '{"filters":["employee_status","date_from","date_to"]}'::jsonb,
 '{"columns":["person_code","person_name","person_type","company","task_title","task_category","task_status","assigned_to","due_date","completed_at","completed_by","aging_days"]}'::jsonb,
 false, null, false, false, 111, true, true),

('HR_DISCIPLINARY_SUMMARY', 'Disciplinary Summary', 'ملخص الإجراءات التأديبية', 'HR', 'summary',
 'Disciplinary records summary by severity and type. Restricted text unless hr.actions.manage.',
 ARRAY['screen','pdf','excel','csv'], 'landscape',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.actions.view'],
 'disciplinary', '{"restricted_fields":["description","notes"],"manage_permission":"hr.actions.manage"}'::jsonb,
 '{"filters":["owner_company_id","department_id","employee_status","date_from","date_to"]}'::jsonb,
 '{"columns":["employee_code","employee_name","company","department","disciplinary_type","severity","subject","incident_date","record_date","status","acknowledged","creates_block"]}'::jsonb,
 false, null, false, false, 112, true, true),

('HR_OVERTIME_REPORT', 'Overtime Report', 'تقرير العمل الإضافي', 'HR', 'summary',
 'Approved and pending overtime records by employee.',
 ARRAY['screen','pdf','excel','csv','print'], 'landscape',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.attendance.view'],
 'normal', '{}'::jsonb,
 '{"filters":["owner_company_id","department_id","date_from","date_to","leave_status"]}'::jsonb,
 '{"columns":["employee_code","employee_name","company","department","overtime_date","hours","approval_status","approved_by","approved_at"]}'::jsonb,
 false, null, false, false, 113, true, true),

('HR_ABSENT_LATE_SUMMARY', 'Absent & Late Summary', 'ملخص الغيابات والتأخرات', 'HR', 'summary',
 'Summary of absent, late, and missing punch records.',
 ARRAY['screen','pdf','excel','csv','print'], 'landscape',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.attendance.view'],
 'normal', '{}'::jsonb,
 '{"filters":["owner_company_id","department_id","date_from","date_to","attendance_status"]}'::jsonb,
 '{"columns":["employee_code","employee_name","company","department","attendance_date","attendance_type","late_minutes","early_out_minutes","missing_punch"]}'::jsonb,
 false, null, false, false, 114, true, true),

('HR_EOS_CASES', 'End of Service Cases', 'قضايا نهاية الخدمة', 'HR', 'list',
 'End of service cases with clearance and settlement status.',
 ARRAY['screen','pdf','excel','csv','print'], 'landscape',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.actions.view'],
 'normal', '{}'::jsonb,
 '{"filters":["owner_company_id","department_id","employee_status","date_from","date_to"]}'::jsonb,
 '{"columns":["employee_code","employee_name","company","department","eos_type","case_status","notice_date","last_working_date","final_settlement_status","clearance_completed"]}'::jsonb,
 false, null, false, false, 115, true, true),

('HR_PPE_ISSUE_REPORT', 'PPE Issue Report', 'تقرير توزيع معدات السلامة', 'HR', 'list',
 'PPE items issued to employees with return status.',
 ARRAY['screen','pdf','excel','csv','print'], 'landscape',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.assignments.view'],
 'normal', '{}'::jsonb,
 '{"filters":["owner_company_id","department_id","work_site_id","date_from","date_to","employee_status"]}'::jsonb,
 '{"columns":["employee_code","employee_name","company","department","ppe_item","ppe_category","quantity","condition_at_issue","issue_date","return_date","return_condition","ppe_status","issued_by"]}'::jsonb,
 false, null, false, false, 116, true, true),

('HR_ASSET_ISSUE_REPORT', 'Asset Issue Report', 'تقرير أصول الموظفين', 'HR', 'list',
 'Assets issued to employees with return and condition tracking.',
 ARRAY['screen','pdf','excel','csv','print'], 'landscape',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.assignments.view'],
 'normal', '{}'::jsonb,
 '{"filters":["owner_company_id","department_id","date_from","date_to","employee_status"]}'::jsonb,
 '{"columns":["employee_code","employee_name","company","department","asset_type","asset_name","asset_tag","serial_number","condition_at_issue","issue_date","return_date","return_condition","asset_status","issued_by"]}'::jsonb,
 false, null, false, false, 117, true, true),

('HR_EXPERIENCE_LETTER', 'Experience Letter', 'خطاب خبرة', 'HR', 'letter',
 'Official experience letter for current or former employee.',
 ARRAY['pdf','print'], 'portrait',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.employees.view'],
 'normal', '{}'::jsonb,
 '{"filters":["employee_id"]}'::jsonb,
 '{"columns":["employee_name","employee_code","designation","department","joining_date","last_working_date","company_name","generated_date"]}'::jsonb,
 true, 'HR_EXPERIENCE_LETTER', false, true, 200, true, true),

('HR_SALARY_CERT_GENERAL', 'Salary Certificate (General)', 'شهادة راتب عامة', 'HR', 'certificate',
 'General employment certificate without salary amounts.',
 ARRAY['pdf','print'], 'portrait',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.employees.view'],
 'normal', '{}'::jsonb,
 '{"filters":["employee_id"]}'::jsonb,
 '{"columns":["employee_name","employee_code","designation","company_name","joining_date","generated_date"]}'::jsonb,
 true, 'HR_SALARY_CERTIFICATE', false, true, 201, true, true),

('HR_SALARY_CERT_WITH_AMOUNT', 'Salary Certificate (with Amount)', 'شهادة راتب مع المبلغ', 'HR', 'certificate',
 'Salary certificate including basic and gross salary. Requires hr.payroll.view.',
 ARRAY['pdf','print'], 'portrait',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.payroll.view'],
 'payroll', '{"required_permission":"hr.payroll.view"}'::jsonb,
 '{"filters":["employee_id"]}'::jsonb,
 '{"columns":["employee_name","employee_code","designation","company_name","joining_date","basic_salary","gross_salary","currency","generated_date"]}'::jsonb,
 true, 'HR_SALARY_CERTIFICATE', false, true, 202, true, true),

('HR_NOC', 'No Objection Certificate (NOC)', 'شهادة عدم ممانعة', 'HR', 'certificate',
 'Standard NOC letter with masked passport number.',
 ARRAY['pdf','print'], 'portrait',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.employees.view'],
 'normal', '{"mask_fields":["passport_number_masked"]}'::jsonb,
 '{"filters":["employee_id","purpose"]}'::jsonb,
 '{"columns":["employee_name","employee_code","designation","company_name","passport_number_masked","purpose","generated_date"]}'::jsonb,
 true, 'HR_NOC', false, true, 203, true, true),

('HR_EMPLOYEE_ID_CARD', 'Employee ID Card', 'بطاقة هوية الموظف', 'HR', 'badge',
 'Employee ID card with name, code, designation, and company.',
 ARRAY['pdf','print'], 'portrait',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.employees.view'],
 'normal', '{}'::jsonb,
 '{"filters":["employee_id"]}'::jsonb,
 '{"columns":["employee_code","employee_name","designation","department","company_name"]}'::jsonb,
 false, null, false, false, 204, true, false),

('HR_PPE_ISSUE_FORM', 'PPE Issue Form', 'نموذج توزيع معدات السلامة', 'HR', 'form',
 'Official PPE issue form with employee signature placeholder.',
 ARRAY['pdf','print'], 'portrait',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.assignments.view'],
 'normal', '{}'::jsonb,
 '{"filters":["employee_id"]}'::jsonb,
 '{"columns":["employee_code","employee_name","ppe_item","ppe_category","quantity","issue_date","condition","issued_by","signature_placeholder"]}'::jsonb,
 true, 'HR_PPE_ISSUE_FORM', false, false, 205, true, true),

('HR_JOINING_CHECKLIST', 'Joining Checklist', 'قائمة مراجعة الالتحاق بالعمل', 'HR', 'checklist',
 'Standard joining checklist for new employees.',
 ARRAY['pdf','print'], 'portrait',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.employees.view'],
 'normal', '{}'::jsonb,
 '{"filters":["employee_id"]}'::jsonb,
 '{"columns":["employee_code","employee_name","joining_date","area","checklist_item","status","remarks"]}'::jsonb,
 true, 'HR_JOINING_CHECKLIST', false, false, 206, true, true),

('HR_CLEARANCE_FORM', 'Employee Clearance Form', 'نموذج تسوية الموظف', 'HR', 'form',
 'Employee clearance form for all departments with signature placeholders.',
 ARRAY['pdf','print'], 'portrait',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.actions.view'],
 'normal', '{}'::jsonb,
 '{"filters":["employee_id"]}'::jsonb,
 '{"columns":["employee_code","employee_name","clearance_area","status","signature_placeholder","remarks"]}'::jsonb,
 true, 'HR_CLEARANCE_FORM', false, false, 207, true, true)
)
INSERT INTO public.erp_report_registry (
  report_code, report_name_en, report_name_ar, module_code, report_category,
  description_en, default_output_formats, default_orientation,
  branding_strategy, branding_source_path, required_permissions,
  sensitive_profile, sensitive_field_rules_json, filter_schema_json, column_schema_json,
  supports_numbering, numbering_rule_code, supports_scheduling,
  is_letter_type, sort_order, is_system, is_active, document_class, approval_required_override
)
SELECT reviewed.*,
 CASE
  WHEN report_category IN ('letter','certificate') AND sensitive_profile IN ('payroll','mixed_sensitive') THEN 'A'
  WHEN report_category IN ('letter','certificate') THEN 'B'
  WHEN report_category IN ('form','checklist','external_submission') THEN 'C'
  WHEN report_category='badge' THEN 'D'
  ELSE 'E'
 END,
 CASE WHEN report_code='HR_NOC' THEN true END
FROM reviewed
ON CONFLICT (report_code) DO NOTHING;

-- OUTPUT.2 and OFFICIAL DOCS.1 identities use the current fixed definitions.
-- Original approved-source, permission and issuance checks still control the
-- documents. The later warning-letter QR restriction is applied on insert.
WITH reviewed (
  report_code, report_name_en, report_name_ar, module_code, report_category,
  description_en, default_output_formats, default_orientation,
  branding_strategy, branding_source_path, required_permissions,
  sensitive_profile, sensitive_field_rules_json, filter_schema_json, column_schema_json,
  supports_numbering, numbering_rule_code, supports_scheduling,
  is_letter_type, sort_order, is_system, is_active, document_class
) AS (VALUES
('HR_EMPLOYMENT_CONFIRMATION', 'Employment Confirmation', 'خطاب تأكيد التوظيف', 'HR', 'letter',
 'Employment confirmation letter in English, Arabic, or synchronized bilingual layout (fixed code-based template).',
 ARRAY['pdf','print'], 'portrait',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.employees.view'],
 'normal', '{}'::jsonb,
 '{"filters":["employee_id"]}'::jsonb,
 '{"columns":["employee_name","employee_code","designation","joining_date","company_name","generated_date"]}'::jsonb,
 false, null, false, true, 206, true, true, 'B'),

('HR_WARNING_LETTER', 'Official Warning Letter', 'خطاب إنذار رسمي', 'HR', 'letter',
 'Formal disciplinary warning letter tied to a recorded disciplinary action (fixed code-based template).',
 ARRAY['pdf','print'], 'portrait',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.actions.view'],
 'disciplinary', '{}'::jsonb,
 '{"filters":["employee_id","action_id"]}'::jsonb,
 '{"columns":["employee_name","employee_code","warning_level","warning_reason","incident_date","generated_date"]}'::jsonb,
 false, null, false, true, 207, true, true, 'A'),

('HR_BANK_SALARY_TRANSFER', 'Bank Salary Information Letter', NULL, 'HR', 'letter',
 'Employment and salary information for the verified bank. Issuance requires current payroll and bank particulars.',
 ARRAY['pdf','print'], 'portrait',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.payroll.view'],
 'payroll', '{}'::jsonb,
 '{"filters":["employee_id"]}'::jsonb,
 '{}'::jsonb,
 false, null, false, true, 208, true, true, 'A'),

('HR_EMBASSY_LETTER', 'Embassy / Consulate Letter', NULL, 'HR', 'letter',
 'Employment details for a reviewed embassy or consulate recipient and purpose.',
 ARRAY['pdf','print'], 'portrait',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.employees.view'],
 'mixed_sensitive', '{}'::jsonb,
 '{"filters":["employee_id"]}'::jsonb,
 '{}'::jsonb,
 false, null, false, true, 209, true, true, 'A'),

('HR_HANDOVER_FORM', 'Employee Handover Form', NULL, 'HR', 'form',
 'Verified handover of duties, assets and documents, with independent source review.',
 ARRAY['pdf','print'], 'portrait',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.actions.view'],
 'normal', '{}'::jsonb,
 '{"filters":["employee_id"]}'::jsonb,
 '{}'::jsonb,
 false, null, false, false, 210, true, true, 'C'),

('HR_LEAVE_CONFIRMATION', 'Leave Confirmation Letter', NULL, 'HR', 'letter',
 'Approved leave, with the recorded employee return schedule.',
 ARRAY['pdf','print'], 'portrait',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.leave.view'],
 'normal', '{}'::jsonb,
 '{"filters":["employee_id"]}'::jsonb,
 '{}'::jsonb,
 false, null, false, true, 211, true, true, 'B')
)
INSERT INTO public.erp_report_registry (
  report_code, report_name_en, report_name_ar, module_code, report_category,
  description_en, default_output_formats, default_orientation,
  branding_strategy, branding_source_path, required_permissions,
  sensitive_profile, sensitive_field_rules_json, filter_schema_json, column_schema_json,
  supports_numbering, numbering_rule_code, supports_scheduling,
  is_letter_type, sort_order, is_system, is_active, document_class, qr_policy_override
)
SELECT reviewed.*, CASE WHEN report_code='HR_WARNING_LETTER' THEN 'none' END
FROM reviewed
ON CONFLICT (report_code) DO NOTHING;

INSERT INTO public.erp_report_registry (
 report_code,report_name_en,module_code,report_category,description_en,default_output_formats,
 default_orientation,branding_strategy,required_permissions,sensitive_profile,supports_numbering,
 supports_scheduling,is_letter_type,sort_order,is_system,is_active,document_class
)
VALUES (
 'HR_EMPLOYMENT_LETTER','Employment Letter','HR','letter',
 'Official employment confirmation letter (migrated from the standalone Gotenberg pipeline to the global output coordinator in OUTPUT.2).',
 ARRAY['pdf','print'],'portrait','auto_by_owner_company',ARRAY['hr.employees.view'],'normal',
 true,false,true,201,true,true,'B'
)
ON CONFLICT (report_code) DO NOTHING;

-- REPORT.2 registry and the screen-only T17 Finance report.
-- Template and branding selection remain under their existing configuration.
INSERT INTO public.erp_report_registry (
 report_code,report_name_en,report_name_ar,module_code,report_category,description_en,default_output_formats,
 branding_strategy,required_permissions,sensitive_profile,filter_schema_json,
 supports_numbering,supports_scheduling,is_letter_type,sort_order,is_system,is_active,document_class
)
VALUES
 ('ADMIN_PERMISSION_MATRIX','Permission Matrix Report','تقرير مصفوفة الصلاحيات','ADMIN','list',
  'Permission definitions grouped by module.',
  ARRAY['screen','pdf','excel','csv'],'group_default',ARRAY['reports.view','reports.run'],'normal','{}',
  false,false,false,10,true,true,'E'),
 ('FIN_PAYROLL_RECONCILIATION','Payroll Reconciliation',NULL,'FINANCE','summary',
  'Compare GM-approved payroll and verified payments for one branch or a fully authorized employer.',
  ARRAY['screen'],'none',ARRAY['reports.view','reports.run','hr.payroll.finance.reconcile'],
  'payroll','{"filters":["owner_company_id","branch_id","payroll_month"]}',
  false,false,false,100,true,true,NULL)
ON CONFLICT (report_code) DO NOTHING;

NOTIFY pgrst,'reload schema';
COMMIT;
