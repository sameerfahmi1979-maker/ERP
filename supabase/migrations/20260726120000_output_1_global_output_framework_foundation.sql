-- ═══════════════════════════════════════════════════════════════════════════
-- OUTPUT.1 — Global Output Framework: Security & Data-Model Foundation
-- Master program: ERP_GLOBAL_OUTPUT_FRAMEWORK_ALL_12_WORK_PACKAGES (WP4)
-- Plan authority: HR_LETTERS_AND_CERTIFICATES_ENHANCEMENT_PLAN.md v6.1
--
-- Design rules honored:
--  * Additive, forward-only, idempotent (rerunnable) — no drops, no renames.
--  * BIGINT identity conventions preserved; no UUID PKs introduced.
--  * No circular FKs: erp_output_public_links → erp_generated_pdf_documents only.
--  * content_fingerprint and checksum are NOT globally unique (reissue allowed).
--  * request_key IS unique (partial) — request-level idempotency.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Document-class defaults (global class policy table) ──────────────────
CREATE TABLE IF NOT EXISTS erp_output_class_policies (
  document_class          text PRIMARY KEY
                          CHECK (document_class = ANY (ARRAY['A','B','C','D','E','F','G'])),
  class_name              text NOT NULL,
  description             text,
  qr_policy               text NOT NULL DEFAULT 'none'
                          CHECK (qr_policy = ANY (ARRAY['none','days','long_term','valid_until_revoked'])),
  qr_validity_days        integer,
  approval_required       boolean NOT NULL DEFAULT false,
  allow_quick_print       boolean NOT NULL DEFAULT true,
  public_disclosure_level text NOT NULL DEFAULT 'none'
                          CHECK (public_disclosure_level = ANY (ARRAY['none','metadata','download'])),
  requires_serial         boolean NOT NULL DEFAULT false,
  official                boolean NOT NULL DEFAULT false,
  notes                   text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

INSERT INTO erp_output_class_policies
  (document_class, class_name, description, qr_policy, qr_validity_days, approval_required, allow_quick_print, public_disclosure_level, requires_serial, official, notes)
VALUES
  ('A', 'Official certificate — sensitive', 'Salary certificates with amounts, sensitive NOCs', 'days', 90, true,  true,  'metadata', true,  true,  'v6.1: ~90-day QR default unless stricter template policy'),
  ('B', 'Official certificate — standard', 'Employment/experience certificates and standard official letters', 'valid_until_revoked', NULL, false, true,  'metadata', true,  true,  'v6.1: long-term / valid-until-revoked'),
  ('C', 'Official form / checklist', 'Internal official forms, checklists, onboarding documents', 'none', NULL, false, true,  'none', false, true,  'No public QR unless explicitly approved policy'),
  ('D', 'Fixed-size card / badge', 'Employee ID cards, badges, labels', 'none', NULL, false, true,  'none', false, false, 'Fixed-geometry outputs; Gotenberg CR80 proof in OUTPUT.SPIKE.1'),
  ('E', 'Analytical report', 'Tabular/analytical reports (jsPDF/print adapters retained)', 'none', NULL, false, true,  'none', false, false, 'Registered + audited under global contract'),
  ('F', 'Data export', 'Excel/CSV exports (ExcelJS/CSV adapters retained)', 'none', NULL, false, true,  'none', false, false, 'Registered + audited under global contract'),
  ('G', 'AI draft', 'AI-drafted wording — human-review-first, never issued directly', 'none', NULL, false, false, 'none', false, false, 'Draft-only; cannot issue/sign/send')
ON CONFLICT (document_class) DO NOTHING;

ALTER TABLE erp_output_class_policies ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='erp_output_class_policies' AND policyname='output_class_policies_select') THEN
    CREATE POLICY output_class_policies_select ON erp_output_class_policies
      FOR SELECT TO authenticated USING (current_user_has_permission('reports.view'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='erp_output_class_policies' AND policyname='output_class_policies_write') THEN
    CREATE POLICY output_class_policies_write ON erp_output_class_policies
      FOR ALL TO authenticated
      USING (current_user_has_permission('reports.manage'))
      WITH CHECK (current_user_has_permission('reports.manage'));
  END IF;
END $$;

-- ── 2. Registry: document class + per-output policy overrides ────────────────
ALTER TABLE erp_report_registry
  ADD COLUMN IF NOT EXISTS document_class text
    CHECK (document_class = ANY (ARRAY['A','B','C','D','E','F','G'])),
  ADD COLUMN IF NOT EXISTS qr_policy_override text
    CHECK (qr_policy_override = ANY (ARRAY['none','days','long_term','valid_until_revoked'])),
  ADD COLUMN IF NOT EXISTS qr_validity_days_override integer,
  ADD COLUMN IF NOT EXISTS approval_required_override boolean,
  ADD COLUMN IF NOT EXISTS allow_quick_print_override boolean,
  ADD COLUMN IF NOT EXISTS public_disclosure_override text
    CHECK (public_disclosure_override = ANY (ARRAY['none','metadata','download'])),
  ADD COLUMN IF NOT EXISTS variable_allowlist jsonb;

-- Evidence-based backfill of document_class from report_category + sensitivity.
UPDATE erp_report_registry SET document_class =
  CASE
    WHEN report_category IN ('letter','certificate') AND sensitive_profile IN ('payroll','mixed_sensitive') THEN 'A'
    WHEN report_category IN ('letter','certificate') THEN 'B'
    WHEN report_category IN ('form','checklist','external_submission') THEN 'C'
    WHEN report_category = 'badge' THEN 'D'
    WHEN report_category = 'export' THEN 'F'
    ELSE 'E'
  END
WHERE document_class IS NULL;

-- ── 3. Generated PDF documents: lifecycle / idempotency / integrity ─────────
ALTER TABLE erp_generated_pdf_documents
  ADD COLUMN IF NOT EXISTS document_class text
    CHECK (document_class = ANY (ARRAY['A','B','C','D','E','F','G'])),
  ADD COLUMN IF NOT EXISTS output_code text,
  ADD COLUMN IF NOT EXISTS lifecycle_state text NOT NULL DEFAULT 'pending'
    CHECK (lifecycle_state = ANY (ARRAY['pending','rendering','uploaded','issued','failed_retryable','failed_terminal','cancelled','reconciliation_required'])),
  ADD COLUMN IF NOT EXISTS request_key text,
  ADD COLUMN IF NOT EXISTS content_fingerprint text,
  ADD COLUMN IF NOT EXISTS serial_no text,
  ADD COLUMN IF NOT EXISTS serial_status text
    CHECK (serial_status IS NULL OR serial_status = ANY (ARRAY['reserved','issued','voided'])),
  ADD COLUMN IF NOT EXISTS serial_void_reason text,
  ADD COLUMN IF NOT EXISTS checksum_algorithm text NOT NULL DEFAULT 'sha256',
  ADD COLUMN IF NOT EXISTS chromium_version text,
  ADD COLUMN IF NOT EXISTS data_snapshot_json jsonb,
  ADD COLUMN IF NOT EXISTS policy_snapshot_json jsonb,
  ADD COLUMN IF NOT EXISTS branding_snapshot_json jsonb,
  ADD COLUMN IF NOT EXISTS rendering_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS issued_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconciled_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_by bigint,
  ADD COLUMN IF NOT EXISTS revoke_reason text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS supersedes_issuance_id bigint REFERENCES erp_generated_pdf_documents(id);

-- Backfill: rows that already exist were produced by the legacy Gotenberg path
-- and have stored bytes → classify as issued; rows with no storage → failed_terminal.
UPDATE erp_generated_pdf_documents
SET lifecycle_state = CASE WHEN storage_path IS NOT NULL AND storage_path <> '' THEN 'issued' ELSE 'failed_terminal' END,
    issued_at = COALESCE(issued_at, generated_at)
WHERE lifecycle_state = 'pending' AND generated_at IS NOT NULL;

-- Request-level idempotency: unique where present. NOT on fingerprint/checksum.
CREATE UNIQUE INDEX IF NOT EXISTS uq_gen_pdf_request_key
  ON erp_generated_pdf_documents (request_key) WHERE request_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gen_pdf_content_fingerprint
  ON erp_generated_pdf_documents (content_fingerprint) WHERE content_fingerprint IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gen_pdf_lifecycle_state
  ON erp_generated_pdf_documents (lifecycle_state);
CREATE INDEX IF NOT EXISTS idx_gen_pdf_output_code
  ON erp_generated_pdf_documents (output_code) WHERE output_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gen_pdf_owner_company
  ON erp_generated_pdf_documents (owner_company_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_gen_pdf_serial_no
  ON erp_generated_pdf_documents (serial_no) WHERE serial_no IS NOT NULL;

-- ── 4. Public links: canonical one-directional relationship to the PDF row ──
ALTER TABLE erp_output_public_links
  ADD COLUMN IF NOT EXISTS generated_pdf_document_id bigint REFERENCES erp_generated_pdf_documents(id);

CREATE INDEX IF NOT EXISTS idx_output_links_generated_pdf
  ON erp_output_public_links (generated_pdf_document_id) WHERE generated_pdf_document_id IS NOT NULL;

-- Idempotent backfill where a stored file path verifiably matches.
UPDATE erp_output_public_links l
SET generated_pdf_document_id = g.id
FROM erp_generated_pdf_documents g
WHERE l.generated_pdf_document_id IS NULL
  AND l.download_file_path IS NOT NULL
  AND l.download_file_path = g.storage_path;

-- ── 5. Template Studio structured-body foundation ────────────────────────────
ALTER TABLE erp_report_templates
  ADD COLUMN IF NOT EXISTS body_schema_json jsonb,
  ADD COLUMN IF NOT EXISTS studio_schema_version integer NOT NULL DEFAULT 1;
-- visual_editor_engine is unconstrained text; value 'studio' is now authorized.

-- ── 6. Operations Console permissions ────────────────────────────────────────
INSERT INTO permissions (permission_code, permission_name, module_code, action_code, description, is_active, display_name, is_system_permission, is_visible)
VALUES
  ('outputs.ops.view',   'View Output Operations',   'OUTPUTS', 'view',   'View global output issuance history, lifecycle states, and renderer health', true, 'Output Ops — View',   true, true),
  ('outputs.ops.retry',  'Retry Output Operations',  'OUTPUTS', 'retry',  'Retry failed/retryable output issuances and reconcile orphans',              true, 'Output Ops — Retry',  true, true),
  ('outputs.ops.revoke', 'Revoke Output Documents',  'OUTPUTS', 'revoke', 'Revoke, expire, or supersede issued output documents (policy-controlled)',    true, 'Output Ops — Revoke', true, true)
ON CONFLICT (permission_code) DO NOTHING;

-- ── 7. dms-temp cleanup governance (settings + run log) ─────────────────────
CREATE TABLE IF NOT EXISTS erp_dms_temp_cleanup_settings (
  id                     smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled                boolean NOT NULL DEFAULT false,
  retention_hours_completed integer NOT NULL DEFAULT 24,
  retention_hours_cancelled integer NOT NULL DEFAULT 24,
  retention_hours_failed    integer NOT NULL DEFAULT 168,
  retention_hours_expired   integer NOT NULL DEFAULT 336,
  batch_size             integer NOT NULL DEFAULT 100 CHECK (batch_size BETWEEN 1 AND 500),
  legal_hold_prefixes    jsonb NOT NULL DEFAULT '[]'::jsonb,
  manual_retain_session_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at             timestamptz NOT NULL DEFAULT now(),
  updated_by             bigint
);
INSERT INTO erp_dms_temp_cleanup_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS erp_dms_temp_cleanup_runs (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_at         timestamptz NOT NULL DEFAULT now(),
  mode           text NOT NULL CHECK (mode = ANY (ARRAY['dry_run','delete'])),
  triggered_by   bigint,
  scanned        integer NOT NULL DEFAULT 0,
  eligible       integer NOT NULL DEFAULT 0,
  deleted        integer NOT NULL DEFAULT 0,
  failed         integer NOT NULL DEFAULT 0,
  skipped        integer NOT NULL DEFAULT 0,
  bytes_freed    bigint NOT NULL DEFAULT 0,
  orphans_found  integer NOT NULL DEFAULT 0,
  skip_reasons   jsonb,
  errors         jsonb,
  status         text NOT NULL DEFAULT 'completed' CHECK (status = ANY (ARRAY['completed','failed','partial'])),
  duration_ms    integer
);

ALTER TABLE erp_dms_temp_cleanup_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_dms_temp_cleanup_runs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='erp_dms_temp_cleanup_settings' AND policyname='dms_temp_cleanup_settings_admin') THEN
    CREATE POLICY dms_temp_cleanup_settings_admin ON erp_dms_temp_cleanup_settings
      FOR ALL TO authenticated
      USING (current_user_has_permission('dms.admin'))
      WITH CHECK (current_user_has_permission('dms.admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='erp_dms_temp_cleanup_runs' AND policyname='dms_temp_cleanup_runs_select') THEN
    CREATE POLICY dms_temp_cleanup_runs_select ON erp_dms_temp_cleanup_runs
      FOR SELECT TO authenticated USING (current_user_has_permission('dms.admin'));
  END IF;
END $$;
-- Inserts to the run log happen via service role only (no authenticated INSERT policy).
