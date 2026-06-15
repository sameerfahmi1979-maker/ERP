-- ============================================================
-- ERP DMS — Owning Fields Party ID
-- Adds party_id FK to dms_documents so a document can be
-- directly associated with an external party (customer, vendor,
-- employee, government authority, etc.).
-- ============================================================

ALTER TABLE public.dms_documents
  ADD COLUMN IF NOT EXISTS party_id BIGINT
    REFERENCES public.parties(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dms_documents_party_id
  ON public.dms_documents (party_id)
  WHERE party_id IS NOT NULL;

COMMENT ON COLUMN public.dms_documents.party_id IS
  'Optional: the external party (customer, vendor, employee, authority, etc.) this document belongs to or describes.';
