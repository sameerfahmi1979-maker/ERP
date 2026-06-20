-- ============================================================================
-- REPORT.4 — HR.11 Reports + Letters + Forms Library
-- Migration: Registry Seeds + Numbering Rules
-- Date: 2026-06-19
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. HR Report Registry Entries
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO erp_report_registry (
  report_code, report_name_en, report_name_ar, module_code, report_category,
  description_en, default_output_formats, default_orientation,
  branding_strategy, branding_source_path, required_permissions,
  sensitive_profile, sensitive_field_rules_json, filter_schema_json, column_schema_json,
  supports_numbering, numbering_rule_code, supports_scheduling,
  is_letter_type, sort_order, is_system, is_active
) VALUES

-- 1. HR_EMPLOYEE_LIST
('HR_EMPLOYEE_LIST', 'Employee List', 'قائمة الموظفين', 'HR', 'list',
 'Full employee list with key profile fields, filterable by company/department/status.',
 ARRAY['screen','pdf','excel','csv','print'], 'landscape',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.employees.view'],
 'normal', '{}'::jsonb,
 '{"filters":["owner_company_id","branch_id","department_id","designation_id","employee_status","date_from","date_to","search"]}'::jsonb,
 '{"columns":["employee_code","full_name_en","full_name_ar","owner_company","branch","department","designation","nationality","employee_status","joining_date","work_site","mobile","email"]}'::jsonb,
 false, null, false, false, 100, true, true),

-- 2. HR_EMPLOYEE_PROFILE
('HR_EMPLOYEE_PROFILE', 'Employee Profile', 'ملف الموظف', 'HR', 'detail',
 'Single employee detail report with compliance, time, operations, and HR action summary.',
 ARRAY['screen','pdf','print'], 'portrait',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.employees.view'],
 'mixed_sensitive', '{"mask_fields":["date_of_birth"],"payroll_permission":"hr.payroll.view","medical_permission":"hr.medical.view"}'::jsonb,
 '{"filters":["employee_id"]}'::jsonb,
 '{"columns":["employee_code","full_name_en","designation","department","employee_status","joining_date"]}'::jsonb,
 false, null, false, false, 101, true, true),

-- 3. HR_COMPLIANCE_EXPIRY
('HR_COMPLIANCE_EXPIRY', 'Compliance Expiry Report', 'تقرير انتهاء الوثائق', 'HR', 'compliance',
 'Combined compliance expiry report for identity docs, medical insurance, and training certificates.',
 ARRAY['screen','pdf','excel','csv','print'], 'landscape',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.compliance.view'],
 'normal', '{"mask_fields":["document_number_masked"]}'::jsonb,
 '{"filters":["owner_company_id","department_id","document_type","expiry_from","expiry_to","status"]}'::jsonb,
 '{"columns":["employee_code","employee_name","company","department","document_category","document_type","document_number_masked","issue_date","expiry_date","days_remaining","status"]}'::jsonb,
 false, null, false, false, 102, true, true),

-- 4. HR_ATTENDANCE_SUMMARY
('HR_ATTENDANCE_SUMMARY', 'Attendance Summary', 'ملخص الحضور والانصراف', 'HR', 'summary',
 'Daily attendance summary per employee with hours worked, late minutes, and punch status.',
 ARRAY['screen','pdf','excel','csv','print'], 'landscape',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.attendance.view'],
 'normal', '{}'::jsonb,
 '{"filters":["owner_company_id","department_id","work_site_id","date_from","date_to","attendance_status"]}'::jsonb,
 '{"columns":["employee_code","employee_name","company","department","attendance_date","attendance_type","first_in","last_out","total_hours","late_minutes","early_out_minutes","missing_punch","approval_status","work_site"]}'::jsonb,
 false, null, false, false, 103, true, true),

-- 5. HR_LEAVE_BALANCE
('HR_LEAVE_BALANCE', 'Leave Balance Report', 'تقرير أرصدة الإجازات', 'HR', 'summary',
 'Leave balance per employee and leave type for a given leave year.',
 ARRAY['screen','pdf','excel','csv','print'], 'landscape',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.leave.view'],
 'normal', '{}'::jsonb,
 '{"filters":["owner_company_id","department_id","date_from","date_to"]}'::jsonb,
 '{"columns":["employee_code","employee_name","company","leave_type","leave_year","entitled_days","carry_forward","used_days","balance_days"]}'::jsonb,
 false, null, false, false, 104, true, true),

