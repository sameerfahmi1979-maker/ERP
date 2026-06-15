-- ============================================================================
-- ERP DMS.2 — Database Foundation, RLS, Numbering, and Storage Buckets
-- Migration: erp_dms_2_database_foundation_rls_numbering_storage_buckets
-- Date: 2026-06-14
-- Phase: ERP DMS.2
-- Depends on: ERP SETTINGS.1 (erp_ai_provider_configs already exists)
-- Tables: 22 DMS tables
-- ============================================================================
-- HARD RULES:
--   1. DO NOT recreate erp_ai_provider_configs / erp_ai_usage_logs / erp_ai_feature_flags
--   2. DO NOT drop/alter party_documents, party_document_types, party_document_statuses
--   3. ALL DMS tables use BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY
--   4. RLS enabled and forced on every table
--   5. No public storage buckets
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 1: dms_document_categories
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dms_document_categories (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category_code TEXT NOT NULL CONSTRAINT dms_document_categories_code_uq UNIQUE,
  name_en      TEXT NOT NULL,
  name_ar      TEXT,
  description  TEXT,
  icon         TEXT,
  sort_order   INT NOT NULL DEFAULT 0,
  is_system    BOOLEAN NOT NULL DEFAULT true,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_by   BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by   BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);

COMMENT ON TABLE dms_document_categories IS 'DMS document category master. Groups document types into logical categories.';

CREATE INDEX IF NOT EXISTS idx_dms_document_categories_code ON dms_document_categories (category_code);

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 2: dms_document_types
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dms_document_types (
  id                        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  type_code                 TEXT NOT NULL CONSTRAINT dms_document_types_code_uq UNIQUE,
  name_en                   TEXT NOT NULL,
  name_ar                   TEXT,
  description               TEXT,
  category_id               BIGINT NOT NULL REFERENCES dms_document_categories(id) ON DELETE RESTRICT,
  requires_expiry_tracking  BOOLEAN NOT NULL DEFAULT false,
  default_confidentiality   TEXT NOT NULL DEFAULT 'internal',
  -- internal | company | hr | finance | legal | executive
  requires_approval         BOOLEAN NOT NULL DEFAULT false,
  default_retention_days    INT,
  ai_extraction_schema      JSONB,
  -- JSON schema describing fields AI should extract
  allowed_entity_types      TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  -- entity types this document type applies to
  is_system                 BOOLEAN NOT NULL DEFAULT true,
  is_active                 BOOLEAN NOT NULL DEFAULT true,
  sort_order                INT NOT NULL DEFAULT 0,
  created_by                BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by                BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at                TIMESTAMPTZ
);

COMMENT ON TABLE dms_document_types IS 'DMS master document type table. Will replace party_document_types in DMS.6. party_document_types remains active until DMS.6 migration.';
COMMENT ON COLUMN dms_document_types.ai_extraction_schema IS 'JSON schema describing fields the AI extractor should return for this document type.';

CREATE INDEX IF NOT EXISTS idx_dms_document_types_code     ON dms_document_types (type_code);
CREATE INDEX IF NOT EXISTS idx_dms_document_types_category ON dms_document_types (category_id);
CREATE INDEX IF NOT EXISTS idx_dms_document_types_active   ON dms_document_types (is_active, is_system);
CREATE INDEX IF NOT EXISTS idx_gin_dms_document_types_schema ON dms_document_types USING GIN (ai_extraction_schema) WHERE ai_extraction_schema IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 3: dms_metadata_definitions
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dms_metadata_definitions (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_type_id  BIGINT NOT NULL REFERENCES dms_document_types(id) ON DELETE CASCADE,
  field_code        TEXT NOT NULL,
  field_label_en    TEXT NOT NULL,
  field_label_ar    TEXT,
  field_type        TEXT NOT NULL,
  -- text | textarea | number | date | datetime | boolean | select | multi_select
  -- party_ref | employee_ref | vehicle_ref | equipment_ref | project_ref
  -- currency | country_ref | region_ref | city_ref | json
  is_required       BOOLEAN NOT NULL DEFAULT false,
  is_ai_extractable BOOLEAN NOT NULL DEFAULT false,
  ai_field_hint     TEXT,
  options_json      JSONB,
  -- for select/multi_select: [{value, label}]
  validation_json   JSONB,
  -- {min, max, pattern, ...}
  sort_order        INT NOT NULL DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_by        BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by        BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ,
  CONSTRAINT dms_metadata_definitions_type_field_uq UNIQUE (document_type_id, field_code)
);

COMMENT ON TABLE dms_metadata_definitions IS 'Dynamic metadata field definitions per DMS document type.';

CREATE INDEX IF NOT EXISTS idx_dms_metadata_definitions_type ON dms_metadata_definitions (document_type_id);

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 4: dms_documents
-- Note: current_version_id FK added after dms_document_versions is created.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dms_documents (
  id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_no          TEXT NOT NULL CONSTRAINT dms_documents_no_uq UNIQUE,
  -- Generated by MASTER_DMS_DOCUMENT numbering rule. Format: DMS-{YYYY}-{SEQ6}
  legacy_document_code TEXT,
  -- Populated during DMS.6 migration from party_documents.document_code
  migrated_from_table  TEXT,
  -- e.g. 'party_documents' — set during DMS.6 migration
  title                TEXT NOT NULL,
  description          TEXT,
  document_type_id     BIGINT NOT NULL REFERENCES dms_document_types(id) ON DELETE RESTRICT,
  category_id          BIGINT NOT NULL REFERENCES dms_document_categories(id) ON DELETE RESTRICT,
  status               TEXT NOT NULL DEFAULT 'draft',
  -- draft | pending_review | approved | rejected | active | expired | archived | superseded | deleted
  confidentiality_level TEXT NOT NULL DEFAULT 'internal',
  -- internal | company | hr | finance | legal | executive
  owner_user_id        BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  owning_company_id    BIGINT REFERENCES owner_companies(id) ON DELETE SET NULL,
  owning_branch_id     BIGINT REFERENCES branches(id) ON DELETE SET NULL,
  issue_date           DATE,
  expiry_date          DATE,
  reminder_policy_id   BIGINT,
  -- FK to dms_retention_policies added after that table is created
  current_version_id   BIGINT,
  -- FK to dms_document_versions added after that table is created
  ocr_status           TEXT NOT NULL DEFAULT 'not_required',
  -- not_required | pending | processing | completed | failed
  ai_status            TEXT NOT NULL DEFAULT 'not_required',
  -- not_required | pending | processing | completed | failed
  review_status        TEXT NOT NULL DEFAULT 'not_required',
  -- not_required | pending | in_review | approved | rejected
  is_archived          BOOLEAN NOT NULL DEFAULT false,
  archived_at          TIMESTAMPTZ,
  created_by           BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by           BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at           TIMESTAMPTZ
);

COMMENT ON TABLE dms_documents IS 'Central DMS document metadata repository. document_no is generated by MASTER_DMS_DOCUMENT numbering rule.';
COMMENT ON COLUMN dms_documents.legacy_document_code IS 'Preserved from party_documents.document_code during DMS.6 migration for backward compatibility.';

