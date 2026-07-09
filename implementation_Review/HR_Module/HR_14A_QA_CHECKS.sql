-- ============================================================
-- HR.14A QA CHECKS — READ-ONLY
-- Generated: 2026-07-09
-- Phase: HR.14A — Employee Creation from Existing DMS Documents
-- All queries are SELECT only. No destructive SQL.
-- ============================================================

-- ── 1. Feature flag exists and is disabled by default ──────────────────────────
SELECT
  feature_code,
  feature_name,
  is_enabled,
  requires_human_review,
  min_confidence_threshold,
  description
FROM public.erp_ai_feature_flags
WHERE feature_code = 'ERP_AI_HR_DOCUMENT_TO_EMPLOYEE';
-- EXPECTED: 1 row, is_enabled = false, requires_human_review = true

-- ── 2. Feature flag requires human review ─────────────────────────────────────
SELECT feature_code, requires_human_review
FROM public.erp_ai_feature_flags
WHERE feature_code = 'ERP_AI_HR_DOCUMENT_TO_EMPLOYEE'
  AND requires_human_review = true;
-- EXPECTED: 1 row

-- ── 3. No hr_pre_hire_intake table exists ─────────────────────────────────────
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'hr_pre_hire_intake', 'hr_intake_sessions', 'hr_document_intake',
    'hr14a_intake', 'hr_document_to_employee_sessions'
  );
-- EXPECTED: 0 rows (no intake tables were created)

-- ── 4. No unexpected HR.14A tables created ────────────────────────────────────
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE '%hr14a%';
-- EXPECTED: 0 rows (HR.14A created no new tables)

-- ── 5. dms_document_links supports employee entity links ──────────────────────
-- Check the entity_type check constraint or foreign key support
SELECT
  column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'dms_document_links'
  AND column_name IN ('entity_type', 'entity_id', 'link_role')
ORDER BY column_name;
-- EXPECTED: entity_type (text), entity_id (int/bigint), link_role (text)

-- Sample: any employee-linked documents already exist?
SELECT
  dl.id,
  dl.document_id,
  dl.entity_type,
  dl.entity_id,
  dl.link_role,
  dl.created_at
FROM public.dms_document_links dl
WHERE dl.entity_type = 'employee'
  AND dl.deleted_at IS NULL
ORDER BY dl.created_at DESC
LIMIT 20;

-- ── 6. Employee identity docs have dms_document_id column ─────────────────────
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'employee_identity_documents'
  AND column_name = 'dms_document_id';
-- EXPECTED: 1 row, data_type int4/bigint

-- Sample records created from DMS (dms_document_id not null)
SELECT
  id, employee_id, document_number, dms_document_id, created_at
FROM public.employee_identity_documents
WHERE dms_document_id IS NOT NULL
ORDER BY created_at DESC
LIMIT 10;

-- ── 7. Employee medical insurance has dms_document_id column ──────────────────
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'employee_medical_insurances'
  AND column_name = 'dms_document_id';
-- EXPECTED: 1 row

-- Sample records created from DMS
SELECT
  id, employee_id, insurance_provider, policy_number, dms_document_id, created_at
FROM public.employee_medical_insurances
WHERE dms_document_id IS NOT NULL
ORDER BY created_at DESC
LIMIT 10;

-- ── 8. Audit log table exists ─────────────────────────────────────────────────
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'audit_logs';
-- EXPECTED: 1 row

-- ── 9. HR_EMPLOYEE numbering rule exists ──────────────────────────────────────
SELECT
  rule_code, prefix, next_number, padding_length, is_active
FROM public.reference_number_rules
WHERE rule_code = 'HR_EMPLOYEE';
-- EXPECTED: 1 row, is_active = true

-- ── 10. Sample: recent document_to_employee audit events ──────────────────────
SELECT
  id,
  module_code,
  entity_name,
  entity_id,
  entity_reference,
  action,
  new_values,
  created_at
FROM public.audit_logs
WHERE action IN (
  'document_to_employee.aggregate',
  'document_to_employee.duplicate_check',
  'document_to_employee.create'
)
ORDER BY created_at DESC
LIMIT 20;

-- ── 11. Sample: employee records with DMS links ───────────────────────────────
SELECT
  e.id AS employee_id,
  e.employee_code,
  e.full_name_en,
  e.joining_date,
  e.created_at,
  COUNT(dl.id) AS linked_document_count
FROM public.employees e
INNER JOIN public.dms_document_links dl
  ON dl.entity_type = 'employee'
  AND dl.entity_id = e.id
  AND dl.deleted_at IS NULL
GROUP BY e.id, e.employee_code, e.full_name_en, e.joining_date, e.created_at
ORDER BY e.created_at DESC
LIMIT 20;

-- ── 12. Sample: compliance records created from DMS docs ──────────────────────
-- Identity documents linked to DMS
SELECT
  eid.id,
  eid.employee_id,
  eid.document_number,
  eid.dms_document_id,
  d.title AS dms_document_title,
  eid.created_at
FROM public.employee_identity_documents eid
JOIN public.dms_documents d ON d.id = eid.dms_document_id
WHERE eid.dms_document_id IS NOT NULL
  AND eid.deleted_at IS NULL
ORDER BY eid.created_at DESC
LIMIT 20;

-- Medical insurance linked to DMS
SELECT
  mi.id,
  mi.employee_id,
  mi.insurance_provider,
  mi.policy_number,
  mi.dms_document_id,
  d.title AS dms_document_title,
  mi.created_at
FROM public.employee_medical_insurances mi
JOIN public.dms_documents d ON d.id = mi.dms_document_id
WHERE mi.dms_document_id IS NOT NULL
  AND mi.deleted_at IS NULL
ORDER BY mi.created_at DESC
LIMIT 20;

-- ── 13. RLS enabled on involved tables ────────────────────────────────────────
SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled,
  forcerowsecurity AS rls_forced
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'employees',
    'employee_identity_documents',
    'employee_medical_insurances',
    'employee_status_events',
    'dms_documents',
    'dms_document_links',
    'dms_ai_extraction_results',
    'erp_ai_feature_flags',
    'audit_logs'
  )
ORDER BY tablename;
-- EXPECTED: rowsecurity = true for all tables (or enforced via admin-only writes)

-- ── 14. Permissions exist for HR.14A-required permission codes ────────────────
SELECT
  permission_code,
  description
FROM public.permissions
WHERE permission_code IN (
  'hr.employees.create',
  'hr.employees.view',
  'hr.compliance.manage',
  'dms.documents.view',
  'dms.admin'
)
ORDER BY permission_code;
-- EXPECTED: at least hr.employees.create, hr.employees.view, dms.documents.view

-- ── 15. Verify dms_document_links.link_role accepts 'hr14a_source' ────────────
-- Check if there's a CHECK constraint on link_role
SELECT
  conname,
  consrc
FROM pg_constraint
WHERE conrelid = 'public.dms_document_links'::regclass
  AND contype = 'c';
-- Review if link_role is constrained; if so, hr14a_source must be in the allowed list

-- ── 16. Verify no hr14a documents are hard-deleted or orphaned ───────────────
SELECT
  dl.document_id,
  d.id AS dms_doc_id,
  d.title,
  d.deleted_at
FROM public.dms_document_links dl
LEFT JOIN public.dms_documents d ON d.id = dl.document_id
WHERE dl.entity_type = 'employee'
  AND dl.link_role = 'hr14a_source'
  AND dl.deleted_at IS NULL
  AND d.id IS NULL;
-- EXPECTED: 0 rows (no orphaned links)

-- ── END OF HR.14A QA CHECKS ────────────────────────────────────────────────────
