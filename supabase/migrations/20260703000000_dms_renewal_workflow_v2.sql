-- =============================================================================
-- DMS Renewal Workflow Redesign (v2)
-- Phase:  ERP DMS RENEWAL.2
-- Date:   2026-07-03
-- Notes:  1) Adds a type-level "is_renewable" flag so one-time document types
--            (e.g. Visit Visa) can hide renewal actions entirely.
--         2) Adds dms_documents.superseded_by_document_id so a completed
--            renewal can link the old document to the actual replacement
--            document that was uploaded for it.
--         All additions are backward-compatible (default true / nullable).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP 1: dms_document_types.is_renewable
-- -----------------------------------------------------------------------------
ALTER TABLE public.dms_document_types
  ADD COLUMN IF NOT EXISTS is_renewable BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.dms_document_types.is_renewable IS
  'DMS RENEWAL.2 — When false, this document type represents a one-time document (e.g. Visit Visa). Renewal request creation is blocked and renewal actions are hidden in the UI.';

-- -----------------------------------------------------------------------------
-- STEP 2: dms_documents.superseded_by_document_id
-- -----------------------------------------------------------------------------
ALTER TABLE public.dms_documents
  ADD COLUMN IF NOT EXISTS superseded_by_document_id BIGINT NULL REFERENCES public.dms_documents(id);

COMMENT ON COLUMN public.dms_documents.superseded_by_document_id IS
  'DMS RENEWAL.2 — Set when this document status = superseded. Points to the replacement document created/uploaded to renew it.';

CREATE INDEX IF NOT EXISTS dms_documents_superseded_by_idx
  ON public.dms_documents (superseded_by_document_id)
  WHERE superseded_by_document_id IS NOT NULL;

-- =============================================================================
-- END DMS RENEWAL.2 Migration
-- =============================================================================
