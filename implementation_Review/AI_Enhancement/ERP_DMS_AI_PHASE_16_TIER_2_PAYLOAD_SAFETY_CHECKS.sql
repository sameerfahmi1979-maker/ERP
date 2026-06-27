-- ============================================================================
-- ERP DMS AI Phase 16 Tier 2 — Payload Safety Checks
-- ============================================================================
--
-- Run these queries to verify:
--   1. No raw OCR/content/prompt/AI response in apply tables
--   2. No IBAN/account/salary/payroll/medical fields in apply summaries
--   3. TRN summaries are masked (no unmasked TRN > 8 chars)
--   4. No party_bank_details / HR table items in apply history
--   5. apply items target only allowlisted tables
--   6. Value summaries within 200 chars
--
-- Expected: All safety checks pass with 0 unsafe rows.
-- ============================================================================

-- ── 1. No raw OCR/content/prompt text in proposed/applied value summaries ─────

SELECT COUNT(*) AS unsafe_raw_content_count
FROM dms_ai_erp_apply_items
WHERE
  proposed_value_summary ILIKE '%ocr%'
  OR proposed_value_summary ILIKE '%content_text%'
  OR proposed_value_summary ILIKE '%chunk_text%'
  OR applied_value_summary ILIKE '%ocr%'
  OR applied_value_summary ILIKE '%content_text%';
-- Expected: 0

-- ── 2. No IBAN/account/salary values in summaries ─────────────────────────────

SELECT COUNT(*) AS unsafe_sensitive_field_count
FROM dms_ai_erp_apply_items
WHERE
  target_field ILIKE '%iban%'
  OR target_field ILIKE '%account_number%'
  OR target_field ILIKE '%salary%'
  OR target_field ILIKE '%payroll%'
  OR target_field ILIKE '%password%'
  OR target_field ILIKE '%secret%';
-- Expected: 0

-- ── 3. No items targeting forbidden tables ─────────────────────────────────────

SELECT COUNT(*) AS forbidden_table_items
FROM dms_ai_erp_apply_items
WHERE
  target_table IN (
    'parties',
    'party_bank_details',
    'party_contacts',
    'party_addresses',
    'party_finance_profiles',
    'employee_identity_documents',
    'employee_medical_insurances',
    'employee_salaries',
    'payroll_records',
    'erp_ai_feature_flags',
    'audit_logs',
    'erp_ai_usage_logs'
  );
-- Expected: 0

-- ── 4. No items targeting direct party FK columns ────────────────────────────

SELECT COUNT(*) AS forbidden_party_column_items
FROM dms_ai_erp_apply_items
WHERE
  target_table IN ('party_licenses', 'party_tax_registrations')
  AND target_field NOT IN (
    -- party_licenses allowlist
    'license_number', 'license_name', 'license_activity_text', 'issue_date', 'expiry_date', 'remarks',
    -- party_tax_registrations allowlist
    'tax_registration_number', 'effective_from', 'effective_to'
  );
-- Expected: 0

-- ── 5. TRN summaries masked in party tax items ────────────────────────────────
-- Check that applied_value_summary for TRN fields never contains unmasked long TRN

SELECT
  i.id,
  i.target_field,
  i.applied_value_summary
FROM dms_ai_erp_apply_items i
WHERE
  i.target_table = 'party_tax_registrations'
  AND i.target_field = 'tax_registration_number'
  AND i.status = 'applied'
  AND LENGTH(i.applied_value_summary) > 12  -- masked format = first4****last4 = max 12 chars
;
-- Expected: 0 rows (all TRN summaries should be masked to max ~12 chars)

-- ── 6. Value summaries within 200 chars ──────────────────────────────────────

SELECT COUNT(*) AS oversized_summaries
FROM dms_ai_erp_apply_items
WHERE
  LENGTH(proposed_value_summary) > 200
  OR LENGTH(applied_value_summary) > 200
  OR LENGTH(current_value_summary) > 200;
-- Expected: 0

-- ── 7. No raw AI prompt/response in audit logs for apply events ───────────────

SELECT COUNT(*) AS unsafe_audit_entries
FROM audit_logs
WHERE
  action IN (
    'dms_apply_to_erp_run_created',
    'dms_apply_to_erp_item_applied',
    'dms_apply_to_erp_item_skipped',
    'dms_apply_to_erp_item_conflict',
    'dms_apply_to_erp_run_completed'
  )
  AND (
    new_values::text ILIKE '%ocr%'
    OR new_values::text ILIKE '%content_text%'
    OR new_values::text ILIKE '%prompt%'
    OR new_values::text ILIKE '%embedding%'
    OR new_values::text ILIKE '%iban%'
    OR new_values::text ILIKE '%salary%'
  );
-- Expected: 0

-- ── 8. Verify run target_module values are only valid (dms_document, dms_metadata, party) ───

SELECT target_module, COUNT(*)
FROM dms_ai_erp_apply_runs
WHERE target_module NOT IN ('dms_document', 'dms_metadata', 'party')
GROUP BY target_module;
-- Expected: 0 rows (all target_module values are valid)

-- ── 9. Verify party runs have target_record_id set ────────────────────────────

SELECT COUNT(*) AS party_runs_without_record_id
FROM dms_ai_erp_apply_runs
WHERE target_module = 'party'
  AND target_record_id IS NULL;
-- Expected: 0 (party runs must always have target_record_id = party_id set)

-- ── 10. Summary of party apply items ──────────────────────────────────────────

SELECT
  i.target_table,
  i.target_field,
  i.status,
  COUNT(*) AS item_count
FROM dms_ai_erp_apply_items i
JOIN dms_ai_erp_apply_runs r ON r.id = i.apply_run_id
WHERE r.target_module = 'party'
GROUP BY i.target_table, i.target_field, i.status
ORDER BY i.target_table, i.target_field, i.status;
-- Informational: shows Party apply history distribution

-- ── End of Payload Safety Checks ─────────────────────────────────────────────
