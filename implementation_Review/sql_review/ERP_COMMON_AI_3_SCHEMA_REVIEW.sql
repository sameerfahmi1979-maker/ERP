-- ============================================================================
-- ERP COMMON AI.3 — Duplicate / Conflict Detection — Schema Review
-- Purpose: Read-only audit queries for planning
-- Date: 2026-06-17
-- Status: READ-ONLY — DO NOT MODIFY DATA
-- ============================================================================

-- ── 1. Feature flag status ────────────────────────────────────────────────────
SELECT feature_code, is_enabled, requires_human_review, description
FROM erp_ai_feature_flags
WHERE feature_code = 'ERP_AI_DUPLICATE_DETECT';

-- ── 2. Permission status (ai.duplicates.*) ────────────────────────────────────
SELECT permission_code, module_code, action_code, is_active
FROM permissions
WHERE permission_code LIKE 'ai.duplicates%'
ORDER BY permission_code;

-- ── 3. Check if candidate tables already exist ────────────────────────────────
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('erp_ai_duplicate_candidates', 'erp_ai_duplicate_candidate_events');

-- ── 4. Party master data columns for duplicate detection ──────────────────────
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'parties'
  AND column_name IN (
    'id', 'party_code', 'display_name', 'legal_name_en', 'legal_name_ar',
    'primary_email', 'primary_phone', 'website', 'deleted_at', 'is_active'
  )
ORDER BY ordinal_position;

-- ── 5. Party child tables for duplicate detection ─────────────────────────────
SELECT c.table_name, c.column_name, c.data_type
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name IN ('party_tax_registrations', 'party_licenses', 'party_bank_details', 'party_contacts')
  AND c.column_name IN ('id', 'party_id', 'trn', 'license_number', 'expiry_date',
                         'dms_license_document_id', 'iban', 'bank_id',
                         'email', 'phone', 'mobile', 'deleted_at')
ORDER BY c.table_name, c.ordinal_position;

-- ── 6. Organization master data columns ───────────────────────────────────────
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'owner_companies'
  AND column_name IN ('id', 'trade_name', 'legal_name_en', 'default_bank_id', 'deleted_at')
ORDER BY ordinal_position;

-- ── 7. Branch and Work Site columns ──────────────────────────────────────────
SELECT c.table_name, c.column_name, c.data_type
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name IN ('branches', 'work_sites')
  AND c.column_name IN ('id', 'legal_branch_name', 'trade_license_branch_ref',
                         'site_name', 'site_code', 'address_line_1', 'deleted_at')
ORDER BY c.table_name, c.ordinal_position;

-- ── 8. DMS document columns for duplicate detection ───────────────────────────
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'dms_documents'
  AND column_name IN ('id', 'document_no', 'title', 'status', 'document_type_id',
                       'expiry_date', 'issue_date', 'ai_summary_status',
                       'confidentiality_level', 'deleted_at')
ORDER BY ordinal_position;

-- ── 9. DMS upload sessions (for sha256 duplicate detection) ───────────────────
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'dms_upload_sessions'
  AND column_name IN ('id', 'sha256_hash', 'document_id', 'is_duplicate',
                       'duplicate_document_id', 'deleted_at')
ORDER BY ordinal_position;

-- ── 10. DMS document links for cross-entity detection ────────────────────────
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'dms_document_links'
  AND column_name IN ('id', 'document_id', 'entity_type', 'entity_id', 'is_primary', 'deleted_at')
ORDER BY ordinal_position;

-- ── 11. DMS AI extraction results for conflict detection ─────────────────────
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'dms_ai_extraction_results'
  AND column_name IN ('id', 'document_id', 'ai_status', 'classification_score',
                       'classification_reason', 'suggested_title', 'created_at')
ORDER BY ordinal_position;

-- ── 12. RLS status on entity tables ──────────────────────────────────────────
SELECT c.relname AS table_name, c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
    'parties', 'owner_companies', 'branches', 'work_sites',
    'party_tax_registrations', 'party_licenses', 'party_bank_details', 'party_contacts',
    'dms_documents', 'dms_document_links', 'dms_upload_sessions',
    'erp_ai_field_suggestions'
  )
ORDER BY c.relname;

-- ── 13. Existing indexes on key fields used for duplicate detection ───────────
SELECT t.relname AS table_name, i.relname AS index_name, pg_get_indexdef(i.oid) AS definition
FROM pg_index ix
JOIN pg_class t ON t.oid = ix.indrelid
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
  AND t.relname IN ('parties', 'party_licenses', 'party_tax_registrations',
                     'party_bank_details', 'party_contacts',
                     'owner_companies', 'branches', 'work_sites',
                     'dms_upload_sessions', 'dms_document_links')
  AND (pg_get_indexdef(i.oid) ILIKE '%trn%' OR pg_get_indexdef(i.oid) ILIKE '%iban%'
    OR pg_get_indexdef(i.oid) ILIKE '%license_number%' OR pg_get_indexdef(i.oid) ILIKE '%sha256%'
    OR pg_get_indexdef(i.oid) ILIKE '%display_name%' OR pg_get_indexdef(i.oid) ILIKE '%trade_name%'
    OR pg_get_indexdef(i.oid) ILIKE '%email%')
ORDER BY t.relname, i.relname;

-- ── 14. Check detect_possible_party_duplicates RPC exists ─────────────────────
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'detect_possible_party_duplicates';

-- ── 15. Existing erp_ai_field_suggestions conflict_detected candidates ────────
SELECT suggestion_type, COUNT(*) AS count
FROM erp_ai_field_suggestions
WHERE suggestion_type = 'conflict_detected' AND deleted_at IS NULL
GROUP BY suggestion_type;

-- ── 16. DMS documents with multiple entity links (potential duplicate link) ───
SELECT document_id, COUNT(DISTINCT entity_type || ':' || entity_id) AS link_count
FROM dms_document_links
WHERE deleted_at IS NULL
GROUP BY document_id
HAVING COUNT(DISTINCT entity_type || ':' || entity_id) >= 2
LIMIT 10;
