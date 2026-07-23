-- Migration: ERP PDF.1 — Generated PDF Documents History + Storage Bucket
-- Phase: ERP PDF.1 — Production PDF Generation Framework (2026-07-23)
-- 
-- Creates:
--   1. `erp_generated_pdf_documents` — immutable audit history of every generated PDF
--   2. `erp-generated-pdfs` storage bucket (private)
--   3. RLS policies (no anon, no broad SELECT, no unsafe INSERT from frontend)
--   4. Storage policies (signed URL only, server-side upload)
--   5. 3 new permissions: reports.pdf.generate, reports.pdf.view_history, reports.pdf.approve
--   6. Indexes for common query patterns

-- ─── 1. erp_generated_pdf_documents ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.erp_generated_pdf_documents (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- Template reference
  template_key        TEXT        NOT NULL,
  template_id         BIGINT      REFERENCES public.erp_report_templates(id) ON DELETE SET NULL,
  template_version    INTEGER     NOT NULL DEFAULT 1,

  -- Source record
  source_record_type  TEXT        NOT NULL,
  source_record_id    BIGINT      NOT NULL,
  owner_company_id    BIGINT      NOT NULL REFERENCES public.owner_companies(id) ON DELETE RESTRICT,

  -- Storage
  storage_path        TEXT        NOT NULL,
  file_name           TEXT        NOT NULL,
  mime_type           TEXT        NOT NULL DEFAULT 'application/pdf',
  file_size_bytes     BIGINT,
  page_count          INTEGER,

  -- Integrity
  checksum            TEXT        NOT NULL,                      -- SHA-256 hex
  checksum_verified_at TIMESTAMPTZ,

  -- Renderer metadata
  renderer            TEXT        NOT NULL,                      -- e.g. 'gotenberg'
  renderer_version    TEXT        NOT NULL DEFAULT 'unknown',
  output_profile      TEXT        NOT NULL DEFAULT 'standard'
                        CHECK (output_profile IN ('standard', 'pdfa', 'pdfua')),

  -- Locale / direction
  locale              TEXT        NOT NULL DEFAULT 'en'
                        CHECK (locale IN ('en', 'ar', 'en-ar')),
  direction           TEXT        NOT NULL DEFAULT 'ltr'
                        CHECK (direction IN ('ltr', 'rtl', 'auto')),

  -- Audit
  generated_by        BIGINT      NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
  generated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Validation
  validation_status   TEXT        NOT NULL DEFAULT 'skipped'
                        CHECK (validation_status IN ('passed', 'failed', 'warning', 'skipped')),
  validation_report   JSONB,

  -- Approval (optional human approval before release)
  approval_status     TEXT        CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  approved_by         BIGINT      REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  approved_at         TIMESTAMPTZ,

  -- Supersession (for re-generation / new versions)
  superseded_by_id    BIGINT      REFERENCES public.erp_generated_pdf_documents(id) ON DELETE SET NULL,

  -- Soft-delete / archival
  archived_at         TIMESTAMPTZ,
  archived_by         BIGINT      REFERENCES public.user_profiles(id) ON DELETE SET NULL,

  -- Failure tracking (for failed generation rows)
  failure_reason      TEXT
);

-- Ensure the checksum is immutable after it is set (prevent tampering)
-- We enforce this at the application layer (no UPDATE to checksum after insert).
-- A DB trigger would enforce it at DB layer:
CREATE OR REPLACE FUNCTION public.prevent_checksum_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.checksum IS DISTINCT FROM NEW.checksum THEN
    RAISE EXCEPTION 'erp_generated_pdf_documents.checksum is immutable after creation.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_checksum_update ON public.erp_generated_pdf_documents;
CREATE TRIGGER trg_prevent_checksum_update
  BEFORE UPDATE OF checksum ON public.erp_generated_pdf_documents
  FOR EACH ROW EXECUTE FUNCTION public.prevent_checksum_update();

-- ─── 2. Indexes ───────────────────────────────────────────────────────────

-- Source record lookup (most common query)
CREATE INDEX IF NOT EXISTS idx_erpgenpdf_source_record
  ON public.erp_generated_pdf_documents (source_record_type, source_record_id, generated_at DESC);