-- 6. HR_LEAVE_REQUESTS
('HR_LEAVE_REQUESTS', 'Leave Requests', 'طلبات الإجازات', 'HR', 'list',
 'All leave requests with approval status and dates.',
 ARRAY['screen','pdf','excel','csv','print'], 'landscape',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.leave.view'],
 'normal', '{}'::jsonb,
 '{"filters":["owner_company_id","department_id","date_from","date_to","leave_status"]}'::jsonb,
 '{"columns":["employee_code","employee_name","company","leave_type","request_date","start_date","end_date","total_days","approval_status","approved_by","approved_at"]}'::jsonb,
 false, null, false, false, 105, true, true),

-- 7. HR_WPS_READINESS
('HR_WPS_READINESS', 'WPS Readiness Report', 'تقرير جاهزية نظام الرواتب', 'HR', 'compliance',
 'WPS payroll readiness per employee. Does not expose IBAN or salary amounts.',
 ARRAY['screen','pdf','excel','csv','print'], 'landscape',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.payroll.view'],
 'payroll', '{"blocked_fields":["iban","account_number","salary"]}'::jsonb,
 '{"filters":["owner_company_id","department_id","readiness_status"]}'::jsonb,
 '{"columns":["employee_code","employee_name","company","bank_name","wps_applicable","wps_status","payment_method","missing_fields","hold_status","readiness_status"]}'::jsonb,
 false, null, false, false, 106, true, true),

-- 8. HR_ASSIGNMENT_BY_SITE
('HR_ASSIGNMENT_BY_SITE', 'Assignment by Site', 'تعيينات الموظفين حسب الموقع', 'HR', 'list',
 'Employee site assignments and readiness status.',
 ARRAY['screen','pdf','excel','csv','print'], 'landscape',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.operations.view'],
 'normal', '{}'::jsonb,
 '{"filters":["owner_company_id","work_site_id","date_from","date_to","employee_status"]}'::jsonb,
 '{"columns":["employee_code","employee_name","company","site","assignment_start","assignment_end","assignment_status"]}'::jsonb,
 false, null, false, false, 107, true, true),

-- 9. HR_PRO_PROCESSES
('HR_PRO_PROCESSES', 'PRO Processes', 'العمليات الحكومية', 'HR', 'list',
 'PRO/government process tracking per employee.',
 ARRAY['screen','pdf','excel','csv','print'], 'landscape',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.actions.view'],
 'normal', '{}'::jsonb,
 '{"filters":["owner_company_id","department_id","employee_status","date_from","date_to"]}'::jsonb,
 '{"columns":["employee_code","employee_name","company","process_type","process_title","process_status","priority","request_date","target_date","completed_date","assigned_to","aging_days"]}'::jsonb,
 false, null, false, false, 108, true, true),

-- 10. HR_CANDIDATE_PIPELINE
('HR_CANDIDATE_PIPELINE', 'Candidate Pipeline', 'مسار المرشحين', 'HR', 'list',
 'Recruitment candidate pipeline by stage, status, and requisition.',
 ARRAY['screen','pdf','excel','csv','print'], 'landscape',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.recruitment.view'],
 'recruitment', '{"blocked_fields":["expected_salary","offer_amount","notes"]}'::jsonb,
 '{"filters":["candidate_status","requisition_status","date_from","date_to","search"]}'::jsonb,
 '{"columns":["candidate_code","candidate_name","nationality","requisition","designation","candidate_status","pipeline_stage","source","rating","last_interview_date","interview_result","offer_status"]}'::jsonb,
 false, null, false, false, 109, true, true),

-- 11. HR_REQUISITIONS
('HR_REQUISITIONS', 'Job Requisitions', 'طلبات التوظيف', 'HR', 'list',
 'Open and closed job requisitions with candidate counts.',
 ARRAY['screen','pdf','excel','csv','print'], 'landscape',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.recruitment.view'],
 'normal', '{}'::jsonb,
 '{"filters":["owner_company_id","department_id","requisition_status","date_from","date_to"]}'::jsonb,
 '{"columns":["requisition_code","title","department","designation","company","requested_count","status","opened_date","target_date","total_candidates","hired_count","pending_count"]}'::jsonb,
 false, null, false, false, 110, true, true),

-- 12. HR_ONBOARDING_TASKS
('HR_ONBOARDING_TASKS', 'Onboarding Tasks', 'مهام الاستقبال والتأهيل', 'HR', 'list',
 'Onboarding task tracker for candidates and new employees.',
 ARRAY['screen','pdf','excel','csv','print'], 'landscape',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.recruitment.view'],
 'normal', '{}'::jsonb,
 '{"filters":["employee_status","date_from","date_to"]}'::jsonb,
 '{"columns":["person_code","person_name","person_type","company","task_title","task_category","task_status","assigned_to","due_date","completed_at","completed_by","aging_days"]}'::jsonb,
 false, null, false, false, 111, true, true),

