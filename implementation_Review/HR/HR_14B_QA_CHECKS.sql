-- ============================================================
-- HR.14B QA SQL Checks
-- Phase: HR.14B QA — Runtime Test, Security Review, and Gap Report
-- Date: 2026-07-09
-- Author: QA Agent
-- NOTE: All queries are READ-ONLY. No destructive SQL.
-- ============================================================

-- ── QA Check 1: Feature flag exists and is disabled by default ─────────────────
-- Expected: ERP_AI_HR_DOCUMENT_TO_RECORD row with is_enabled = false, requires_human_review = true
SELECT
  feature_code,
  feature_name,
  is_enabled,
  requires_human_review,
  description
FROM erp_ai_feature_flags
WHERE feature_code = 'ERP_AI_HR_DOCUMENT_TO_RECORD';

-- ── QA Check 2: Both HR.14 flags present and well-configured ──────────────────
-- Expected: 2 rows, both is_enabled=false, both requires_human_review=true
SELECT
  feature_code,
  feature_name,
  is_enabled,
  requires_human_review
FROM erp_ai_feature_flags
WHERE feature_code IN ('ERP_AI_HR_DOCUMENT_TO_EMPLOYEE', 'ERP_AI_HR_DOCUMENT_TO_RECORD')
ORDER BY feature_code;

-- ── QA Check 3: No unexpected HR.14B intake/pre-hire tables ───────────────────
-- Expected: Empty result (no such tables should exist)
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND (
    table_name ILIKE '%hr14b%'
    OR table_name ILIKE '%pre_hire%'
    OR table_name ILIKE '%intake_session%'
  )
ORDER BY table_name;

-- ── QA Check 4: dms_document_links unique index (partial index check) ─────────
-- NOTE: This is PARTIAL (WHERE deleted_at IS NULL). See GAP-HR14B-001.
-- Expected: 1 partial unique index on (document_id, entity_type, entity_id)
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'dms_document_links'
  AND indexdef ILIKE '%document_id%entity_type%entity_id%';

-- ── QA Check 5: DMS links created via HR.14B wizard ──────────────────────────
-- Expected: 0 rows (wizard not yet used in production)
-- After use: rows with link_role = 'hr14b_source'
SELECT
  id,
  document_id,
  entity_type,
  entity_id,
  link_role,
  created_at
FROM dms_document_links
WHERE link_role = 'hr14b_source'
ORDER BY created_at DESC
LIMIT 20;

-- ── QA Check 6: Count of DMS links by role (hr14b_source vs hr14a_source) ─────
SELECT
  link_role,
  entity_type,
  COUNT(*) AS cnt
FROM dms_document_links
WHERE link_role IN ('hr14a_source', 'hr14b_source')
GROUP BY link_role, entity_type
ORDER BY link_role, entity_type;

-- ── QA Check 7: Identity documents created from DMS (dms_document_id set) ─────
-- Expected: count of identity docs linked to a DMS document
SELECT COUNT(*) AS identity_docs_with_dms_document
FROM employee_identity_documents
WHERE dms_document_id IS NOT NULL;

-- ── QA Check 8: Medical insurance records with dms_document_id ────────────────
SELECT COUNT(*) AS insurance_records_with_dms_document
FROM employee_medical_insurances
WHERE dms_document_id IS NOT NULL;

-- ── QA Check 9: employee_dependents table has dms_document_id column ──────────
-- Expected: 1 row showing the column exists as bigint nullable
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'employee_dependents'
  AND column_name = 'dms_document_id';

-- ── QA Check 10: Recent HR.14B audit events ───────────────────────────────────
-- Expected: 0 rows (wizard not yet used); after use: hr14b.* actions logged
SELECT
  action,
  entity_name,
  entity_reference,
  created_at
FROM audit_logs
WHERE action LIKE 'hr14b.%'
ORDER BY created_at DESC
LIMIT 20;

