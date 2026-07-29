-- OFFICIAL DOCS.1 — Package 8: Designer UI retirement (non-destructive archive).
--
-- The visual Report Designer / Template Studio is retired: official documents
-- are fixed code-based templates (src/lib/official-documents). This migration
-- archives ONLY designer-era experiment/sample template rows that are:
--   - not referenced by any generated document (erp_generated_pdf_documents),
--   - not referenced by any public verification link (erp_output_public_links),
--   - not a default template (is_default = false),
--   - not a company branding template (branding resolution still uses those).
--
-- Archive is reversible (status flip; no rows deleted, no content columns
-- touched). Rollback: restore governance_status/is_active on the listed codes.
--
-- Rows archived:
--   DEFAULT_CERTIFICATE_TEMPLATE_V2_V3_V4  ("To Whom It May Concern (v4)" designer experiment)
--   sample-quotation-en                    (validation-spike sample)
--   bilingual-sample-en-ar                 (validation-spike sample)

UPDATE erp_report_templates t
SET governance_status = 'archived',
    is_active = false,
    archived_at = now(),
    archive_reason = 'OFFICIAL DOCS.1 Package 8 — visual designer retired; designer-era sample/experiment template archived non-destructively.',
    updated_at = now()
WHERE t.template_code IN (
    'DEFAULT_CERTIFICATE_TEMPLATE_V2_V3_V4',
    'sample-quotation-en',
    'bilingual-sample-en-ar'
  )
  AND t.deleted_at IS NULL
  AND t.governance_status <> 'archived'
  AND t.is_default = false
  AND NOT EXISTS (
    SELECT 1 FROM erp_generated_pdf_documents d WHERE d.template_id = t.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM erp_output_public_links l WHERE l.template_id = t.id
  );