-- 13. HR_DISCIPLINARY_SUMMARY
('HR_DISCIPLINARY_SUMMARY', 'Disciplinary Summary', 'ملخص الإجراءات التأديبية', 'HR', 'summary',
 'Disciplinary records summary by severity and type. Restricted text unless hr.actions.manage.',
 ARRAY['screen','pdf','excel','csv'], 'landscape',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.actions.view'],
 'disciplinary', '{"restricted_fields":["description","notes"],"manage_permission":"hr.actions.manage"}'::jsonb,
 '{"filters":["owner_company_id","department_id","employee_status","date_from","date_to"]}'::jsonb,
 '{"columns":["employee_code","employee_name","company","department","disciplinary_type","severity","subject","incident_date","record_date","status","acknowledged","creates_block"]}'::jsonb,
 false, null, false, false, 112, true, true),

-- 14. HR_OVERTIME_REPORT
('HR_OVERTIME_REPORT', 'Overtime Report', 'تقرير العمل الإضافي', 'HR', 'summary',
 'Approved and pending overtime records by employee.',
 ARRAY['screen','pdf','excel','csv','print'], 'landscape',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.attendance.view'],
 'normal', '{}'::jsonb,
 '{"filters":["owner_company_id","department_id","date_from","date_to","leave_status"]}'::jsonb,
 '{"columns":["employee_code","employee_name","company","department","overtime_date","hours","approval_status","approved_by","approved_at"]}'::jsonb,
 false, null, false, false, 113, true, true),

-- 15. HR_ABSENT_LATE_SUMMARY
('HR_ABSENT_LATE_SUMMARY', 'Absent & Late Summary', 'ملخص الغيابات والتأخرات', 'HR', 'summary',
 'Summary of absent, late, and missing punch records.',
 ARRAY['screen','pdf','excel','csv','print'], 'landscape',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.attendance.view'],
 'normal', '{}'::jsonb,
 '{"filters":["owner_company_id","department_id","date_from","date_to","attendance_status"]}'::jsonb,
 '{"columns":["employee_code","employee_name","company","department","attendance_date","attendance_type","late_minutes","early_out_minutes","missing_punch"]}'::jsonb,
 false, null, false, false, 114, true, true),

-- 16. HR_EOS_CASES
('HR_EOS_CASES', 'End of Service Cases', 'قضايا نهاية الخدمة', 'HR', 'list',
 'End of service cases with clearance and settlement status.',
 ARRAY['screen','pdf','excel','csv','print'], 'landscape',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.actions.view'],
 'normal', '{}'::jsonb,
 '{"filters":["owner_company_id","department_id","employee_status","date_from","date_to"]}'::jsonb,
 '{"columns":["employee_code","employee_name","company","department","eos_type","case_status","notice_date","last_working_date","final_settlement_status","clearance_completed"]}'::jsonb,
 false, null, false, false, 115, true, true),

-- 17. HR_PPE_ISSUE_REPORT
('HR_PPE_ISSUE_REPORT', 'PPE Issue Report', 'تقرير توزيع معدات السلامة', 'HR', 'list',
 'PPE items issued to employees with return status.',
 ARRAY['screen','pdf','excel','csv','print'], 'landscape',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.operations.view'],
 'normal', '{}'::jsonb,
 '{"filters":["owner_company_id","department_id","work_site_id","date_from","date_to","employee_status"]}'::jsonb,
 '{"columns":["employee_code","employee_name","company","department","ppe_item","ppe_category","quantity","condition_at_issue","issue_date","return_date","return_condition","ppe_status","issued_by"]}'::jsonb,
 false, null, false, false, 116, true, true),

-- 18. HR_ASSET_ISSUE_REPORT
('HR_ASSET_ISSUE_REPORT', 'Asset Issue Report', 'تقرير أصول الموظفين', 'HR', 'list',
 'Assets issued to employees with return and condition tracking.',
 ARRAY['screen','pdf','excel','csv','print'], 'landscape',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.operations.view'],
 'normal', '{}'::jsonb,
 '{"filters":["owner_company_id","department_id","date_from","date_to","employee_status"]}'::jsonb,
 '{"columns":["employee_code","employee_name","company","department","asset_type","asset_name","asset_tag","serial_number","condition_at_issue","issue_date","return_date","return_condition","asset_status","issued_by"]}'::jsonb,
 false, null, false, false, 117, true, true)

