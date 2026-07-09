-- ERP DMS.DELETE.1 — Hard Delete FK Rule Fixes
-- Changes SET NULL → CASCADE for DMS process tables so deleting a document
-- automatically cleans up review queue items, AI jobs, and extraction records.
-- Also fixes the self-referential NO ACTION → SET NULL so a superseding document
-- can itself be deleted without a constraint error.

-- ── 1. dms_review_queue.document_id: SET NULL → CASCADE ──────────────────────
-- Queue items have no purpose once their source document is gone.
ALTER TABLE dms_review_queue
  DROP CONSTRAINT dms_review_queue_document_id_fkey,
  ADD CONSTRAINT dms_review_queue_document_id_fkey
    FOREIGN KEY (document_id) REFERENCES dms_documents(id) ON DELETE CASCADE;

-- ── 2. dms_ai_job_queue.related_document_id: SET NULL → CASCADE ──────────────
-- AI job records for a deleted document should be removed with it.
ALTER TABLE dms_ai_job_queue
  DROP CONSTRAINT dms_ai_job_queue_related_document_id_fkey,
  ADD CONSTRAINT dms_ai_job_queue_related_document_id_fkey
    FOREIGN KEY (related_document_id) REFERENCES dms_documents(id) ON DELETE CASCADE;

-- ── 3. dms_ai_extraction_jobs.document_id: SET NULL → CASCADE ────────────────
ALTER TABLE dms_ai_extraction_jobs
  DROP CONSTRAINT dms_ai_extraction_jobs_document_id_fkey,
  ADD CONSTRAINT dms_ai_extraction_jobs_document_id_fkey
    FOREIGN KEY (document_id) REFERENCES dms_documents(id) ON DELETE CASCADE;

-- ── 4. dms_ai_extraction_results.document_id: SET NULL → CASCADE ─────────────
ALTER TABLE dms_ai_extraction_results
  DROP CONSTRAINT dms_ai_extraction_results_document_id_fkey,
  ADD CONSTRAINT dms_ai_extraction_results_document_id_fkey
    FOREIGN KEY (document_id) REFERENCES dms_documents(id) ON DELETE CASCADE;

-- ── 5. dms_documents.superseded_by_document_id: NO ACTION → SET NULL ─────────
-- Prevents a document that supersedes another from blocking its own deletion.
ALTER TABLE dms_documents
  DROP CONSTRAINT dms_documents_superseded_by_document_id_fkey,
  ADD CONSTRAINT dms_documents_superseded_by_document_id_fkey
    FOREIGN KEY (superseded_by_document_id) REFERENCES dms_documents(id) ON DELETE SET NULL;
