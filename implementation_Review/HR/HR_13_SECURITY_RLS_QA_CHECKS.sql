-- ─────────────────────────────────────────────────────────────────────────────
-- HR.13 — Security / RLS / QA Read-Only SQL Checks
-- Phase: HR.13 — Security / RLS / QA / UAT Closure
-- Date: 2026-06-19
-- Purpose: Verify HR module table existence, RLS, permissions, AI flags.
--          READ-ONLY — no INSERT / UPDATE / DELETE in this file.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK 1: HR Tables Exist
-- ─────────────────────────────────────────────────────────────────────────────

SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    -- Employee core
    'employees', 'employee_status_events', 'employee_document_links',
    -- Compliance
    'employee_identity_documents', 'employee_medical_insurances',
    'employee_dependents', 'employee_access_cards',
    'employee_training_certificates', 'employee_medical_records',
    -- Time
    'employee_attendance_punches', 'employee_attendance_daily_summary',
    'employee_attendance_corrections', 'employee_shift_assignments',
    'employee_leave_requests', 'employee_leave_balances',
    'employee_overtime_records',
    -- Payroll
    'employee_payroll_profiles', 'employee_salary_components',
    'employee_salary_revisions', 'employee_payroll_holds',
    'employee_wps_profiles',
    -- Operations
    'employee_assignments', 'employee_role_requirements',
    'employee_site_readiness', 'employee_operational_blocks',
    'employee_assets', 'employee_ppe_issues',
    'employee_accommodation_records',
    -- HR Actions
    'employee_pro_processes', 'employee_hr_actions',
    'employee_performance_records', 'employee_disciplinary_records',
    'employee_hr_notes', 'employee_approval_requests',
    'employee_eos_cases', 'employee_clearance_items',
    -- Recruitment
    'hr_job_requisitions', 'hr_candidates', 'hr_candidate_documents',
    'hr_interviews', 'hr_offers', 'hr_onboarding_tasks',
    'employee_recruitment_links'
  )
ORDER BY tablename;

-- Expected: All 37 rows returned


-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK 2: HR Settings Tables Exist
-- ─────────────────────────────────────────────────────────────────────────────

SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'hr_employee_categories', 'hr_employment_types', 'hr_grades',
    'hr_leave_types', 'hr_identity_document_types', 'hr_medical_record_types',
    'hr_training_types', 'hr_training_categories', 'hr_relationship_types',
    'hr_access_card_types', 'hr_payroll_groups', 'hr_salary_component_types',
    'hr_mohre_establishments', 'hr_approval_workflows', 'hr_pro_process_types',
    'hr_readiness_rule_templates', 'hr_role_requirement_matrix',
    'hr_site_requirement_matrix'
  )
ORDER BY tablename;

-- Expected: All 18 rows returned


-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK 3: All HR/Report/AI Tables Have RLS Enabled
-- ─────────────────────────────────────────────────────────────────────────────

SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND (tablename LIKE 'employee%' OR tablename LIKE 'hr_%'
       OR tablename LIKE 'erp_ai%' OR tablename LIKE 'erp_report%')
  AND rowsecurity = false
ORDER BY tablename;

-- Expected: 0 rows (all tables have RLS enabled)


-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK 4: All HR/Report/AI Tables Have RLS FORCED
-- ─────────────────────────────────────────────────────────────────────────────

SELECT c.relname AS tablename, c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND (c.relname LIKE 'employee%' OR c.relname LIKE 'hr_%'
       OR c.relname LIKE 'erp_ai%' OR c.relname LIKE 'erp_report%')
  AND c.relforcerowsecurity = false
ORDER BY c.relname;

-- Expected: 0 rows (all tables have RLS forced)


-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK 5: HR Tables Have Minimum Policy Count
-- ─────────────────────────────────────────────────────────────────────────────

SELECT tablename,
       (SELECT count(*) FROM pg_policies
        WHERE pg_policies.tablename = pg_tables.tablename
          AND schemaname = 'public') AS policy_count
FROM pg_tables
WHERE schemaname = 'public'
  AND (tablename LIKE 'employee%' OR tablename LIKE 'hr_%')
  AND (SELECT count(*) FROM pg_policies
       WHERE pg_policies.tablename = pg_tables.tablename
         AND schemaname = 'public') < 2
ORDER BY tablename;

-- Expected: 0 rows (all tables have at least 2 policies)


-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK 6: HR Permissions Seeded
-- ─────────────────────────────────────────────────────────────────────────────

