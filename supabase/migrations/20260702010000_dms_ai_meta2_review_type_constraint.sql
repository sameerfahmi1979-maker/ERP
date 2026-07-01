-- ERP DMS AI META.2 — First Upload AI Metadata Suggestions with Authorized Approval
--
-- Adds the 'metadata_definition_suggestions_review' value to the
-- dms_review_queue.review_type CHECK constraint. This value is written by
-- Flow B (generateAndQueueMetadataSuggestions, background job) and read by
-- Flow A / the review queue drawer for human approval of AI-suggested
-- metadata fields. Without this migration, inserts using this review_type
-- fail the existing CHECK constraint added in Phase 13.
--
-- Must DROP and RECREATE since PostgreSQL does not support adding values to
-- an existing CHECK constraint in place.

ALTER TABLE public.dms_review_queue DROP CONSTRAINT IF EXISTS dms_review_queue_review_type_check;
ALTER TABLE public.dms_review_queue ADD CONSTRAINT dms_review_queue_review_type_check
  CHECK (review_type IN (
    -- Phase 12 (existing)
    'intake_classification_review',
    'intake_metadata_review',
    'ai_analysis_metadata_review',
    'ocr_failure_review',
    'semantic_index_review',
    'ai_job_failure_review',
    -- Phase 13 (existing)
    'validation_conflict_review',
    'metadata_rule_violation_review',
    'owner_matching_review',
    'party_matching_review',
    'employee_matching_review',
    'duplicate_document_review',
    'document_consistency_review',
    -- DMS AI META.2 (new)
    'metadata_definition_suggestions_review'
  ));
