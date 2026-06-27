-- ============================================================================
-- ERP DMS Hard Delete — FK Constraint Fix + purge_dms_document RPC
-- ============================================================================
-- Root problem: all cross-module FK references to dms_documents used
-- NO ACTION delete rules, making a hard DELETE FROM dms_documents impossible
-- at the DB level.
--
-- Fix strategy:
--   • DMS-internal link tables (notifications, migration map, renewal requests):
--     CASCADE or SET NULL as appropriate.
--   • Cross-module tables (employee_, hr_, party_): SET NULL
--     — deleting a document must never cascade-delete an employee/party record.
--
-- After this migration a simple DELETE FROM dms_documents WHERE id = ?
-- will succeed; Postgres handles all cascades and nullifications atomically.
-- ============================================================================

-- ── DMS-internal tables ───────────────────────────────────────────────────────

ALTER TABLE public.dms_notification_queue
  DROP CONSTRAINT IF EXISTS dms_notification_queue_document_id_fkey,
  ADD CONSTRAINT dms_notification_queue_document_id_fkey
    FOREIGN KEY (document_id) REFERENCES public.dms_documents(id)
    ON DELETE CASCADE;

ALTER TABLE public.dms_party_document_migration_map
  DROP CONSTRAINT IF EXISTS dms_party_document_migration_map_dms_document_id_fkey,
  ADD CONSTRAINT dms_party_document_migration_map_dms_document_id_fkey
    FOREIGN KEY (dms_document_id) REFERENCES public.dms_documents(id)
    ON DELETE CASCADE;

ALTER TABLE public.dms_renewal_requests
  DROP CONSTRAINT IF EXISTS dms_renewal_requests_document_id_fkey,
  ADD CONSTRAINT dms_renewal_requests_document_id_fkey
    FOREIGN KEY (document_id) REFERENCES public.dms_documents(id)
    ON DELETE CASCADE;

ALTER TABLE public.dms_renewal_requests
  DROP CONSTRAINT IF EXISTS dms_renewal_requests_replacement_document_id_fkey,
  ADD CONSTRAINT dms_renewal_requests_replacement_document_id_fkey
    FOREIGN KEY (replacement_document_id) REFERENCES public.dms_documents(id)
    ON DELETE SET NULL;

-- ── Cross-module: Employee tables → SET NULL ──────────────────────────────────

ALTER TABLE public.employee_access_cards
  DROP CONSTRAINT IF EXISTS employee_access_cards_dms_document_id_fkey,
  ADD CONSTRAINT employee_access_cards_dms_document_id_fkey
    FOREIGN KEY (dms_document_id) REFERENCES public.dms_documents(id)
    ON DELETE SET NULL;

ALTER TABLE public.employee_assets
  DROP CONSTRAINT IF EXISTS employee_assets_dms_document_id_fkey,
  ADD CONSTRAINT employee_assets_dms_document_id_fkey
    FOREIGN KEY (dms_document_id) REFERENCES public.dms_documents(id)
    ON DELETE SET NULL;

ALTER TABLE public.employee_dependents
  DROP CONSTRAINT IF EXISTS employee_dependents_dms_document_id_fkey,
  ADD CONSTRAINT employee_dependents_dms_document_id_fkey
    FOREIGN KEY (dms_document_id) REFERENCES public.dms_documents(id)
    ON DELETE SET NULL;

ALTER TABLE public.employee_disciplinary_records
  DROP CONSTRAINT IF EXISTS employee_disciplinary_records_dms_document_id_fkey,
  ADD CONSTRAINT employee_disciplinary_records_dms_document_id_fkey
    FOREIGN KEY (dms_document_id) REFERENCES public.dms_documents(id)
    ON DELETE SET NULL;

ALTER TABLE public.employee_document_links
  DROP CONSTRAINT IF EXISTS employee_document_links_dms_document_id_fkey,
  ADD CONSTRAINT employee_document_links_dms_document_id_fkey
    FOREIGN KEY (dms_document_id) REFERENCES public.dms_documents(id)
    ON DELETE SET NULL;

ALTER TABLE public.employee_eos_cases
  DROP CONSTRAINT IF EXISTS employee_eos_cases_dms_document_id_fkey,
  ADD CONSTRAINT employee_eos_cases_dms_document_id_fkey
    FOREIGN KEY (dms_document_id) REFERENCES public.dms_documents(id)
    ON DELETE SET NULL;