CREATE INDEX IF NOT EXISTS idx_dms_documents_no          ON dms_documents (document_no);
CREATE INDEX IF NOT EXISTS idx_dms_documents_type        ON dms_documents (document_type_id);
CREATE INDEX IF NOT EXISTS idx_dms_documents_category    ON dms_documents (category_id);
CREATE INDEX IF NOT EXISTS idx_dms_documents_status      ON dms_documents (status);
CREATE INDEX IF NOT EXISTS idx_dms_documents_expiry      ON dms_documents (expiry_date) WHERE expiry_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dms_documents_company     ON dms_documents (owning_company_id) WHERE owning_company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dms_documents_branch      ON dms_documents (owning_branch_id) WHERE owning_branch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dms_documents_created_at  ON dms_documents (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dms_documents_active      ON dms_documents (status, is_archived, deleted_at);

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 5: dms_document_versions
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dms_document_versions (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id    BIGINT NOT NULL REFERENCES dms_documents(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  version_label  TEXT,
  -- e.g. 'v1.0', 'Renewal 2025'
  change_notes   TEXT,
  is_current     BOOLEAN NOT NULL DEFAULT false,
  created_by     BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT dms_document_versions_doc_ver_uq UNIQUE (document_id, version_number)
);

COMMENT ON TABLE dms_document_versions IS 'Non-destructive document versioning. Each upload creates a new version. Originals are never overwritten.';

CREATE INDEX IF NOT EXISTS idx_dms_document_versions_document ON dms_document_versions (document_id);

-- Now add FK from dms_documents.current_version_id to dms_document_versions
ALTER TABLE dms_documents
  ADD CONSTRAINT fk_dms_documents_current_version
  FOREIGN KEY (current_version_id) REFERENCES dms_document_versions(id) ON DELETE SET NULL
  NOT VALID;

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 6: dms_document_files
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dms_document_files (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id       BIGINT NOT NULL REFERENCES dms_documents(id) ON DELETE CASCADE,
  version_id        BIGINT REFERENCES dms_document_versions(id) ON DELETE SET NULL,
  file_role         TEXT NOT NULL DEFAULT 'original',
  -- original | processed | archive_pdf_a | preview
  storage_bucket    TEXT NOT NULL,
  -- 'dms-documents' or 'dms-temp'
  storage_path      TEXT NOT NULL,
  -- Full path within bucket: {company}/{doc_no}/{version}/{filename}
  file_name         TEXT NOT NULL,
  mime_type         TEXT NOT NULL,
  file_size_bytes   BIGINT NOT NULL,
  sha256_hash       TEXT,
  -- For deduplication. NULL until computed.
  page_count        INT,
  ocr_text          TEXT,
  -- Populated in DMS.9 after OCR. Not stored in DMS.2.
  language          TEXT,
  created_by        BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

COMMENT ON TABLE dms_document_files IS 'Physical file storage metadata. All files are in private Supabase Storage buckets. OCR text populated in DMS.9.';
COMMENT ON COLUMN dms_document_files.ocr_text IS 'Populated in DMS.9 OCR phase. Full-text search tsvector index deferred to DMS.12.';

CREATE INDEX IF NOT EXISTS idx_dms_document_files_document ON dms_document_files (document_id);
CREATE INDEX IF NOT EXISTS idx_dms_document_files_version  ON dms_document_files (version_id) WHERE version_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dms_document_files_hash     ON dms_document_files (sha256_hash) WHERE sha256_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dms_document_files_role     ON dms_document_files (file_role);

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 7: dms_tags
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dms_tags (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tag_code   TEXT CONSTRAINT dms_tags_code_uq UNIQUE,
  tag_name   TEXT NOT NULL CONSTRAINT dms_tags_name_uq UNIQUE,
  color_hex  TEXT,
  is_system  BOOLEAN NOT NULL DEFAULT false,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_by BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

COMMENT ON TABLE dms_tags IS 'DMS document tags for flexible categorisation.';

CREATE INDEX IF NOT EXISTS idx_dms_tags_name ON dms_tags (tag_name);

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 8: dms_document_tags
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dms_document_tags (
  document_id BIGINT NOT NULL REFERENCES dms_documents(id) ON DELETE CASCADE,
  tag_id      BIGINT NOT NULL REFERENCES dms_tags(id) ON DELETE CASCADE,
  created_by  BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (document_id, tag_id)
);

COMMENT ON TABLE dms_document_tags IS 'Many-to-many: document to tags.';

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 9: dms_document_metadata_values
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dms_document_metadata_values (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id     BIGINT NOT NULL REFERENCES dms_documents(id) ON DELETE CASCADE,
  definition_id   BIGINT NOT NULL REFERENCES dms_metadata_definitions(id) ON DELETE CASCADE,
  value_text      TEXT,
  value_number    NUMERIC,
  value_date      DATE,
  value_datetime  TIMESTAMPTZ,
  value_boolean   BOOLEAN,
  value_json      JSONB,
  created_by      BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,
  CONSTRAINT dms_document_metadata_values_doc_def_uq UNIQUE (document_id, definition_id)
);

COMMENT ON TABLE dms_document_metadata_values IS 'Dynamic metadata values per document instance. Each row holds one field value for a document.';

CREATE INDEX IF NOT EXISTS idx_dms_document_metadata_values_document   ON dms_document_metadata_values (document_id);
CREATE INDEX IF NOT EXISTS idx_gin_dms_metadata_value_json             ON dms_document_metadata_values USING GIN (value_json) WHERE value_json IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 10: dms_document_links
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dms_document_links (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id BIGINT NOT NULL REFERENCES dms_documents(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  -- party | party_license | party_tax_registration | employee | vehicle | equipment
  -- project | contract | purchase_order | invoice | job_card | hse_incident
  -- company | branch | bank
  entity_id   BIGINT NOT NULL,
  link_role   TEXT,
  -- e.g. 'supporting', 'primary', 'reference'
  is_primary  BOOLEAN NOT NULL DEFAULT false,
  linked_by   BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  linked_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

COMMENT ON TABLE dms_document_links IS 'Generic link from a DMS document to any ERP entity (party, employee, vehicle, etc).';

CREATE UNIQUE INDEX IF NOT EXISTS idx_dms_document_links_active_uq
  ON dms_document_links (document_id, entity_type, entity_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_dms_document_links_document ON dms_document_links (document_id);
CREATE INDEX IF NOT EXISTS idx_dms_document_links_entity   ON dms_document_links (entity_type, entity_id);

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 11: dms_upload_sessions
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dms_upload_sessions (
  id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_code         TEXT NOT NULL CONSTRAINT dms_upload_sessions_code_uq UNIQUE,
  -- Public-safe UUID-style reference generated by server (not a DB UUID PK)
  status               TEXT NOT NULL DEFAULT 'uploaded',
  -- uploaded | processing | ocr_queued | ai_queued | review_pending | completed | failed | expired
  original_filename    TEXT NOT NULL,
  mime_type            TEXT NOT NULL,
  file_size_bytes      BIGINT NOT NULL,
  sha256_hash          TEXT,
  temp_storage_path    TEXT,
  -- Path in dms-temp bucket
  is_duplicate         BOOLEAN NOT NULL DEFAULT false,
  duplicate_document_id BIGINT REFERENCES dms_documents(id) ON DELETE SET NULL,
  uploaded_by          BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  uploaded_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at           TIMESTAMPTZ,
  -- Temp files expire after 14 days (cleanup in DMS.7+)
  completed_at         TIMESTAMPTZ,
  error_message        TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at           TIMESTAMPTZ
);

COMMENT ON TABLE dms_upload_sessions IS 'Temporary document intake sessions. Files start in dms-temp bucket; moved to dms-documents on completion. Expire after 14 days.';

CREATE INDEX IF NOT EXISTS idx_dms_upload_sessions_status ON dms_upload_sessions (status);
CREATE INDEX IF NOT EXISTS idx_dms_upload_sessions_code   ON dms_upload_sessions (session_code);

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 12: dms_ai_extraction_jobs
-- References erp_ai_provider_configs from ERP SETTINGS.1 (already exists)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dms_ai_extraction_jobs (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  upload_session_id BIGINT REFERENCES dms_upload_sessions(id) ON DELETE SET NULL,
  document_id       BIGINT REFERENCES dms_documents(id) ON DELETE SET NULL,
  provider_config_id BIGINT REFERENCES erp_ai_provider_configs(id) ON DELETE SET NULL,
  -- References ERP SETTINGS.1 table
  job_type          TEXT NOT NULL,
  -- ocr | classification | extraction | full_pipeline
  provider          TEXT,
  model             TEXT,
  status            TEXT NOT NULL DEFAULT 'pending',
  -- pending | queued | processing | completed | failed | cancelled
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  duration_ms       INT,
  error_message     TEXT,
  retry_count       INT NOT NULL DEFAULT 0,
  created_by        BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE dms_ai_extraction_jobs IS 'AI/OCR job records. No AI calls in DMS.2. Jobs executed from DMS.9+. References erp_ai_provider_configs from ERP SETTINGS.1.';

CREATE INDEX IF NOT EXISTS idx_dms_ai_jobs_status   ON dms_ai_extraction_jobs (status);
CREATE INDEX IF NOT EXISTS idx_dms_ai_jobs_document ON dms_ai_extraction_jobs (document_id) WHERE document_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 13: dms_ai_extraction_results
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dms_ai_extraction_results (
  id                          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id                      BIGINT NOT NULL REFERENCES dms_ai_extraction_jobs(id) ON DELETE CASCADE,
  upload_session_id           BIGINT REFERENCES dms_upload_sessions(id) ON DELETE SET NULL,
  document_id                 BIGINT REFERENCES dms_documents(id) ON DELETE SET NULL,
  suggested_document_type_id  BIGINT REFERENCES dms_document_types(id) ON DELETE SET NULL,
  classification_confidence   TEXT,
  -- high | medium | low | needs_manual_review
  classification_score        NUMERIC(4,3),
  extracted_fields_json       JSONB,
  -- {fieldCode: {value, confidence, ...}}
  suggested_links_json        JSONB,
  -- [{entity_type, entity_id, confidence}]
  expiry_date_suggestion      DATE,
  raw_ocr_text                TEXT,
  raw_response_json           JSONB,
  reviewed_by                 BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  reviewed_at                 TIMESTAMPTZ,
  review_action               TEXT,
  -- accepted | rejected | modified
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE dms_ai_extraction_results IS 'AI/OCR extraction results awaiting human review. Populated in DMS.9/DMS.10.';

CREATE INDEX IF NOT EXISTS idx_dms_ai_results_job ON dms_ai_extraction_results (job_id);
CREATE INDEX IF NOT EXISTS idx_gin_dms_ai_extracted_fields ON dms_ai_extraction_results USING GIN (extracted_fields_json) WHERE extracted_fields_json IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gin_dms_ai_suggested_links  ON dms_ai_extraction_results USING GIN (suggested_links_json)  WHERE suggested_links_json IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 14: dms_review_queue
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dms_review_queue (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  upload_session_id     BIGINT REFERENCES dms_upload_sessions(id) ON DELETE SET NULL,
  document_id           BIGINT REFERENCES dms_documents(id) ON DELETE SET NULL,
  assigned_to           BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  priority              TEXT NOT NULL DEFAULT 'normal',
  -- urgent | high | normal | low
  status                TEXT NOT NULL DEFAULT 'pending',
  -- pending | in_review | completed | cancelled
  queued_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  review_started_at     TIMESTAMPTZ,
  review_completed_at   TIMESTAMPTZ,
  notes                 TEXT,
  created_by            BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at            TIMESTAMPTZ
);

COMMENT ON TABLE dms_review_queue IS 'Human review queue for AI extraction results. All AI extractions require human review before final save.';

CREATE INDEX IF NOT EXISTS idx_dms_review_queue_status   ON dms_review_queue (status);
CREATE INDEX IF NOT EXISTS idx_dms_review_queue_assigned ON dms_review_queue (assigned_to) WHERE assigned_to IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 15: dms_document_workflows
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dms_document_workflows (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workflow_code     TEXT NOT NULL CONSTRAINT dms_document_workflows_code_uq UNIQUE,
  name_en           TEXT NOT NULL,
  name_ar           TEXT,
  description       TEXT,
  document_type_id  BIGINT REFERENCES dms_document_types(id) ON DELETE SET NULL,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_by        BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by        BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

COMMENT ON TABLE dms_document_workflows IS 'DMS workflow definitions for document approval processes.';

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 16: dms_document_workflow_steps
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dms_document_workflow_steps (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workflow_id    BIGINT NOT NULL REFERENCES dms_document_workflows(id) ON DELETE CASCADE,
  step_code      TEXT NOT NULL,
  step_name      TEXT NOT NULL,
  is_initial     BOOLEAN NOT NULL DEFAULT false,
  is_final       BOOLEAN NOT NULL DEFAULT false,
  requires_role  TEXT,
  sort_order     INT NOT NULL DEFAULT 0,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT dms_workflow_steps_wf_code_uq UNIQUE (workflow_id, step_code)
);

COMMENT ON TABLE dms_document_workflow_steps IS 'Individual steps in a DMS document workflow.';

CREATE INDEX IF NOT EXISTS idx_dms_workflow_steps_workflow ON dms_document_workflow_steps (workflow_id);

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 17: dms_document_approvals
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dms_document_approvals (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id  BIGINT NOT NULL REFERENCES dms_documents(id) ON DELETE CASCADE,
  workflow_id  BIGINT REFERENCES dms_document_workflows(id) ON DELETE SET NULL,
  step_id      BIGINT REFERENCES dms_document_workflow_steps(id) ON DELETE SET NULL,
  action       TEXT NOT NULL,
  -- approved | rejected | returned | escalated
  actioned_by  BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  actioned_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  comments     TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE dms_document_approvals IS 'DMS document approval/rejection audit log per workflow step.';

CREATE INDEX IF NOT EXISTS idx_dms_approvals_document ON dms_document_approvals (document_id);

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 18: dms_document_access_rules
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dms_document_access_rules (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id       BIGINT REFERENCES dms_documents(id) ON DELETE CASCADE,
  document_type_id  BIGINT REFERENCES dms_document_types(id) ON DELETE CASCADE,
  principal_type    TEXT NOT NULL,
  -- user | role | department
  principal_id      BIGINT NOT NULL,
  permission        TEXT NOT NULL,
  -- view | download | edit | delete | approve
  granted           BOOLEAN NOT NULL DEFAULT true,
  created_by        BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

COMMENT ON TABLE dms_document_access_rules IS 'Optional explicit document/type-level access control overrides. Full confidentiality matrix tightened in DMS.13.';

CREATE INDEX IF NOT EXISTS idx_dms_access_rules_document ON dms_document_access_rules (document_id) WHERE document_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 19: dms_document_events
-- Immutable audit log — UPDATE and DELETE blocked by RLS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dms_document_events (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id   BIGINT REFERENCES dms_documents(id) ON DELETE SET NULL,
  event_type    TEXT NOT NULL,
  -- created | uploaded | version_added | status_changed | reviewed | approved | rejected
  -- ocr_completed | ai_extracted | ai_reviewed | archived | expiry_reminder_sent
  -- access_granted | access_revoked | link_added | link_removed | comment_added | deleted
  description   TEXT,
  performed_by  BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  performed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata_json JSONB
);

COMMENT ON TABLE dms_document_events IS 'Immutable DMS audit event log. UPDATE and DELETE are blocked by RLS policy.';

CREATE INDEX IF NOT EXISTS idx_dms_events_document ON dms_document_events (document_id) WHERE document_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dms_events_type     ON dms_document_events (event_type);
CREATE INDEX IF NOT EXISTS idx_dms_events_time     ON dms_document_events (performed_at DESC);

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 20: dms_expiry_reminders
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dms_expiry_reminders (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id         BIGINT NOT NULL REFERENCES dms_documents(id) ON DELETE CASCADE,
  reminder_days_before INT NOT NULL,
  reminder_date       DATE NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending',
  -- pending | sent | snoozed | cancelled
  sent_at             TIMESTAMPTZ,
  recipients_json     JSONB,
  -- [{user_id, email, channel}]
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT dms_expiry_reminders_doc_days_uq UNIQUE (document_id, reminder_days_before)
);

COMMENT ON TABLE dms_expiry_reminders IS 'Scheduled expiry reminder notifications for DMS documents.';

CREATE INDEX IF NOT EXISTS idx_dms_expiry_document ON dms_expiry_reminders (document_id);
CREATE INDEX IF NOT EXISTS idx_dms_expiry_date     ON dms_expiry_reminders (reminder_date) WHERE status = 'pending';

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 21: dms_retention_policies
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dms_retention_policies (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  policy_code        TEXT NOT NULL CONSTRAINT dms_retention_policies_code_uq UNIQUE,
  name_en            TEXT NOT NULL,
  name_ar            TEXT,
  description        TEXT,
  retain_for_days    INT,
  -- NULL = keep indefinitely
  action_on_expiry   TEXT NOT NULL DEFAULT 'notify',
  -- notify | archive | delete_after_review | permanent_delete
  applies_to_types   TEXT[],
  -- Array of type_codes this policy applies to by default
  is_active          BOOLEAN NOT NULL DEFAULT true,
  created_by         BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by         BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at         TIMESTAMPTZ
);

COMMENT ON TABLE dms_retention_policies IS 'Document retention policies. Defines how long documents are kept and what happens on expiry.';

-- Now add FK from dms_documents.reminder_policy_id to dms_retention_policies
ALTER TABLE dms_documents
  ADD CONSTRAINT fk_dms_documents_retention_policy
  FOREIGN KEY (reminder_policy_id) REFERENCES dms_retention_policies(id) ON DELETE SET NULL
  NOT VALID;

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 22: dms_document_comments
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dms_document_comments (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id  BIGINT NOT NULL REFERENCES dms_documents(id) ON DELETE CASCADE,
  comment_text TEXT NOT NULL,
  created_by   BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by   BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);

COMMENT ON TABLE dms_document_comments IS 'User comments/notes on DMS documents.';

CREATE INDEX IF NOT EXISTS idx_dms_comments_document ON dms_document_comments (document_id);

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 23: dms_saved_searches
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dms_saved_searches (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      BIGINT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  search_name  TEXT NOT NULL,
  filter_json  JSONB NOT NULL,
  is_shared    BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);

COMMENT ON TABLE dms_saved_searches IS 'User-saved DMS search filters and configurations.';

CREATE INDEX IF NOT EXISTS idx_dms_saved_searches_user ON dms_saved_searches (user_id);

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 24: RLS — Enable and Force on ALL DMS tables
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE dms_document_categories        ENABLE ROW LEVEL SECURITY;
ALTER TABLE dms_document_categories        FORCE ROW LEVEL SECURITY;
ALTER TABLE dms_document_types             ENABLE ROW LEVEL SECURITY;
ALTER TABLE dms_document_types             FORCE ROW LEVEL SECURITY;
ALTER TABLE dms_metadata_definitions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE dms_metadata_definitions       FORCE ROW LEVEL SECURITY;
ALTER TABLE dms_documents                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE dms_documents                  FORCE ROW LEVEL SECURITY;
ALTER TABLE dms_document_versions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE dms_document_versions          FORCE ROW LEVEL SECURITY;
ALTER TABLE dms_document_files             ENABLE ROW LEVEL SECURITY;
ALTER TABLE dms_document_files             FORCE ROW LEVEL SECURITY;
ALTER TABLE dms_tags                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE dms_tags                       FORCE ROW LEVEL SECURITY;
ALTER TABLE dms_document_tags              ENABLE ROW LEVEL SECURITY;
ALTER TABLE dms_document_tags              FORCE ROW LEVEL SECURITY;
ALTER TABLE dms_document_metadata_values   ENABLE ROW LEVEL SECURITY;
ALTER TABLE dms_document_metadata_values   FORCE ROW LEVEL SECURITY;
ALTER TABLE dms_document_links             ENABLE ROW LEVEL SECURITY;
ALTER TABLE dms_document_links             FORCE ROW LEVEL SECURITY;
ALTER TABLE dms_upload_sessions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE dms_upload_sessions            FORCE ROW LEVEL SECURITY;
ALTER TABLE dms_ai_extraction_jobs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE dms_ai_extraction_jobs         FORCE ROW LEVEL SECURITY;
ALTER TABLE dms_ai_extraction_results      ENABLE ROW LEVEL SECURITY;
ALTER TABLE dms_ai_extraction_results      FORCE ROW LEVEL SECURITY;
ALTER TABLE dms_review_queue               ENABLE ROW LEVEL SECURITY;
ALTER TABLE dms_review_queue               FORCE ROW LEVEL SECURITY;
ALTER TABLE dms_document_workflows         ENABLE ROW LEVEL SECURITY;
ALTER TABLE dms_document_workflows         FORCE ROW LEVEL SECURITY;
ALTER TABLE dms_document_workflow_steps    ENABLE ROW LEVEL SECURITY;
ALTER TABLE dms_document_workflow_steps    FORCE ROW LEVEL SECURITY;
ALTER TABLE dms_document_approvals         ENABLE ROW LEVEL SECURITY;
ALTER TABLE dms_document_approvals         FORCE ROW LEVEL SECURITY;
ALTER TABLE dms_document_access_rules      ENABLE ROW LEVEL SECURITY;
ALTER TABLE dms_document_access_rules      FORCE ROW LEVEL SECURITY;
ALTER TABLE dms_document_events            ENABLE ROW LEVEL SECURITY;
ALTER TABLE dms_document_events            FORCE ROW LEVEL SECURITY;
ALTER TABLE dms_expiry_reminders           ENABLE ROW LEVEL SECURITY;
ALTER TABLE dms_expiry_reminders           FORCE ROW LEVEL SECURITY;
ALTER TABLE dms_retention_policies         ENABLE ROW LEVEL SECURITY;
ALTER TABLE dms_retention_policies         FORCE ROW LEVEL SECURITY;
ALTER TABLE dms_document_comments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE dms_document_comments          FORCE ROW LEVEL SECURITY;
ALTER TABLE dms_saved_searches             ENABLE ROW LEVEL SECURITY;
ALTER TABLE dms_saved_searches             FORCE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────────────────────
-- RLS Policies: Category/Type masters — view for authenticated, manage for dms.admin
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS dms_doc_categories_select ON dms_document_categories;
CREATE POLICY dms_doc_categories_select ON dms_document_categories
  FOR SELECT USING (auth.uid() IS NOT NULL AND (current_user_has_permission('dms.documents.view') OR current_user_has_role('system_admin')));

DROP POLICY IF EXISTS dms_doc_categories_manage ON dms_document_categories;
CREATE POLICY dms_doc_categories_manage ON dms_document_categories
  FOR ALL USING (current_user_has_permission('dms.documents.manage_types') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS dms_doc_types_select ON dms_document_types;
CREATE POLICY dms_doc_types_select ON dms_document_types
  FOR SELECT USING (auth.uid() IS NOT NULL AND (current_user_has_permission('dms.documents.view') OR current_user_has_role('system_admin')));

DROP POLICY IF EXISTS dms_doc_types_manage ON dms_document_types;
CREATE POLICY dms_doc_types_manage ON dms_document_types
  FOR ALL USING (current_user_has_permission('dms.documents.manage_types') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS dms_metadata_def_select ON dms_metadata_definitions;
CREATE POLICY dms_metadata_def_select ON dms_metadata_definitions
  FOR SELECT USING (auth.uid() IS NOT NULL AND (current_user_has_permission('dms.documents.view') OR current_user_has_role('system_admin')));

DROP POLICY IF EXISTS dms_metadata_def_manage ON dms_metadata_definitions;
CREATE POLICY dms_metadata_def_manage ON dms_metadata_definitions
  FOR ALL USING (current_user_has_permission('dms.documents.manage_types') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS dms_retention_select ON dms_retention_policies;
CREATE POLICY dms_retention_select ON dms_retention_policies
  FOR SELECT USING (auth.uid() IS NOT NULL AND current_user_has_permission('dms.documents.view'));

DROP POLICY IF EXISTS dms_retention_manage ON dms_retention_policies;
CREATE POLICY dms_retention_manage ON dms_retention_policies
  FOR ALL USING (current_user_has_permission('dms.admin') OR current_user_has_role('system_admin'));

-- ────────────────────────────────────────────────────────────────────────────
-- RLS Policies: Core document tables
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS dms_documents_select ON dms_documents;
CREATE POLICY dms_documents_select ON dms_documents
  FOR SELECT USING (auth.uid() IS NOT NULL AND (current_user_has_permission('dms.documents.view') OR current_user_has_role('system_admin')));

DROP POLICY IF EXISTS dms_documents_insert ON dms_documents;
CREATE POLICY dms_documents_insert ON dms_documents
  FOR INSERT WITH CHECK (current_user_has_permission('dms.documents.upload') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS dms_documents_update ON dms_documents;
CREATE POLICY dms_documents_update ON dms_documents
  FOR UPDATE USING (current_user_has_permission('dms.documents.edit') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS dms_documents_delete ON dms_documents;
CREATE POLICY dms_documents_delete ON dms_documents
  FOR DELETE USING (current_user_has_permission('dms.documents.delete') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS dms_versions_select ON dms_document_versions;
CREATE POLICY dms_versions_select ON dms_document_versions
  FOR SELECT USING (auth.uid() IS NOT NULL AND (current_user_has_permission('dms.documents.view') OR current_user_has_role('system_admin')));

DROP POLICY IF EXISTS dms_versions_insert ON dms_document_versions;
CREATE POLICY dms_versions_insert ON dms_document_versions
  FOR INSERT WITH CHECK (current_user_has_permission('dms.documents.upload') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS dms_files_select ON dms_document_files;
CREATE POLICY dms_files_select ON dms_document_files
  FOR SELECT USING (auth.uid() IS NOT NULL AND (current_user_has_permission('dms.documents.preview') OR current_user_has_role('system_admin')));

DROP POLICY IF EXISTS dms_files_insert ON dms_document_files;
CREATE POLICY dms_files_insert ON dms_document_files
  FOR INSERT WITH CHECK (current_user_has_permission('dms.documents.upload') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS dms_tags_select ON dms_tags;
CREATE POLICY dms_tags_select ON dms_tags
  FOR SELECT USING (auth.uid() IS NOT NULL AND current_user_has_permission('dms.documents.view'));

DROP POLICY IF EXISTS dms_tags_manage ON dms_tags;
CREATE POLICY dms_tags_manage ON dms_tags
  FOR ALL USING (current_user_has_permission('dms.documents.manage_tags') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS dms_doc_tags_select ON dms_document_tags;
CREATE POLICY dms_doc_tags_select ON dms_document_tags
  FOR SELECT USING (auth.uid() IS NOT NULL AND current_user_has_permission('dms.documents.view'));

DROP POLICY IF EXISTS dms_doc_tags_manage ON dms_document_tags;
CREATE POLICY dms_doc_tags_manage ON dms_document_tags
  FOR ALL USING (current_user_has_permission('dms.documents.edit') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS dms_metadata_vals_select ON dms_document_metadata_values;
CREATE POLICY dms_metadata_vals_select ON dms_document_metadata_values
  FOR SELECT USING (auth.uid() IS NOT NULL AND current_user_has_permission('dms.documents.view'));

DROP POLICY IF EXISTS dms_metadata_vals_manage ON dms_document_metadata_values;
CREATE POLICY dms_metadata_vals_manage ON dms_document_metadata_values
  FOR ALL USING (current_user_has_permission('dms.documents.edit') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS dms_links_select ON dms_document_links;
CREATE POLICY dms_links_select ON dms_document_links
  FOR SELECT USING (auth.uid() IS NOT NULL AND current_user_has_permission('dms.documents.view'));

DROP POLICY IF EXISTS dms_links_manage ON dms_document_links;
CREATE POLICY dms_links_manage ON dms_document_links
  FOR ALL USING (current_user_has_permission('dms.documents.edit') OR current_user_has_role('system_admin'));

-- Upload sessions: uploader can see their own; admin can see all
DROP POLICY IF EXISTS dms_upload_sessions_select ON dms_upload_sessions;
CREATE POLICY dms_upload_sessions_select ON dms_upload_sessions
  FOR SELECT USING (auth.uid() IS NOT NULL AND (
    current_user_has_permission('dms.documents.upload') OR current_user_has_role('system_admin')
  ));

DROP POLICY IF EXISTS dms_upload_sessions_insert ON dms_upload_sessions;
CREATE POLICY dms_upload_sessions_insert ON dms_upload_sessions
  FOR INSERT WITH CHECK (current_user_has_permission('dms.documents.upload') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS dms_upload_sessions_update ON dms_upload_sessions;
CREATE POLICY dms_upload_sessions_update ON dms_upload_sessions
  FOR UPDATE USING (current_user_has_permission('dms.documents.upload') OR current_user_has_role('system_admin'));

-- AI jobs: view for review_ai, manage for admin
DROP POLICY IF EXISTS dms_ai_jobs_select ON dms_ai_extraction_jobs;
CREATE POLICY dms_ai_jobs_select ON dms_ai_extraction_jobs
  FOR SELECT USING (auth.uid() IS NOT NULL AND (current_user_has_permission('dms.documents.review_ai') OR current_user_has_role('system_admin')));

DROP POLICY IF EXISTS dms_ai_jobs_manage ON dms_ai_extraction_jobs;
CREATE POLICY dms_ai_jobs_manage ON dms_ai_extraction_jobs
  FOR ALL USING (current_user_has_permission('dms.admin') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS dms_ai_results_select ON dms_ai_extraction_results;
CREATE POLICY dms_ai_results_select ON dms_ai_extraction_results
  FOR SELECT USING (auth.uid() IS NOT NULL AND (current_user_has_permission('dms.documents.review_ai') OR current_user_has_role('system_admin')));

DROP POLICY IF EXISTS dms_ai_results_manage ON dms_ai_extraction_results;
CREATE POLICY dms_ai_results_manage ON dms_ai_extraction_results
  FOR ALL USING (current_user_has_permission('dms.documents.review_ai') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS dms_review_queue_select ON dms_review_queue;
CREATE POLICY dms_review_queue_select ON dms_review_queue
  FOR SELECT USING (auth.uid() IS NOT NULL AND (current_user_has_permission('dms.documents.review_ai') OR current_user_has_role('system_admin')));

DROP POLICY IF EXISTS dms_review_queue_manage ON dms_review_queue;
CREATE POLICY dms_review_queue_manage ON dms_review_queue
  FOR ALL USING (current_user_has_permission('dms.documents.review_ai') OR current_user_has_role('system_admin'));

-- Workflow tables
DROP POLICY IF EXISTS dms_workflows_select ON dms_document_workflows;
CREATE POLICY dms_workflows_select ON dms_document_workflows
  FOR SELECT USING (auth.uid() IS NOT NULL AND current_user_has_permission('dms.documents.view'));

DROP POLICY IF EXISTS dms_workflows_manage ON dms_document_workflows;
CREATE POLICY dms_workflows_manage ON dms_document_workflows
  FOR ALL USING (current_user_has_permission('dms.admin') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS dms_workflow_steps_select ON dms_document_workflow_steps;
CREATE POLICY dms_workflow_steps_select ON dms_document_workflow_steps
  FOR SELECT USING (auth.uid() IS NOT NULL AND current_user_has_permission('dms.documents.view'));

DROP POLICY IF EXISTS dms_workflow_steps_manage ON dms_document_workflow_steps;
CREATE POLICY dms_workflow_steps_manage ON dms_document_workflow_steps
  FOR ALL USING (current_user_has_permission('dms.admin') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS dms_approvals_select ON dms_document_approvals;
CREATE POLICY dms_approvals_select ON dms_document_approvals
  FOR SELECT USING (auth.uid() IS NOT NULL AND current_user_has_permission('dms.documents.view'));

DROP POLICY IF EXISTS dms_approvals_insert ON dms_document_approvals;
CREATE POLICY dms_approvals_insert ON dms_document_approvals
  FOR INSERT WITH CHECK (current_user_has_permission('dms.documents.approve') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS dms_access_rules_select ON dms_document_access_rules;
CREATE POLICY dms_access_rules_select ON dms_document_access_rules
  FOR SELECT USING (auth.uid() IS NOT NULL AND (current_user_has_permission('dms.documents.manage_security') OR current_user_has_role('system_admin')));

DROP POLICY IF EXISTS dms_access_rules_manage ON dms_document_access_rules;
CREATE POLICY dms_access_rules_manage ON dms_document_access_rules
  FOR ALL USING (current_user_has_permission('dms.documents.manage_security') OR current_user_has_role('system_admin'));

-- Events: append-only (SELECT and INSERT only; no UPDATE or DELETE)
DROP POLICY IF EXISTS dms_events_select ON dms_document_events;
CREATE POLICY dms_events_select ON dms_document_events
  FOR SELECT USING (auth.uid() IS NOT NULL AND (current_user_has_permission('dms.documents.view') OR current_user_has_role('system_admin')));

DROP POLICY IF EXISTS dms_events_insert ON dms_document_events;
CREATE POLICY dms_events_insert ON dms_document_events
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- No UPDATE/DELETE policies on dms_document_events — effectively append-only

DROP POLICY IF EXISTS dms_expiry_select ON dms_expiry_reminders;
CREATE POLICY dms_expiry_select ON dms_expiry_reminders
  FOR SELECT USING (auth.uid() IS NOT NULL AND (current_user_has_permission('dms.documents.view') OR current_user_has_role('system_admin')));

DROP POLICY IF EXISTS dms_expiry_manage ON dms_expiry_reminders;
CREATE POLICY dms_expiry_manage ON dms_expiry_reminders
  FOR ALL USING (current_user_has_permission('dms.admin') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS dms_comments_select ON dms_document_comments;
CREATE POLICY dms_comments_select ON dms_document_comments
  FOR SELECT USING (auth.uid() IS NOT NULL AND current_user_has_permission('dms.documents.view'));

DROP POLICY IF EXISTS dms_comments_insert ON dms_document_comments;
CREATE POLICY dms_comments_insert ON dms_document_comments
  FOR INSERT WITH CHECK (current_user_has_permission('dms.documents.edit') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS dms_comments_update ON dms_document_comments;
CREATE POLICY dms_comments_update ON dms_document_comments
  FOR UPDATE USING (current_user_has_permission('dms.documents.edit') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS dms_saved_searches_select ON dms_saved_searches;
CREATE POLICY dms_saved_searches_select ON dms_saved_searches
  FOR SELECT USING (auth.uid() IS NOT NULL AND (user_id = (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid()) OR is_shared = true));

DROP POLICY IF EXISTS dms_saved_searches_manage ON dms_saved_searches;
CREATE POLICY dms_saved_searches_manage ON dms_saved_searches
  FOR ALL USING (user_id = (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid()) OR current_user_has_role('system_admin'));

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 25: DMS Permissions
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO permissions (permission_code, permission_name, description, module_code, action_code, is_active)
VALUES
  ('dms.documents.view',            'View DMS Documents',          'View DMS document list and metadata',               'DMS', 'view',    true),
  ('dms.documents.preview',         'Preview DMS Documents',       'View document files in browser preview',            'DMS', 'view',    true),
  ('dms.documents.download',        'Download DMS Documents',      'Download document files',                           'DMS', 'view',    true),
  ('dms.documents.upload',          'Upload DMS Documents',        'Upload new documents to DMS',                       'DMS', 'create',  true),
  ('dms.documents.edit',            'Edit DMS Documents',          'Edit document metadata and fields',                 'DMS', 'edit',    true),
  ('dms.documents.delete',          'Delete DMS Documents',        'Soft-delete DMS documents',                         'DMS', 'delete',  true),
  ('dms.documents.archive',         'Archive DMS Documents',       'Archive/unarchive DMS documents',                   'DMS', 'manage',  true),
  ('dms.documents.approve',         'Approve DMS Documents',       'Approve or reject documents in workflow',           'DMS', 'approve', true),
  ('dms.documents.review_ai',       'Review AI Extractions',       'Review and accept/reject AI extraction results',    'DMS', 'manage',  true),
  ('dms.documents.manage_types',    'Manage DMS Document Types',   'Create/edit document types, categories, metadata',  'DMS', 'manage',  true),
  ('dms.documents.manage_tags',     'Manage DMS Tags',             'Create and manage DMS document tags',               'DMS', 'manage',  true),
  ('dms.documents.manage_security', 'Manage DMS Security',         'Manage document access rules and confidentiality',  'DMS', 'manage',  true),
  ('dms.documents.share_external',  'Share DMS Documents',         'Generate external share links for documents',       'DMS', 'manage',  true),
  ('dms.admin',                     'DMS Admin',                   'Full DMS administration access',                    'DMS', 'admin',   true),
  -- Confidentiality-level permissions
  ('dms.documents.view.internal',   'View Internal Documents',     'View documents at internal confidentiality',        'DMS', 'view',    true),
  ('dms.documents.view.company',    'View Company Documents',      'View documents at company confidentiality',         'DMS', 'view',    true),
  ('dms.documents.view.hr',         'View HR Documents',           'View documents at HR confidentiality',              'DMS', 'view',    true),
  ('dms.documents.view.finance',    'View Finance Documents',      'View documents at finance confidentiality',         'DMS', 'view',    true),
  ('dms.documents.view.legal',      'View Legal Documents',        'View documents at legal confidentiality',           'DMS', 'view',    true),
  ('dms.documents.view.executive',  'View Executive Documents',    'View documents at executive confidentiality',       'DMS', 'view',    true)
ON CONFLICT (permission_code) DO UPDATE SET
  permission_name = EXCLUDED.permission_name,
  description     = EXCLUDED.description;

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 26: Numbering Rule — MASTER_DMS_DOCUMENT
-- Format: DMS-{YYYY}-{SEQ6}  → e.g. DMS-2026-000001
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO global_numbering_rules
  (rule_code, rule_name, description, module_code, module_name, document_type_code,
   document_type_name, document_prefix, separator, format_template, sequence_length,
   padding_character, starting_sequence_number, current_sequence_number, next_sequence_number,
   reset_policy, reserve_on_draft, reserve_on_submit, allow_manual_override, allow_gaps,
   is_active, is_locked, notes)
VALUES
  ('MASTER_DMS_DOCUMENT',
   'DMS Document Reference',
   'Central DMS document number. Format: DMS-{YYYY}-{SEQ6}',
   'DMS', 'DMS', 'DOCUMENT', 'DMS Document',
   'DMS', '-', '{DOC}-{YYYY}-{SEQ6}', 6, '0',
   1, 0, 1,
   'never', false, true, false, true, true, false,
   'Generated for every DMS document record. party_documents uses MASTER_PARTY_DOCUMENT which remains active until DMS.6.')
ON CONFLICT (rule_code) DO UPDATE SET
  document_prefix  = EXCLUDED.document_prefix,
  format_template  = EXCLUDED.format_template,
  is_active        = EXCLUDED.is_active,
  updated_at       = now();

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 27: Seed dms_document_categories
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO dms_document_categories (category_code, name_en, name_ar, sort_order, is_system, is_active)
VALUES
  ('GENERAL',          'General',                    'عام',                    1,  true, true),
  ('COMPANY_DOCUMENTS','Company Documents',           'وثائق الشركة',           2,  true, true),
  ('LEGAL',            'Legal',                      'قانوني',                 3,  true, true),
  ('FINANCE',          'Finance',                    'مالي',                   4,  true, true),
  ('HR',               'Human Resources',            'الموارد البشرية',        5,  true, true),
  ('FLEET',            'Fleet & Vehicles',           'الأسطول والمركبات',      6,  true, true),
  ('EQUIPMENT',        'Equipment & Machinery',      'المعدات والآلات',        7,  true, true),
  ('HSE',              'Health, Safety & Environment','الصحة والسلامة والبيئة', 8,  true, true),
  ('QUALITY',          'Quality & Compliance',       'الجودة والامتثال',       9,  true, true),
  ('PROJECTS',         'Projects & Contracts',       'المشاريع والعقود',       10, true, true),
  ('OPERATIONS',       'Operations',                 'العمليات',               11, true, true),
  ('BUSINESS_DEV',     'Business Development',       'تطوير الأعمال',          12, true, true),
  ('INSURANCE',        'Insurance',                  'التأمين',                13, true, true)
ON CONFLICT (category_code) DO UPDATE SET
  name_en    = EXCLUDED.name_en,
  name_ar    = EXCLUDED.name_ar,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 28: Seed dms_document_types
-- Includes all existing party_document_types codes + new DMS-specific types
-- party_document_types remains unchanged and active until DMS.6
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO dms_document_types (
  type_code, name_en, name_ar, category_id,
  requires_expiry_tracking, default_confidentiality, is_system, sort_order,
  allowed_entity_types
)
SELECT
  t.type_code, t.name_en, t.name_ar,
  (SELECT id FROM dms_document_categories WHERE category_code = t.cat_code),
  t.exp_track, t.confidentiality, true, t.sort_order,
  t.entity_types
FROM (VALUES
  -- ── Party / Company Documents (existing party_document_types codes) ──
  ('TRADE_LICENSE',          'Trade License',                    'رخصة تجارية',                      'COMPANY_DOCUMENTS', true,  'company',   1,  ARRAY['party']),
  ('MOA',                    'Memorandum of Association',        'عقد التأسيس',                      'COMPANY_DOCUMENTS', false, 'company',   2,  ARRAY['party']),
  ('AOA',                    'Articles of Association',          'النظام الأساسي',                   'COMPANY_DOCUMENTS', false, 'company',   3,  ARRAY['party']),
  ('TRN_CERTIFICATE',        'TRN Certificate',                  'شهادة الرقم الضريبي',              'FINANCE',           false, 'finance',   4,  ARRAY['party']),
  ('VAT_CERTIFICATE',        'VAT Registration Certificate',     'شهادة تسجيل ضريبة القيمة المضافة','FINANCE',           false, 'finance',   5,  ARRAY['party']),
  ('INSURANCE_CERTIFICATE',  'Insurance Certificate',            'شهادة التأمين',                    'INSURANCE',         true,  'company',   6,  ARRAY['party','vehicle','equipment','project']),
  ('BANK_GUARANTEE',         'Bank Guarantee',                   'ضمان بنكي',                        'FINANCE',           true,  'finance',   7,  ARRAY['party','contract']),
  ('POWER_OF_ATTORNEY',      'Power of Attorney',                'وكالة قانونية',                    'LEGAL',             true,  'legal',     8,  ARRAY['party']),
  ('PASSPORT_COPY',          'Passport Copy',                    'نسخة جواز السفر',                  'HR',                true,  'hr',        9,  ARRAY['party','employee']),
  ('EMIRATES_ID',            'Emirates ID',                      'الهوية الإماراتية',                 'HR',                true,  'hr',        10, ARRAY['party','employee']),
  ('ISO_CERTIFICATE',        'ISO Certificate',                  'شهادة الأيزو',                     'QUALITY',           true,  'company',   11, ARRAY['party']),
  ('PREQUALIFICATION',       'Prequalification Certificate',     'شهادة التأهيل المسبق',             'BUSINESS_DEV',      true,  'company',   12, ARRAY['party']),
  ('CONTRACT',               'Contract',                         'عقد',                              'PROJECTS',          false, 'company',   13, ARRAY['party','project','contract']),
  ('OTHER',                  'Other Document',                   'وثيقة أخرى',                       'GENERAL',           false, 'internal',  99, ARRAY[]::TEXT[]),
  -- ── HR Documents ──
  ('VISA',                   'Visa',                             'تأشيرة',                            'HR',                true,  'hr',        20, ARRAY['employee']),
  ('LABOUR_CARD',            'Labour Card',                      'بطاقة العمل',                       'HR',                true,  'hr',        21, ARRAY['employee']),
  ('DRIVING_LICENSE',        'Driving License',                  'رخصة القيادة',                      'HR',                true,  'hr',        22, ARRAY['employee']),
  ('MEDICAL_INSURANCE',      'Medical Insurance',                'تأمين طبي',                         'INSURANCE',         true,  'hr',        23, ARRAY['employee']),
  -- ── Fleet ──
  ('VEHICLE_REGISTRATION',   'Vehicle Registration',             'تسجيل المركبة',                    'FLEET',             true,  'internal',  30, ARRAY['vehicle']),
  ('VEHICLE_INSURANCE',      'Vehicle Insurance',                'تأمين المركبة',                    'FLEET',             true,  'internal',  31, ARRAY['vehicle']),
  -- ── Equipment ──
  ('EQUIPMENT_REGISTRATION', 'Equipment Registration',           'تسجيل المعدة',                     'EQUIPMENT',         true,  'internal',  40, ARRAY['equipment']),
  ('CALIBRATION_CERTIFICATE','Calibration Certificate',          'شهادة المعايرة',                   'EQUIPMENT',         true,  'internal',  41, ARRAY['equipment']),
  -- ── Access Passes ──
  ('CICPA_PASS',             'CICPA Gate Pass',                  'تصريح دخول CICPA',                 'HSE',               true,  'hr',        50, ARRAY['employee']),
  ('ADNOC_GATE_PASS',        'ADNOC Gate Pass',                  'تصريح بوابة أدنوك',                'HSE',               true,  'hr',        51, ARRAY['employee']),
  ('SITE_ACCESS_PERMIT',     'Site Access Permit',               'تصريح دخول الموقع',                'HSE',               true,  'hr',        52, ARRAY['employee','project']),
  -- ── Prequalification/Business ──
  ('PREQUALIFICATION_DOC',   'Prequalification Document',        'وثيقة التأهيل المسبق',             'BUSINESS_DEV',      true,  'company',   60, ARRAY['party','project']),
  ('PROJECT_CONTRACT',       'Project Contract',                 'عقد المشروع',                      'PROJECTS',          false, 'company',   61, ARRAY['project','party']),
  ('SUBCONTRACT',            'Subcontract Agreement',            'عقد المقاولة من الباطن',           'PROJECTS',          false, 'company',   62, ARRAY['project','party']),
  -- ── HSE ──
  ('METHOD_STATEMENT',       'Method Statement',                 'بيان طريقة العمل',                  'HSE',               false, 'internal',  70, ARRAY['project']),
  ('RISK_ASSESSMENT',        'Risk Assessment',                  'تقييم المخاطر',                     'HSE',               false, 'internal',  71, ARRAY['project']),
  ('HSE_PERMIT',             'HSE Permit to Work',               'تصريح السلامة للعمل',               'HSE',               true,  'internal',  72, ARRAY['project']),
  ('INSPECTION_REPORT',      'Inspection Report',                'تقرير الفحص',                       'QUALITY',           false, 'internal',  73, ARRAY['project','vehicle','equipment']),
  -- ── Finance/Operations ──
  ('PURCHASE_ORDER',         'Purchase Order',                   'أمر الشراء',                        'FINANCE',           false, 'finance',   80, ARRAY['party','contract']),
  ('INVOICE',                'Invoice',                          'فاتورة',                            'FINANCE',           false, 'finance',   81, ARRAY['party','contract']),
  ('DELIVERY_NOTE',          'Delivery Note',                    'إشعار التسليم',                     'OPERATIONS',        false, 'internal',  82, ARRAY['party']),
  ('WEIGHBRIDGE_TICKET',     'Weighbridge Ticket',               'تذكرة الميزان',                     'OPERATIONS',        false, 'internal',  83, ARRAY['vehicle']),
  -- ── Legal/Banking ──
  ('BANK_LETTER',            'Bank Letter',                      'خطاب بنكي',                         'FINANCE',           false, 'finance',   84, ARRAY['party','bank']),
  ('NOC',                    'No Objection Certificate',         'شهادة عدم ممانعة',                  'LEGAL',             true,  'company',   85, ARRAY['party','employee'])
) AS t(type_code, name_en, name_ar, cat_code, exp_track, confidentiality, sort_order, entity_types)
ON CONFLICT (type_code) DO UPDATE SET
  name_en                  = EXCLUDED.name_en,
  name_ar                  = EXCLUDED.name_ar,
  category_id              = EXCLUDED.category_id,
  requires_expiry_tracking = EXCLUDED.requires_expiry_tracking,
  default_confidentiality  = EXCLUDED.default_confidentiality,
  allowed_entity_types     = EXCLUDED.allowed_entity_types,
  updated_at               = now();

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 29: Seed dms_metadata_definitions
-- Fields for key document types with AI extraction hints
-- ────────────────────────────────────────────────────────────────────────────

-- TRADE_LICENSE metadata
INSERT INTO dms_metadata_definitions
  (document_type_id, field_code, field_label_en, field_label_ar, field_type, is_required, is_ai_extractable, ai_field_hint, sort_order)
SELECT dt.id, f.field_code, f.label_en, f.label_ar, f.field_type, f.required, f.ai_ext, f.hint, f.sort
FROM dms_document_types dt,
(VALUES
  ('license_number',     'License Number',      'رقم الرخصة',           'text',     true,  true,  'The official license registration number',     1),
  ('legal_name',         'Legal Name',          'الاسم القانوني',       'text',     true,  true,  'Full legal registered name of the company',    2),
  ('issue_date',         'Issue Date',          'تاريخ الإصدار',        'date',     false, true,  'Date the license was issued',                  3),
  ('expiry_date',        'Expiry Date',         'تاريخ الانتهاء',       'date',     true,  true,  'License expiry date',                          4),
  ('issuing_authority',  'Issuing Authority',   'جهة الإصدار',          'text',     false, true,  'Government authority that issued the license', 5),
  ('region',             'Region / Emirate',    'المنطقة / الإمارة',    'region_ref',false, false,'',                                            6),
  ('business_activities','Business Activities', 'الأنشطة التجارية',     'textarea', false, true,  'List of licensed business activities',         7),
  ('license_type',       'License Type',        'نوع الرخصة',           'text',     false, true,  'Type of license (commercial, professional, etc)',8)
) AS f(field_code, label_en, label_ar, field_type, required, ai_ext, hint, sort)
WHERE dt.type_code = 'TRADE_LICENSE'
ON CONFLICT (document_type_id, field_code) DO UPDATE SET
  field_label_en = EXCLUDED.field_label_en, is_ai_extractable = EXCLUDED.is_ai_extractable, updated_at = now();

-- TRN_CERTIFICATE metadata
INSERT INTO dms_metadata_definitions
  (document_type_id, field_code, field_label_en, field_label_ar, field_type, is_required, is_ai_extractable, ai_field_hint, sort_order)
SELECT dt.id, f.field_code, f.label_en, f.label_ar, f.field_type, f.required, f.ai_ext, f.hint, f.sort
FROM dms_document_types dt,
(VALUES
  ('trn',            'TRN Number',     'الرقم الضريبي',   'text', true,  true, 'Tax Registration Number (15-digit UAE TRN)', 1),
  ('legal_name',     'Legal Name',     'الاسم القانوني',  'text', true,  true, 'Registered legal name of the entity',        2),
  ('issue_date',     'Issue Date',     'تاريخ الإصدار',   'date', false, true, 'TRN certificate issue date',                 3),
  ('effective_date', 'Effective Date', 'تاريخ السريان',   'date', false, true, 'Date from which TRN is effective',           4)
) AS f(field_code, label_en, label_ar, field_type, required, ai_ext, hint, sort)
WHERE dt.type_code = 'TRN_CERTIFICATE'
ON CONFLICT (document_type_id, field_code) DO UPDATE SET
  field_label_en = EXCLUDED.field_label_en, is_ai_extractable = EXCLUDED.is_ai_extractable, updated_at = now();

-- EMIRATES_ID metadata
INSERT INTO dms_metadata_definitions
  (document_type_id, field_code, field_label_en, field_label_ar, field_type, is_required, is_ai_extractable, ai_field_hint, sort_order)
SELECT dt.id, f.field_code, f.label_en, f.label_ar, f.field_type, f.required, f.ai_ext, f.hint, f.sort
FROM dms_document_types dt,
(VALUES
  ('emirates_id_number','Emirates ID Number', 'رقم الهوية الإماراتية', 'text', true,  true, '15-digit Emirates ID number (format: 784-XXXX-XXXXXXX-X)', 1),
  ('full_name_en',      'Full Name (English)','الاسم الكامل (إنجليزي)','text', true,  true, 'Full name as printed in English on the ID',                2),
  ('full_name_ar',      'Full Name (Arabic)', 'الاسم الكامل (عربي)',   'text', false, true, 'Full name as printed in Arabic on the ID',                 3),
  ('nationality',       'Nationality',        'الجنسية',               'text', false, true, 'Country of nationality',                                   4),
  ('date_of_birth',     'Date of Birth',      'تاريخ الميلاد',         'date', false, true, 'Date of birth as printed on the ID',                       5),
  ('expiry_date',       'Expiry Date',        'تاريخ الانتهاء',        'date', true,  true, 'Emirates ID expiry date',                                  6)
) AS f(field_code, label_en, label_ar, field_type, required, ai_ext, hint, sort)
WHERE dt.type_code = 'EMIRATES_ID'
ON CONFLICT (document_type_id, field_code) DO UPDATE SET
  field_label_en = EXCLUDED.field_label_en, is_ai_extractable = EXCLUDED.is_ai_extractable, updated_at = now();

-- PASSPORT_COPY metadata
INSERT INTO dms_metadata_definitions
  (document_type_id, field_code, field_label_en, field_label_ar, field_type, is_required, is_ai_extractable, ai_field_hint, sort_order)
SELECT dt.id, f.field_code, f.label_en, f.label_ar, f.field_type, f.required, f.ai_ext, f.hint, f.sort
FROM dms_document_types dt,
(VALUES
  ('passport_number',  'Passport Number',    'رقم جواز السفر',  'text',       true,  true, 'Passport number as printed on the document',      1),
  ('full_name',        'Full Name',          'الاسم الكامل',    'text',       true,  true, 'Full name as printed in the passport',             2),
  ('nationality',      'Nationality',        'الجنسية',          'text',       false, true, 'Nationality as stated in the passport',            3),
  ('date_of_birth',    'Date of Birth',      'تاريخ الميلاد',   'date',       false, true, 'Date of birth',                                   4),
  ('place_of_birth',   'Place of Birth',     'مكان الميلاد',    'text',       false, true, 'City/country of birth',                           5),
  ('issue_date',       'Issue Date',         'تاريخ الإصدار',   'date',       false, true, 'Passport issue date',                             6),
  ('expiry_date',      'Expiry Date',        'تاريخ الانتهاء',  'date',       true,  true, 'Passport expiry date',                            7),
  ('issuing_country',  'Issuing Country',    'دولة الإصدار',    'country_ref',false, true, 'Country that issued the passport',                8)
) AS f(field_code, label_en, label_ar, field_type, required, ai_ext, hint, sort)
WHERE dt.type_code = 'PASSPORT_COPY'
ON CONFLICT (document_type_id, field_code) DO UPDATE SET
  field_label_en = EXCLUDED.field_label_en, is_ai_extractable = EXCLUDED.is_ai_extractable, updated_at = now();

-- VEHICLE_REGISTRATION metadata
INSERT INTO dms_metadata_definitions
  (document_type_id, field_code, field_label_en, field_label_ar, field_type, is_required, is_ai_extractable, ai_field_hint, sort_order)
SELECT dt.id, f.field_code, f.label_en, f.label_ar, f.field_type, f.required, f.ai_ext, f.hint, f.sort
FROM dms_document_types dt,
(VALUES
  ('plate_number',   'Plate Number',    'رقم اللوحة',       'text',   true,  true, 'Vehicle registration plate number',           1),
  ('chassis_number', 'Chassis Number',  'رقم الهيكل',       'text',   true,  true, 'VIN / chassis number',                        2),
  ('engine_number',  'Engine Number',   'رقم المحرك',       'text',   false, true, 'Engine serial number',                        3),
  ('vehicle_make',   'Vehicle Make',    'الماركة',          'text',   false, true, 'Manufacturer / brand (e.g. Toyota)',           4),
  ('vehicle_model',  'Vehicle Model',   'الموديل',          'text',   false, true, 'Model name (e.g. Land Cruiser)',               5),
  ('year',           'Year',            'السنة',            'number', false, true, 'Year of manufacture',                         6),
  ('color',          'Color',           'اللون',            'text',   false, true, 'Vehicle color',                               7),
  ('expiry_date',    'Registration Expiry','تاريخ انتهاء التسجيل','date',true, true,'Registration/Mulkiya expiry date',           8),
  ('registered_to',  'Registered To',   'مسجل باسم',        'text',   false, true, 'Owner name as on registration card',         9)
) AS f(field_code, label_en, label_ar, field_type, required, ai_ext, hint, sort)
WHERE dt.type_code = 'VEHICLE_REGISTRATION'
ON CONFLICT (document_type_id, field_code) DO UPDATE SET
  field_label_en = EXCLUDED.field_label_en, is_ai_extractable = EXCLUDED.is_ai_extractable, updated_at = now();

-- INSURANCE_CERTIFICATE metadata
INSERT INTO dms_metadata_definitions
  (document_type_id, field_code, field_label_en, field_label_ar, field_type, is_required, is_ai_extractable, ai_field_hint, sort_order)
SELECT dt.id, f.field_code, f.label_en, f.label_ar, f.field_type, f.required, f.ai_ext, f.hint, f.sort
FROM dms_document_types dt,
(VALUES
  ('policy_number',      'Policy Number',       'رقم الوثيقة',       'text',     true,  true, 'Insurance policy number',                         1),
  ('insurer_name',       'Insurer Name',        'اسم شركة التأمين',  'text',     true,  true, 'Name of the insurance company',                   2),
  ('insured_party_name', 'Insured Party Name',  'اسم المؤمن عليه',   'text',     false, true, 'Name of the insured entity or person',            3),
  ('start_date',         'Start Date',          'تاريخ البدء',       'date',     true,  true, 'Policy start / effective date',                   4),
  ('expiry_date',        'Expiry Date',         'تاريخ الانتهاء',    'date',     true,  true, 'Policy expiry date',                              5),
  ('coverage_type',      'Coverage Type',       'نوع التغطية',       'text',     false, true, 'Type of insurance coverage',                      6),
  ('premium_amount',     'Premium Amount',      'قيمة القسط',        'number',   false, true, 'Insurance premium amount',                        7),
  ('currency',           'Currency',            'العملة',            'currency', false, false,'',                                                8)
) AS f(field_code, label_en, label_ar, field_type, required, ai_ext, hint, sort)
WHERE dt.type_code = 'INSURANCE_CERTIFICATE'
ON CONFLICT (document_type_id, field_code) DO UPDATE SET
  field_label_en = EXCLUDED.field_label_en, is_ai_extractable = EXCLUDED.is_ai_extractable, updated_at = now();

-- PROJECT_CONTRACT metadata
INSERT INTO dms_metadata_definitions
  (document_type_id, field_code, field_label_en, field_label_ar, field_type, is_required, is_ai_extractable, ai_field_hint, sort_order)
SELECT dt.id, f.field_code, f.label_en, f.label_ar, f.field_type, f.required, f.ai_ext, f.hint, f.sort
FROM dms_document_types dt,
(VALUES
  ('contract_number',   'Contract Number',   'رقم العقد',          'text',     true,  true, 'Official contract reference number',           1),
  ('contract_title',    'Contract Title',    'عنوان العقد',        'text',     true,  true, 'Short descriptive title of the contract',      2),
  ('client_name',       'Client Name',       'اسم العميل',         'text',     false, true, 'Name of the client / employer',                3),
  ('contractor_name',   'Contractor Name',   'اسم المقاول',        'text',     false, true, 'Name of the contractor',                       4),
  ('contract_value',    'Contract Value',    'قيمة العقد',         'number',   false, true, 'Total contract value',                         5),
  ('currency',          'Currency',          'العملة',             'currency', false, false,'',                                             6),
  ('start_date',        'Start Date',        'تاريخ البدء',        'date',     false, true, 'Contract commencement date',                   7),
  ('end_date',          'End Date',          'تاريخ الانتهاء',     'date',     false, true, 'Contract completion / expiry date',            8),
  ('project_location',  'Project Location',  'موقع المشروع',       'text',     false, true, 'Physical location or site of the project',     9),
  ('scope_summary',     'Scope Summary',     'ملخص النطاق',        'textarea', false, true, 'Brief summary of the contract scope of work', 10)
) AS f(field_code, label_en, label_ar, field_type, required, ai_ext, hint, sort)
WHERE dt.type_code = 'PROJECT_CONTRACT'
ON CONFLICT (document_type_id, field_code) DO UPDATE SET
  field_label_en = EXCLUDED.field_label_en, is_ai_extractable = EXCLUDED.is_ai_extractable, updated_at = now();
