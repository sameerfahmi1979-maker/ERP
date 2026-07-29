-- HR.14A FIX — QA Checks
-- ERPCombobox Upgrade + Passport/EID Duplicate Check
-- Date: 2026-07-09
-- READ-ONLY: No destructive SQL.

-- ============================================================
-- CHECK 1: Feature flag still exists and is disabled by default
-- ============================================================
SELECT
  flag_code,
  label,
  is_enabled,
  requires_human_review
FROM erp_ai_feature_flags
WHERE flag_code = 'ERP_AI_HR_DOCUMENT_TO_EMPLOYEE';
-- Expected: 1 row, is_enabled = false, requires_human_review = true

-- ============================================================
-- CHECK 2: All HR AI feature flags (context)
-- ============================================================
SELECT flag_code, is_enabled, requires_human_review
FROM erp_ai_feature_flags
WHERE flag_code LIKE 'ERP_AI_HR_%'
ORDER BY flag_code;

-- ============================================================
-- CHECK 3: Identity document type codes (PASSPORT, EMIRATES_ID present)
-- ============================================================
SELECT id, code, name_en, is_active
FROM hr_identity_document_types
WHERE code IN ('PASSPORT', 'EMIRATES_ID')
ORDER BY code;
-- Expected: 2 rows (both classifications must exist for duplicate checks to work)

-- ============================================================
-- CHECK 4: Sample EID duplicate candidate query
-- Normalized: strip hyphens and spaces, uppercase
-- This query shows any employees that share the same normalized EID
-- ============================================================
SELECT
  eid.employee_id,
  eid.document_number,
  UPPER(REPLACE(REPLACE(eid.document_number, '-', ''), ' ', '')) AS normalized_number,
  e.employee_code,
  e.full_name_en,
  idt.code AS doc_type_code,
  eid.status
FROM employee_identity_documents eid
JOIN employees e ON e.id = eid.employee_id
JOIN hr_identity_document_types idt ON idt.id = eid.document_type_id
WHERE idt.code = 'EMIRATES_ID'
  AND eid.deleted_at IS NULL
  AND eid.status IN ('active', 'pending')
  AND eid.document_number IS NOT NULL
  AND eid.document_number <> ''
ORDER BY normalized_number, eid.employee_id;
-- Use to visually inspect for existing EID duplicates

-- ============================================================
-- CHECK 5: Sample passport duplicate candidate query
-- ============================================================
SELECT
  pid.employee_id,
  pid.document_number,
  UPPER(REPLACE(pid.document_number, ' ', '')) AS normalized_number,
  e.employee_code,
  e.full_name_en,
  idt.code AS doc_type_code,
  pid.status
FROM employee_identity_documents pid
JOIN employees e ON e.id = pid.employee_id
JOIN hr_identity_document_types idt ON idt.id = pid.document_type_id
WHERE idt.code = 'PASSPORT'
  AND pid.deleted_at IS NULL
  AND pid.status IN ('active', 'pending')
  AND pid.document_number IS NOT NULL
  AND pid.document_number <> ''
ORDER BY normalized_number, pid.employee_id;
-- Use to visually inspect for existing passport duplicates

-- ============================================================
-- CHECK 6: Confirm no new HR intake tables were created
-- ============================================================
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'hr_intake_sessions',
    'hr_document_intake_batches',
    'hr_pre_hire_sessions',
    'hr_document_to_employee_staging'
  );
-- Expected: 0 rows (no new intake tables)

-- ============================================================
-- CHECK 7: Confirm employee_identity_documents table structure
-- (document_number, document_type_id, employee_id, status, deleted_at)
-- ============================================================
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'employee_identity_documents'
  AND column_name IN ('document_number', 'document_type_id', 'employee_id', 'status', 'deleted_at')
ORDER BY column_name;
-- Expected: 5 rows, all fields present

-- ============================================================
-- CHECK 8: Duplicate identity documents by normalized number (actual duplicates)
-- Identifies pairs of employees sharing the same normalized EID or passport
-- ============================================================
SELECT
  idt.code AS doc_type,
  UPPER(REPLACE(REPLACE(eid.document_number, '-', ''), ' ', '')) AS normalized_number,
  COUNT(DISTINCT eid.employee_id) AS employee_count,
  STRING_AGG(DISTINCT e.employee_code, ', ') AS employee_codes
FROM employee_identity_documents eid
JOIN hr_identity_document_types idt ON idt.id = eid.document_type_id
JOIN employees e ON e.id = eid.employee_id
WHERE idt.code IN ('PASSPORT', 'EMIRATES_ID')
  AND eid.deleted_at IS NULL
  AND eid.status IN ('active', 'pending')
  AND eid.document_number IS NOT NULL
  AND eid.document_number <> ''
GROUP BY idt.code, UPPER(REPLACE(REPLACE(eid.document_number, '-', ''), ' ', ''))
HAVING COUNT(DISTINCT eid.employee_id) > 1
ORDER BY employee_count DESC;
-- Expected: 0 rows (no existing duplicates)
-- If rows exist, these are pre-existing data quality issues to investigate

-- ============================================================
-- CHECK 9: DMS document link support for employees
-- ============================================================
SELECT DISTINCT entity_type
FROM dms_document_links
WHERE entity_type = 'employee'
LIMIT 1;
-- Expected: 1 row with entity_type = 'employee'

-- ============================================================
-- CHECK 10: HR audit log — document_to_employee events (recent)
-- ============================================================
SELECT
  action,
  entity_reference,
  created_at,
  new_values->>'selected_document_ids' AS doc_ids,
  new_values->>'identity_doc_duplicates_found' AS id_dups_found
FROM audit_logs
WHERE module_code = 'HR'
  AND action LIKE 'document_to_employee.%'
ORDER BY created_at DESC
LIMIT 20;
-- Shows recent wizard activity including identity duplicate check counts

-- ============================================================
-- CHECK 11: HR numbering rule for employee codes
-- ============================================================
SELECT entity_type, prefix, padding_length, last_number, is_active
FROM numbering_rules
WHERE entity_type = 'employee'
  AND is_active = true;
-- Expected: 1 active rule

-- ============================================================
-- CHECK 12: departments, designations, hr_employee_categories, hr_employment_types
-- Confirms the lookup data used in ERPCombobox exists
-- ============================================================
SELECT 'departments' AS table_name, COUNT(*) AS active_count
FROM departments WHERE is_active = true
UNION ALL
SELECT 'designations', COUNT(*) FROM designations WHERE is_active = true
UNION ALL
SELECT 'hr_employee_categories', COUNT(*) FROM hr_employee_categories WHERE is_active = true
UNION ALL
SELECT 'hr_employment_types', COUNT(*) FROM hr_employment_types WHERE is_active = true;
-- Expected: all counts >= 0 (tables exist and are accessible)
