-- ERP DMS AI META.2 — First Upload AI Metadata Suggestions with Authorized Approval
--
-- Governance rule: AI suggests. Human chooses. System saves only approved items.
--
-- This migration adds ONLY approval-workflow tracking columns, a new approval
-- permission, and a new feature flag. No auto-create columns, flags, or job
-- types are introduced. Metadata definitions continue to be created exclusively
-- through createDmsMetadataDefinition() after explicit human review.

-- =============================================================================
-- 1.1 — dms_metadata_definitions tracking columns
-- =============================================================================

ALTER TABLE public.dms_metadata_definitions
  ADD COLUMN IF NOT EXISTS created_from_ai_suggestion BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.dms_metadata_definitions
  ADD COLUMN IF NOT EXISTS ai_suggestion_trigger_document_id BIGINT
    REFERENCES public.dms_documents(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.dms_metadata_definitions.created_from_ai_suggestion IS
  'True when this definition was created by an authorized user approving an AI-suggested field. These definitions are AI-assisted but human-approved. Never set by background jobs directly.';

COMMENT ON COLUMN public.dms_metadata_definitions.ai_suggestion_trigger_document_id IS
  'The document ID that triggered the AI suggestion workflow which led to this definition being created. NULL for manually created definitions or definitions created without a trigger document.';

-- =============================================================================
-- 1.2 — dms_document_types suggestion lifecycle columns
-- =============================================================================

ALTER TABLE public.dms_document_types
  ADD COLUMN IF NOT EXISTS ai_suggestions_generated_at TIMESTAMPTZ NULL;

ALTER TABLE public.dms_document_types
  ADD COLUMN IF NOT EXISTS ai_suggestions_approved_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.dms_document_types.ai_suggestions_generated_at IS
  'Timestamp when AI metadata suggestions were last generated for this document type. Used as an idempotency indicator for the background suggestion queue. NULL means no suggestions have been generated.';

COMMENT ON COLUMN public.dms_document_types.ai_suggestions_approved_at IS
  'Timestamp when an authorized user last approved AI-suggested definitions for this type. NULL means no suggestions have been approved via the AI suggestion workflow. Manual definition creation does not update this column.';

-- =============================================================================
-- 1.3 — Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_dms_metadata_definitions_ai_suggestion
  ON public.dms_metadata_definitions(created_from_ai_suggestion)
  WHERE created_from_ai_suggestion = true AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_dms_metadata_definitions_ai_trigger_doc
  ON public.dms_metadata_definitions(ai_suggestion_trigger_document_id)
  WHERE ai_suggestion_trigger_document_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dms_document_types_ai_suggestions_gen
  ON public.dms_document_types(ai_suggestions_generated_at)
  WHERE ai_suggestions_generated_at IS NOT NULL AND deleted_at IS NULL;

-- =============================================================================
-- 1.4 — Feature flag (default OFF, human review required)
-- =============================================================================

INSERT INTO public.erp_ai_feature_flags
  (feature_code, feature_name, description, is_enabled, requires_human_review, min_confidence_threshold)
VALUES (
  'DMS_AI_FIRST_UPLOAD_METADATA_SUGGESTIONS',
  'DMS AI First Upload Metadata Suggestions',
  'When enabled, the system suggests metadata fields for document types with no definitions during first upload or approval. Suggestions require authorized human approval. No definitions are created automatically.',
  false,
  true,
  0.70
)
ON CONFLICT (feature_code) DO NOTHING;

-- =============================================================================
-- 1.5 — New approval permission
-- =============================================================================

INSERT INTO public.permissions (permission_code, permission_name, description, module_code, action_code, is_active)
VALUES (
  'dms.metadata.ai_suggestions.approve',
  'Approve AI Metadata Suggestions',
  'Allows the user to review AI-suggested metadata fields and create selected metadata definitions for DMS document types.',
  'DMS',
  'approve',
  true
)
ON CONFLICT (permission_code) DO NOTHING;

-- =============================================================================
-- 1.6 — Assign new permission to existing DMS/admin roles
--
-- Verified live role codes (see implementation report): dms_manager, system_admin,
-- group_admin. No dms_admin role code exists in this environment — skipped.
-- role_permissions uses (role_id, permission_id) FKs, not codes — joined via
-- roles.role_code and permissions.permission_code as done in prior AI migrations
-- (e.g. 20260617170000_erp_common_ai_7_assistant.sql).
-- =============================================================================

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.role_code IN ('dms_manager', 'system_admin', 'group_admin')
  AND p.permission_code = 'dms.metadata.ai_suggestions.approve'
ON CONFLICT DO NOTHING;
