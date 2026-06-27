-- ERP DMS AI Phase 2 Step 2 — Metadata definitions upgrade columns

ALTER TABLE public.dms_metadata_definitions
  ADD COLUMN IF NOT EXISTS field_group TEXT,
  ADD COLUMN IF NOT EXISTS field_section TEXT,
  ADD COLUMN IF NOT EXISTS show_in_review BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_in_detail BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_in_list BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_in_upload_review BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_searchable BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_filterable BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_unique BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS placeholder_en TEXT,
  ADD COLUMN IF NOT EXISTS placeholder_ar TEXT,
  ADD COLUMN IF NOT EXISTS help_text_en TEXT,
  ADD COLUMN IF NOT EXISTS help_text_ar TEXT,
  ADD COLUMN IF NOT EXISTS ai_possible_labels_en JSONB,
  ADD COLUMN IF NOT EXISTS ai_possible_labels_ar JSONB,
  ADD COLUMN IF NOT EXISTS ai_keywords JSONB,
  ADD COLUMN IF NOT EXISTS ai_negative_keywords JSONB,
  ADD COLUMN IF NOT EXISTS ai_expected_format TEXT,
  ADD COLUMN IF NOT EXISTS ai_example_values JSONB,
  ADD COLUMN IF NOT EXISTS ai_confidence_threshold NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS normalization_rule TEXT,
  ADD COLUMN IF NOT EXISTS review_required_if_missing BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_required_if_low_confidence BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS metadata_version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS ai_rules_json JSONB;

CREATE INDEX IF NOT EXISTS idx_dms_metadata_definitions_type_group_sort
  ON public.dms_metadata_definitions (document_type_id, field_group, sort_order)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.dms_metadata_definitions.ai_rules_json IS
  'Optional overflow JSON for future AI rules. Admin-defined hints only — no document content.';