-- ── QA Check 11: Verify hr14b audit actions do NOT log full document numbers ──
-- Expected: new_values should NOT contain full passport_number / emirates_id_number
-- Inspect new_values column for recent hr14b audit entries (if any)
SELECT
  action,
  new_values,
  created_at
FROM audit_logs
WHERE action LIKE 'hr14b.%'
ORDER BY created_at DESC
LIMIT 5;

-- ── QA Check 12: No new tables introduced by HR.14B ──────────────────────────
-- Expected: 0 rows — HR.14B operates purely on existing tables
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND created_at::text >= '2026-07-09'   -- filter tables created today
  AND table_name NOT ILIKE '%migration%'
ORDER BY table_name;

-- ── QA Check 13: Orphaned hr14b_source links (linked doc deleted from DMS) ────
-- Expected: 0 rows (all linked docs should still exist)
SELECT
  dl.id AS link_id,
  dl.document_id,
  dl.entity_id,
  dl.link_role,
  dl.created_at
FROM dms_document_links dl
LEFT JOIN dms_documents dd ON dd.id = dl.document_id
WHERE dl.link_role = 'hr14b_source'
  AND dd.id IS NULL;

-- ── QA Check 14: Dependent records with hr14b_source DMS links ───────────────
-- Shows dependents whose employee has hr14b_source DMS links
SELECT
  ed.id AS dependent_id,
  ed.dependent_name_en,
  ed.employee_id,
  ed.dms_document_id,
  ed.created_at
FROM employee_dependents ed
WHERE ed.dms_document_id IS NOT NULL
ORDER BY ed.created_at DESC
LIMIT 10;

-- ── QA Check 15: Duplicate identity document numbers by type ─────────────────
-- Shows normalized document numbers that appear more than once across employees
-- (detects if duplicate blocking is not working correctly)
SELECT
  LOWER(REPLACE(REPLACE(document_number, ' ', ''), '-', '')) AS normalized_doc_num,
  dt.code AS doc_type_code,
  COUNT(DISTINCT eid.employee_id) AS employee_count,
  COUNT(*) AS record_count
FROM employee_identity_documents eid
JOIN hr_identity_document_types dt ON dt.id = eid.document_type_id
WHERE dt.code IN ('PASSPORT', 'EMIRATES_ID')
  AND eid.deleted_at IS NULL
GROUP BY
  LOWER(REPLACE(REPLACE(document_number, ' ', ''), '-', '')),
  dt.code
HAVING COUNT(DISTINCT eid.employee_id) > 1
ORDER BY employee_count DESC
LIMIT 20;

-- ── QA Check 16: employee_identity_documents schema check ─────────────────────
-- Verify dms_document_id column exists on employee_identity_documents
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'employee_identity_documents'
  AND column_name = 'dms_document_id';

-- ── QA Check 17: employee_medical_insurances schema check ─────────────────────
-- Verify dms_document_id column exists on employee_medical_insurances
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'employee_medical_insurances'
  AND column_name = 'dms_document_id';

-- ── QA Check 18: RLS status on involved tables ────────────────────────────────
SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled,
  forcerowsecurity AS rls_forced
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'dms_documents',
    'dms_document_links',
    'dms_ai_extraction_results',
    'employee_identity_documents',
    'employee_medical_insurances',
    'employee_dependents',
    'employees'
  )
ORDER BY tablename;

-- ── QA Check 19: Required permissions exist in system ────────────────────────
SELECT
  code,
  name,
  module_code
FROM permissions
WHERE code IN (
  'hr.compliance.manage',
  'hr.admin',
  'hr.compliance.view',
  'dms.documents.view',
  'dms.admin'
)
ORDER BY code;

-- ── QA Check 20: Verify no hr14b_source links reference non-employee entity ───
-- All HR.14B links should be entity_type = 'employee'
SELECT
  entity_type,
  link_role,
  COUNT(*) AS cnt
FROM dms_document_links
WHERE link_role = 'hr14b_source'
GROUP BY entity_type, link_role;