ON CONFLICT (report_code) DO UPDATE SET
  report_name_en = EXCLUDED.report_name_en,
  report_name_ar = EXCLUDED.report_name_ar,
  module_code = EXCLUDED.module_code,
  report_category = EXCLUDED.report_category,
  description_en = EXCLUDED.description_en,
  default_output_formats = EXCLUDED.default_output_formats,
  default_orientation = EXCLUDED.default_orientation,
  branding_strategy = EXCLUDED.branding_strategy,
  branding_source_path = EXCLUDED.branding_source_path,
  required_permissions = EXCLUDED.required_permissions,
  sensitive_profile = EXCLUDED.sensitive_profile,
  sensitive_field_rules_json = EXCLUDED.sensitive_field_rules_json,
  filter_schema_json = EXCLUDED.filter_schema_json,
  column_schema_json = EXCLUDED.column_schema_json,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. HR Letter / Certificate / Form Registry Entries
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO erp_report_registry (
  report_code, report_name_en, report_name_ar, module_code, report_category,
  description_en, default_output_formats, default_orientation,
  branding_strategy, branding_source_path, required_permissions,
  sensitive_profile, sensitive_field_rules_json, filter_schema_json, column_schema_json,
  supports_numbering, numbering_rule_code, supports_scheduling,
  is_letter_type, sort_order, is_system, is_active
) VALUES

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
 false, null, false, false, 204, true, true),

('HR_PPE_ISSUE_FORM', 'PPE Issue Form', 'نموذج توزيع معدات السلامة', 'HR', 'form',
 'Official PPE issue form with employee signature placeholder.',
 ARRAY['pdf','print'], 'portrait',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.operations.view'],
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

ON CONFLICT (report_code) DO UPDATE SET
  report_name_en = EXCLUDED.report_name_en,
  report_name_ar = EXCLUDED.report_name_ar,
  default_output_formats = EXCLUDED.default_output_formats,
  required_permissions = EXCLUDED.required_permissions,
  sensitive_profile = EXCLUDED.sensitive_profile,
  sensitive_field_rules_json = EXCLUDED.sensitive_field_rules_json,
  filter_schema_json = EXCLUDED.filter_schema_json,
  column_schema_json = EXCLUDED.column_schema_json,
  supports_numbering = EXCLUDED.supports_numbering,
  numbering_rule_code = EXCLUDED.numbering_rule_code,
  is_letter_type = EXCLUDED.is_letter_type,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Numbering Rules for Official HR Letters/Forms
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO global_numbering_rules (
  rule_code, rule_name, module_code, document_type_code,
  prefix, suffix, sequence_padding, include_year, year_format, separator,
  next_sequence_number, reset_frequency, cancelled_number_policy,
  is_active, is_system
) VALUES
('HR_EXPERIENCE_LETTER', 'HR Experience Letter', 'HR', 'HR_EXPERIENCE_LETTER',
 'HR-EL', NULL, 6, true, 'YYYY', '-', 1, 'yearly', 'keep_gap', true, true),

('HR_SALARY_CERTIFICATE', 'HR Salary Certificate', 'HR', 'HR_SALARY_CERT',
 'HR-SC', NULL, 6, true, 'YYYY', '-', 1, 'yearly', 'keep_gap', true, true),

('HR_NOC', 'HR No Objection Certificate', 'HR', 'HR_NOC',
 'HR-NOC', NULL, 6, true, 'YYYY', '-', 1, 'yearly', 'keep_gap', true, true),

('HR_PPE_ISSUE_FORM', 'HR PPE Issue Form', 'HR', 'HR_PPE_ISSUE_FORM',
 'HR-PPE', NULL, 6, true, 'YYYY', '-', 1, 'yearly', 'keep_gap', true, true),

('HR_JOINING_CHECKLIST', 'HR Joining Checklist', 'HR', 'HR_JOINING_CHECKLIST',
 'HR-JC', NULL, 6, true, 'YYYY', '-', 1, 'yearly', 'keep_gap', true, true),

('HR_CLEARANCE_FORM', 'HR Clearance Form', 'HR', 'HR_CLEARANCE_FORM',
 'HR-CF', NULL, 6, true, 'YYYY', '-', 1, 'yearly', 'keep_gap', true, true)

ON CONFLICT (rule_code) DO NOTHING;