SELECT permission_code, is_active
FROM permissions
WHERE permission_code IN (
  'hr.settings.view','hr.settings.manage',
  'hr.employees.view','hr.employees.create','hr.employees.update','hr.employees.archive',
  'hr.compliance.view','hr.compliance.manage',
  'hr.attendance.view','hr.attendance.manage',
  'hr.leave.view','hr.leave.manage',
  'hr.payroll.view','hr.payroll.manage',
  'hr.operations.view','hr.operations.manage',
  'hr.assignments.view','hr.assignments.manage',
  'hr.actions.view','hr.actions.manage',
  'hr.recruitment.view','hr.recruitment.manage',
  'hr.eos.view','hr.eos.manage',
  'hr.medical.view','hr.medical.manage',
  'hr.dashboard.view','hr.search.use',
  'hr.ai.view','hr.ai.use','hr.ai.fill','hr.ai.manage',
  'hr.ai.review','hr.ai.apply_suggestion',
  'hr.admin','hr.employee_profile.view','hr.employee_profile.manage'
)
ORDER BY permission_code;

-- Expected: All 38 rows with is_active = true


-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK 7: REPORTS Permissions Seeded with Role Assignments
-- ─────────────────────────────────────────────────────────────────────────────

SELECT p.permission_code, count(rp.role_id) AS role_count
FROM permissions p
LEFT JOIN role_permissions rp ON rp.permission_id = p.id
WHERE p.module_code = 'REPORTS'
GROUP BY p.permission_code
ORDER BY p.permission_code;

-- Expected: All REPORTS permissions have role_count >= 2
-- reports.view/run/export/saved_filters.manage: 5 roles
-- reports.email/history.view/sign/schedule.view: 4 roles
-- reports.manage/schedule.manage/column_profiles.manage: 2 roles


-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK 8: HR AI Permissions Have Role Assignments
-- ─────────────────────────────────────────────────────────────────────────────

SELECT p.permission_code, count(rp.role_id) AS role_count
FROM permissions p
LEFT JOIN role_permissions rp ON rp.permission_id = p.id
WHERE p.permission_code LIKE 'hr.ai.%'
GROUP BY p.permission_code
ORDER BY p.permission_code;

-- Expected:
-- hr.ai.view/use/fill/review/apply_suggestion: role_count >= 3
-- hr.ai.manage: role_count >= 2


-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK 9: Key Role-Permission Mappings Verified (hr_manager)
-- ─────────────────────────────────────────────────────────────────────────────

SELECT p.permission_code
FROM roles r
JOIN role_permissions rp ON rp.role_id = r.id
JOIN permissions p ON p.id = rp.permission_id
WHERE r.role_code = 'hr_manager'
  AND p.module_code IN ('HR','REPORTS')
ORDER BY p.permission_code;

-- Expected: hr_manager has HR + REPORTS permissions


-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK 10: HR AI Feature Flags Exist and Are Disabled by Default
-- ─────────────────────────────────────────────────────────────────────────────

SELECT feature_code, is_enabled, requires_human_review
FROM erp_ai_feature_flags
WHERE feature_code LIKE 'ERP_AI_HR_%'
ORDER BY feature_code;

-- Expected: 9 rows, all is_enabled = false, all requires_human_review = true


-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK 11: All DMS/Common AI Feature Flags Require Human Review
-- ─────────────────────────────────────────────────────────────────────────────

SELECT feature_code, is_enabled, requires_human_review
FROM erp_ai_feature_flags
WHERE requires_human_review = false AND feature_code LIKE 'ERP_AI_HR_%';

-- Expected: 0 rows (all HR AI flags require human review)


-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK 12: Report Registry Has HR Report Entries
-- ─────────────────────────────────────────────────────────────────────────────

SELECT report_code, report_name, is_active
FROM erp_report_registry
WHERE report_code LIKE 'HR_%'
ORDER BY report_code;

-- Expected: 26 rows (12 reports + 6 important + 8 letters/forms from REPORT.4)


-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK 13: No Serial/UUID PKs in New HR Tables (All Should Be BIGINT Generated)
-- ─────────────────────────────────────────────────────────────────────────────