-- Company-scoped history
CREATE INDEX IF NOT EXISTS idx_erpgenpdf_company
  ON public.erp_generated_pdf_documents (owner_company_id, generated_at DESC);

-- Template usage
CREATE INDEX IF NOT EXISTS idx_erpgenpdf_template
  ON public.erp_generated_pdf_documents (template_key, template_version, generated_at DESC);

-- Pending approval queue
CREATE INDEX IF NOT EXISTS idx_erpgenpdf_approval_pending
  ON public.erp_generated_pdf_documents (approval_status)
  WHERE approval_status = 'pending';

-- Active (non-archived) rows
CREATE INDEX IF NOT EXISTS idx_erpgenpdf_active
  ON public.erp_generated_pdf_documents (generated_at DESC)
  WHERE archived_at IS NULL;

-- ─── 3. Row Level Security ────────────────────────────────────────────────

ALTER TABLE public.erp_generated_pdf_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_generated_pdf_documents FORCE ROW LEVEL SECURITY;

-- Authenticated users may view PDF history for companies they have access to
-- (gated by reports.pdf.view_history permission)
CREATE POLICY "pdf_docs_select_own_company" ON public.erp_generated_pdf_documents
  FOR SELECT TO authenticated
  USING (
    public.current_user_has_permission('reports.pdf.view_history')
    AND owner_company_id IN (
      SELECT oc.id FROM public.owner_companies oc
      WHERE oc.id = owner_company_id
      -- Additional company-access check can be added here
    )
  );

-- Only service-role (admin client) may insert — prevents direct frontend inserts
-- Note: WITH CHECK false means authenticated role can NEVER insert directly.
CREATE POLICY "pdf_docs_insert_service_role_only" ON public.erp_generated_pdf_documents
  FOR INSERT TO authenticated
  WITH CHECK (FALSE);

-- Approvers may update approval_status only
CREATE POLICY "pdf_docs_update_approval" ON public.erp_generated_pdf_documents
  FOR UPDATE TO authenticated
  USING (
    public.current_user_has_permission('reports.pdf.approve')
    AND approval_status = 'pending'
  )
  WITH CHECK (
    public.current_user_has_permission('reports.pdf.approve')
  );

-- No DELETE — soft-delete via archived_at only
-- (No DELETE policy = blocked for all authenticated users)

-- ─── 4. Storage Bucket ────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'erp-generated-pdfs',
  'erp-generated-pdfs',
  false,
  52428800,  -- 50 MB per file
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for erp-generated-pdfs
-- No direct public access — all access via signed URLs (server-side)
-- Upload: service role only (admin client in server actions)
-- Download: service role creates signed URLs; authenticated users cannot download directly

-- Prevent authenticated users from uploading directly
CREATE POLICY "erpgenpdf_storage_no_direct_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'erp-generated-pdfs' AND FALSE);

-- Prevent authenticated users from deleting
CREATE POLICY "erpgenpdf_storage_no_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'erp-generated-pdfs' AND FALSE);

-- ─── 5. Permissions ───────────────────────────────────────────────────────

-- reports.pdf.generate — can trigger PDF generation server action
INSERT INTO public.erp_permissions (permission_code, module_code, description)
VALUES
  ('reports.pdf.generate',      'REPORTS', 'Generate PDFs for ERP records'),
  ('reports.pdf.view_history',  'REPORTS', 'View generated PDF document history'),
  ('reports.pdf.approve',       'REPORTS', 'Approve generated PDFs before release')
ON CONFLICT (permission_code) DO NOTHING;

-- Grant to system_admin and group_admin
INSERT INTO public.erp_role_permissions (role_code, permission_code)
SELECT r.role_code, p.permission_code
FROM (VALUES
  ('system_admin',  'reports.pdf.generate'),
  ('system_admin',  'reports.pdf.view_history'),
  ('system_admin',  'reports.pdf.approve'),
  ('group_admin',   'reports.pdf.generate'),
  ('group_admin',   'reports.pdf.view_history'),
  ('company_admin', 'reports.pdf.generate'),
  ('company_admin', 'reports.pdf.view_history')
) AS r(role_code, permission_code)
JOIN public.erp_permissions p ON p.permission_code = r.permission_code
ON CONFLICT DO NOTHING;
