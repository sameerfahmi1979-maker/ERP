-- ============================================================================
-- ERP DMS AI Phase 16 — Payload Safety Checks
-- Verifies that no raw content, OCR text, prompts, or AI responses are
-- stored in the new apply history tables.
-- Run via: user-supabase MCP execute_sql
-- ============================================================================

-- ── 1. No forbidden columns exist in apply tables ─────────────────────────────

SELECT
  CASE WHEN COUNT(*) = 0 THEN 'PASS — no forbidden columns' ELSE 'FAIL — forbidden column found' END AS forbidden_column_check,
  array_agg(table_name || '.' || column_name) AS offending_columns
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('dms_ai_erp_apply_runs', 'dms_ai_erp_apply_items')
  AND column_name ~* '(ocr_text|content_text|chunk_text|full_text|raw_response|prompt|embedding|vector|api_key|secret|password|iban|account_number|salary|payroll)';

-- ── 2. Summary columns exist and are text type ────────────────────────────────

SELECT
  column_name,
  data_type,
  CASE WHEN data_type = 'text' THEN 'PASS' ELSE 'FAIL — unexpected type' END AS type_check
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'dms_ai_erp_apply_items'
  AND column_name IN (
    'current_value_summary',
    'proposed_value_summary',
    'applied_value_summary',
    'target_display_label',
    'skip_reason',
    'failure_reason'
  )
ORDER BY column_name;

-- ── 3. Check actual data in apply tables for raw content (if any rows exist) ──

-- Checks that no summary field exceeds 200 chars
SELECT
  'apply_items_summary_length_check' AS check_name,
  COUNT(*) AS rows_with_oversized_summaries,
  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL — oversized summaries found' END AS result
FROM public.dms_ai_erp_apply_items
WHERE
  char_length(current_value_summary)  > 200
  OR char_length(proposed_value_summary) > 200
  OR char_length(applied_value_summary)  > 200
  OR char_length(target_display_label)   > 200
  OR char_length(skip_reason)            > 200
  OR char_length(failure_reason)         > 200;

-- ── 4. Run error_message length check ────────────────────────────────────────

SELECT
  'apply_runs_error_length_check' AS check_name,
  COUNT(*) AS rows_with_oversized_error,
  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL — oversized error messages found' END AS result
FROM public.dms_ai_erp_apply_runs
WHERE char_length(error_message) > 500;

-- ── 5. No raw OCR patterns in any text columns ────────────────────────────────
-- Look for suspicious long values that might indicate raw content leakage

SELECT
  'apply_items_content_leakage_check' AS check_name,
  COUNT(*) AS suspicious_rows,
  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'WARN — review rows manually' END AS result
FROM public.dms_ai_erp_apply_items
WHERE
  char_length(proposed_value_summary) > 150  -- summaries should be short
  OR char_length(current_value_summary) > 150;

-- ── 6. Confirm status values are only from allowed set ────────────────────────

SELECT
  'apply_runs_status_values' AS check_name,
  status,
  COUNT(*) AS count,
  CASE WHEN status IN ('pending','confirmed','in_progress','completed','completed_with_warnings','failed','cancelled')
    THEN 'VALID' ELSE 'INVALID' END AS validity
FROM public.dms_ai_erp_apply_runs
GROUP BY status;

SELECT
  'apply_items_status_values' AS check_name,
  status,
  COUNT(*) AS count,
  CASE WHEN status IN ('proposed','applied','skipped','conflict','failed','forbidden')
    THEN 'VALID' ELSE 'INVALID' END AS validity
FROM public.dms_ai_erp_apply_items
GROUP BY status;

-- ── 7. Confirm value_type values are only from allowed set ────────────────────

SELECT
  'apply_items_value_type_values' AS check_name,
  value_type,
  COUNT(*) AS count,
  CASE WHEN value_type IS NULL OR value_type IN ('text','date','number','boolean','bigint')
    THEN 'VALID' ELSE 'INVALID' END AS validity
FROM public.dms_ai_erp_apply_items
GROUP BY value_type;

-- ── 8. Confirm target_table values are only Tier 1 tables ────────────────────

SELECT
  'apply_items_target_table_values' AS check_name,
  target_table,
  COUNT(*) AS count,
  CASE WHEN target_table IN ('dms_documents', 'dms_document_metadata_values')
    THEN 'VALID (Tier 1)' ELSE 'WARN — unexpected target table' END AS validity
FROM public.dms_ai_erp_apply_items
GROUP BY target_table;

-- ── 9. Confirm target_module values are only Tier 1 modules ──────────────────

SELECT
  'apply_runs_target_module_values' AS check_name,
  target_module,
  COUNT(*) AS count,
  CASE WHEN target_module IN ('dms_document', 'dms_metadata')
    THEN 'VALID (Tier 1)' ELSE 'WARN — unexpected target module' END AS validity
FROM public.dms_ai_erp_apply_runs
GROUP BY target_module;

-- ── 10. Confirm confidence is always 0-1 range ───────────────────────────────

SELECT
  'apply_items_confidence_range_check' AS check_name,
  COUNT(*) AS out_of_range_rows,
  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL — confidence out of 0-1 range' END AS result
FROM public.dms_ai_erp_apply_items
WHERE confidence IS NOT NULL
  AND (confidence < 0 OR confidence > 1);

-- ── 11. Confirm no direct party/HR records written via apply ─────────────────
-- (These tables should NOT be in any apply item target)

SELECT
  'no_party_hr_targets_check' AS check_name,
  COUNT(*) AS forbidden_target_rows,
  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL — Party/HR target found' END AS result
FROM public.dms_ai_erp_apply_items
WHERE target_table ~* '(party_license|party_tax|employee_identity|employee_medical|payroll|salary)';