SELECT c.table_name, c.column_name, c.data_type, c.column_default
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.column_name = 'id'
  AND c.table_name IN (
    'employees','employee_payroll_profiles','employee_salary_components',
    'employee_salary_revisions','employee_payroll_holds','employee_wps_profiles',
    'employee_assignments','employee_role_requirements','employee_site_readiness',
    'employee_operational_blocks','employee_assets','employee_ppe_issues',
    'employee_accommodation_records','employee_leave_requests','employee_leave_balances',
    'employee_overtime_records','employee_attendance_punches',
    'employee_attendance_daily_summary','employee_shift_assignments',
    'employee_pro_processes','employee_hr_actions','employee_performance_records',
    'employee_disciplinary_records','employee_hr_notes','employee_approval_requests',
    'employee_eos_cases','employee_clearance_items',
    'employee_identity_documents','employee_medical_insurances',
    'employee_dependents','employee_access_cards','employee_training_certificates',
    'employee_medical_records','employee_recruitment_links',
    'hr_job_requisitions','hr_candidates','hr_interviews','hr_offers',
    'hr_onboarding_tasks','erp_report_runs','erp_report_registry',
    'erp_report_delivery_logs','erp_report_schedules','erp_ai_usage_logs'
  )
  AND (c.data_type NOT IN ('bigint') OR c.column_default LIKE '%serial%' OR c.column_default LIKE '%uuid%')
ORDER BY c.table_name;

-- Expected: 0 rows (all new HR tables use BIGINT generated always as identity)


-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK 14: Payroll Sensitive Data — RLS Policies Include Payroll Check
-- ─────────────────────────────────────────────────────────────────────────────

SELECT policyname, tablename, cmd, qual
FROM pg_policies
WHERE tablename IN ('employee_payroll_profiles','employee_salary_components',
                    'employee_salary_revisions','employee_wps_profiles')
ORDER BY tablename, policyname;

-- Expected: Policies reference hr.payroll.view or payroll_definer functions


-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK 15: Medical Sensitive Data — RLS Policies Include Medical Check
-- ─────────────────────────────────────────────────────────────────────────────

SELECT policyname, tablename, cmd
FROM pg_policies
WHERE tablename IN ('employee_medical_records','employee_medical_insurances')
ORDER BY tablename, policyname;

-- Expected: Policies reference hr.medical.view or equivalent guard


-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK 16: Report Run History — immutable (no UPDATE/DELETE policies)
-- ─────────────────────────────────────────────────────────────────────────────

SELECT policyname, tablename, cmd
FROM pg_policies
WHERE tablename IN ('erp_report_runs','erp_report_delivery_logs')
  AND cmd IN ('UPDATE','DELETE')
ORDER BY tablename, policyname;

-- Expected: Only the no-op update policy for erp_report_runs and erp_report_delivery_logs
-- (these are append-only audit tables — no real UPDATE/DELETE allowed by design)


-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK 17: AI Usage Log — Read-Only for Users
-- ─────────────────────────────────────────────────────────────────────────────

SELECT policyname, tablename, cmd
FROM pg_policies
WHERE tablename = 'erp_ai_usage_logs'
ORDER BY policyname;

-- Expected: SELECT policy (own logs) + INSERT policy for logging — no UPDATE/DELETE


-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK 18: Salary Revision Table — SELECT + INSERT Only (No UPDATE/DELETE)
-- ─────────────────────────────────────────────────────────────────────────────

SELECT policyname, tablename, cmd
FROM pg_policies
WHERE tablename = 'employee_salary_revisions'
ORDER BY cmd, policyname;

-- Expected: Only SELECT + INSERT policies (append-only salary history)


-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK 19: HR Numbering Rules Exist (for Letters/Forms)
-- ─────────────────────────────────────────────────────────────────────────────

SELECT rule_code, prefix, is_active
FROM global_numbering_rules
WHERE rule_code IN ('HREL','HREL_AR','HRSAL','HRSAL_AR','HRNOC','HRELOA')
ORDER BY rule_code;

-- Expected: 6 rows, all is_active = true


-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK 20: All Roles Have Key HR Permissions
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  r.role_code,
  COUNT(CASE WHEN p.permission_code = 'hr.employees.view' THEN 1 END) AS has_emp_view,
  COUNT(CASE WHEN p.permission_code = 'hr.dashboard.view' THEN 1 END) AS has_dashboard,
  COUNT(CASE WHEN p.permission_code = 'reports.view' THEN 1 END) AS has_reports_view,
  COUNT(CASE WHEN p.permission_code = 'reports.run' THEN 1 END) AS has_reports_run
FROM roles r
LEFT JOIN role_permissions rp ON rp.role_id = r.id
LEFT JOIN permissions p ON p.id = rp.permission_id
WHERE r.role_code IN ('system_admin','group_admin','company_admin','hr_manager','finance_manager')
GROUP BY r.role_code
ORDER BY r.role_code;

-- Expected: system_admin, group_admin, company_admin, hr_manager, finance_manager
-- all show has_emp_view=1, has_reports_view=1, has_reports_run=1