ALTER TABLE public.employee_hr_actions
  DROP CONSTRAINT IF EXISTS employee_hr_actions_dms_document_id_fkey,
  ADD CONSTRAINT employee_hr_actions_dms_document_id_fkey
    FOREIGN KEY (dms_document_id) REFERENCES public.dms_documents(id)
    ON DELETE SET NULL;

ALTER TABLE public.employee_identity_documents
  DROP CONSTRAINT IF EXISTS employee_identity_documents_dms_document_id_fkey,
  ADD CONSTRAINT employee_identity_documents_dms_document_id_fkey
    FOREIGN KEY (dms_document_id) REFERENCES public.dms_documents(id)
    ON DELETE SET NULL;

ALTER TABLE public.employee_leave_requests
  DROP CONSTRAINT IF EXISTS employee_leave_requests_sick_cert_dms_id_fkey,
  ADD CONSTRAINT employee_leave_requests_sick_cert_dms_id_fkey
    FOREIGN KEY (sick_cert_dms_id) REFERENCES public.dms_documents(id)
    ON DELETE SET NULL;

ALTER TABLE public.employee_medical_insurances
  DROP CONSTRAINT IF EXISTS employee_medical_insurances_dms_document_id_fkey,
  ADD CONSTRAINT employee_medical_insurances_dms_document_id_fkey
    FOREIGN KEY (dms_document_id) REFERENCES public.dms_documents(id)
    ON DELETE SET NULL;

ALTER TABLE public.employee_medical_records
  DROP CONSTRAINT IF EXISTS employee_medical_records_dms_document_id_fkey,
  ADD CONSTRAINT employee_medical_records_dms_document_id_fkey
    FOREIGN KEY (dms_document_id) REFERENCES public.dms_documents(id)
    ON DELETE SET NULL;

ALTER TABLE public.employee_performance_records
  DROP CONSTRAINT IF EXISTS employee_performance_records_dms_document_id_fkey,
  ADD CONSTRAINT employee_performance_records_dms_document_id_fkey
    FOREIGN KEY (dms_document_id) REFERENCES public.dms_documents(id)
    ON DELETE SET NULL;

ALTER TABLE public.employee_ppe_issues
  DROP CONSTRAINT IF EXISTS employee_ppe_issues_dms_document_id_fkey,
  ADD CONSTRAINT employee_ppe_issues_dms_document_id_fkey
    FOREIGN KEY (dms_document_id) REFERENCES public.dms_documents(id)
    ON DELETE SET NULL;

ALTER TABLE public.employee_pro_processes
  DROP CONSTRAINT IF EXISTS employee_pro_processes_related_document_id_fkey,
  ADD CONSTRAINT employee_pro_processes_related_document_id_fkey
    FOREIGN KEY (related_document_id) REFERENCES public.dms_documents(id)
    ON DELETE SET NULL;

ALTER TABLE public.employee_training_certificates
  DROP CONSTRAINT IF EXISTS employee_training_certificates_dms_document_id_fkey,
  ADD CONSTRAINT employee_training_certificates_dms_document_id_fkey
    FOREIGN KEY (dms_document_id) REFERENCES public.dms_documents(id)
    ON DELETE SET NULL;

ALTER TABLE public.employees
  DROP CONSTRAINT IF EXISTS employees_photo_dms_document_id_fkey,
  ADD CONSTRAINT employees_photo_dms_document_id_fkey
    FOREIGN KEY (photo_dms_document_id) REFERENCES public.dms_documents(id)
    ON DELETE SET NULL;

-- ── Cross-module: HR tables → SET NULL ───────────────────────────────────────

ALTER TABLE public.hr_candidate_documents
  DROP CONSTRAINT IF EXISTS hr_candidate_documents_dms_document_id_fkey,
  ADD CONSTRAINT hr_candidate_documents_dms_document_id_fkey
    FOREIGN KEY (dms_document_id) REFERENCES public.dms_documents(id)
    ON DELETE SET NULL;

