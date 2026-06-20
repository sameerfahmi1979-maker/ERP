-- ============================================================
-- ERP DMS 12.0 — PROPOSED DOCUMENT NUMBER CLEANUP
-- REVIEW ONLY — DO NOT RUN WITHOUT SAMEER APPROVAL
-- ============================================================
--
-- Context
-- -------
-- Bug: src/server/actions/dms/ai-intake.ts and
--      src/server/actions/dms/document-upload-attach.ts
--      both called  String(docNoData)  on the raw Supabase
--      RPC response array instead of extracting
--      docNoData[0].generated_reference_number.
--
-- This caused document_no to be saved as the literal string
-- '[object Object]' for any document created through:
--   (a) the AI intake approval workflow
--   (b) the "create from upload session" attach workflow
--
-- Both files have been patched in DMS 12.0.
--
-- The queries below:
--  1. Identify affected rows (SAFE — read only)
--  2. Propose a manual update strategy (requires human decision)
--
-- NOTE: The generate_next_reference_number() RPC cannot safely be
--       called in a plain SQL UPDATE statement outside the app
--       layer.  A DBA or developer must run the numbered steps
--       below after reviewing the affected rows.
-- ============================================================

-- ── STEP 1: Inspect affected rows ────────────────────────────
-- Run this first.  Review the IDs and titles.

SELECT
    id,
    document_no,
    title,
    document_type_id,
    created_at,
    deleted_at
FROM
    dms_documents
WHERE
    document_no = '[object Object]'
ORDER BY
    created_at DESC;


-- ── STEP 2: Count affected rows ───────────────────────────────
-- Expected: 0 rows if all bad documents were already hard-deleted.
-- If > 0 rows: see STEP 3.

SELECT COUNT(*) AS bad_document_no_count
FROM dms_documents
WHERE document_no = '[object Object]';


-- ── STEP 3: Patch bad document numbers ────────────────────────
-- For each affected document, generate a new document number by
-- calling the server action  createDmsDocument  (which uses the
-- RPC correctly) and then updating the record.
--
-- ALTERNATIVELY, if you want a quick patch and the numbering
-- sequence is not critical, run:
--
-- DO $$
-- DECLARE
--     rec RECORD;
--     new_no TEXT;
--     seq_val BIGINT;
-- BEGIN
--     FOR rec IN
--         SELECT id FROM dms_documents WHERE document_no = '[object Object]'
--     LOOP
--         -- Generate a fallback number using the DB sequence directly
--         SELECT nextval('dms_documents_id_seq') INTO seq_val;
--         new_no := 'DMS-FIX-' || LPAD(seq_val::TEXT, 6, '0');
--
--         UPDATE dms_documents
--         SET document_no = new_no,
--             updated_at  = NOW()
--         WHERE id = rec.id;
--
--         RAISE NOTICE 'Updated document id=% to document_no=%', rec.id, new_no;
--     END LOOP;
-- END;
-- $$;
--
-- ⚠ This uses a fallback pattern DMS-FIX-XXXXXX, not the real
--   MASTER_DMS_DOCUMENT numbering rule.  Run the server action
--   from the app to renumber properly if audit integrity is needed.


-- ── STEP 4: Verify related tables ────────────────────────────
-- Confirm no orphaned metadata/versions reference bad documents.

SELECT
    df.id   AS file_id,
    df.original_filename,
    d.id    AS document_id,
    d.document_no
FROM dms_document_files df
JOIN dms_documents d ON d.id = df.document_id
WHERE d.document_no = '[object Object]'
  AND df.deleted_at IS NULL;


-- ── STEP 5: Audit log cross-check ────────────────────────────
-- Check if any audit log rows captured '[object Object]' as the
-- entity_reference for context.

SELECT
    id,
    entity_reference,
    action,
    performed_at,
    new_values
FROM erp_audit_log
WHERE entity_name = 'dms_documents'
  AND entity_reference = '[object Object]'
ORDER BY performed_at DESC
LIMIT 20;

-- ============================================================
-- END OF REVIEW SQL
-- ============================================================