ALTER TABLE public.hr_offers
  DROP CONSTRAINT IF EXISTS hr_offers_offer_document_id_fkey,
  ADD CONSTRAINT hr_offers_offer_document_id_fkey
    FOREIGN KEY (offer_document_id) REFERENCES public.dms_documents(id)
    ON DELETE SET NULL;

ALTER TABLE public.hr_onboarding_tasks
  DROP CONSTRAINT IF EXISTS hr_onboarding_tasks_dms_document_id_fkey,
  ADD CONSTRAINT hr_onboarding_tasks_dms_document_id_fkey
    FOREIGN KEY (dms_document_id) REFERENCES public.dms_documents(id)
    ON DELETE SET NULL;

-- ── Cross-module: Party tables → SET NULL ────────────────────────────────────

ALTER TABLE public.party_documents
  DROP CONSTRAINT IF EXISTS party_documents_dms_document_id_fkey,
  ADD CONSTRAINT party_documents_dms_document_id_fkey
    FOREIGN KEY (dms_document_id) REFERENCES public.dms_documents(id)
    ON DELETE SET NULL;

ALTER TABLE public.party_licenses
  DROP CONSTRAINT IF EXISTS party_licenses_dms_license_document_id_fkey,
  ADD CONSTRAINT party_licenses_dms_license_document_id_fkey
    FOREIGN KEY (dms_license_document_id) REFERENCES public.dms_documents(id)
    ON DELETE SET NULL;

ALTER TABLE public.party_tax_registrations
  DROP CONSTRAINT IF EXISTS party_tax_registrations_dms_certificate_document_id_fkey,
  ADD CONSTRAINT party_tax_registrations_dms_certificate_document_id_fkey
    FOREIGN KEY (dms_certificate_document_id) REFERENCES public.dms_documents(id)
    ON DELETE SET NULL;

-- ============================================================================
-- purge_dms_document(p_id BIGINT)
--
-- SECURITY DEFINER: runs as the function owner (bypasses RLS) so it can
-- reach the immutable audit log table and hard-delete child rows.
--
-- Caller receives:
--   out_storage_files JSONB  — array of {bucket, path} objects to purge
--                              from Supabase Storage (TypeScript caller handles)
--   out_files_found   INT    — count of file records purged
-- ============================================================================

CREATE OR REPLACE FUNCTION public.purge_dms_document(
  p_id BIGINT
)
RETURNS TABLE(out_storage_files JSONB, out_files_found INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc_exists  BOOLEAN;
  v_storage     JSONB;
  v_file_count  INT;
BEGIN
  -- 1. Confirm document exists
  SELECT EXISTS(SELECT 1 FROM dms_documents WHERE id = p_id)
    INTO v_doc_exists;

  IF NOT v_doc_exists THEN
    RAISE EXCEPTION 'dms_document % not found', p_id;
  END IF;

  -- 2. Collect storage file paths before deletion
  SELECT
    COALESCE(
      jsonb_agg(jsonb_build_object('bucket', storage_bucket, 'path', storage_path))
        FILTER (WHERE storage_bucket IS NOT NULL AND storage_path IS NOT NULL),
      '[]'::jsonb
    ),
    COUNT(*)
  INTO v_storage, v_file_count
  FROM dms_document_files
  WHERE document_id = p_id;

  -- 3. Hard-delete the document — Postgres CASCADE / SET NULL handles all children
  DELETE FROM dms_documents WHERE id = p_id;

  out_storage_files := v_storage;
  out_files_found   := v_file_count;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.purge_dms_document(BIGINT) IS
  'Hard-deletes a DMS document and all DMS-owned child rows atomically.
   Cross-module FK references (employee, party, HR) are SET NULL automatically.
   Returns storage file metadata so the caller can purge from Supabase Storage.
   SECURITY DEFINER: bypasses RLS on immutable audit log.';

-- ── Purge the two known orphaned soft-deleted test documents ─────────────────
-- Documents 41 (DMS-2026-000043) and 42 (DMS-2026-000044) were soft-deleted
-- but remained in the DB. This migration permanently removes them.

DO $$
DECLARE
  v_row RECORD;
BEGIN
  FOR v_row IN SELECT id FROM dms_documents WHERE id IN (41, 42) LOOP
    PERFORM purge_dms_document(v_row.id);
  END LOOP;
END;
$$;
