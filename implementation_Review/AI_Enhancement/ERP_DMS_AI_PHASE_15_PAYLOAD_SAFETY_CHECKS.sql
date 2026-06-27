-- ============================================================================
-- ERP DMS AI Phase 15 — Payload / Privacy Safety Checks
-- ============================================================================
-- Execute via Supabase SQL Editor or user-supabase MCP.
-- All queries are READ-ONLY. No data is mutated.
-- Uses exact JSONB key matching (? operator) to avoid false positives like
-- "prompt_version" matching "prompt".
-- Expected result for EACH section: 0 rows = PASS.
-- ============================================================================

-- ============================================================================
-- PART A: erp_ai_usage_logs.metadata_json
-- ============================================================================

-- A-01: Check forbidden keys in erp_ai_usage_logs.metadata_json
SELECT
  id,
  'erp_ai_usage_logs.metadata_json' AS location,
  ARRAY(
    SELECT unnest(ARRAY[
      CASE WHEN metadata_json ? 'prompt'            THEN 'prompt'            END,
      CASE WHEN metadata_json ? 'raw_prompt'        THEN 'raw_prompt'        END,
      CASE WHEN metadata_json ? 'system_prompt'     THEN 'system_prompt'     END,
      CASE WHEN metadata_json ? 'user_prompt'       THEN 'user_prompt'       END,
      CASE WHEN metadata_json ? 'raw_response'      THEN 'raw_response'      END,
      CASE WHEN metadata_json ? 'response_text'     THEN 'response_text'     END,
      CASE WHEN metadata_json ? 'ocr_text'          THEN 'ocr_text'          END,
      CASE WHEN metadata_json ? 'content_text'      THEN 'content_text'      END,
      CASE WHEN metadata_json ? 'chunk_text'        THEN 'chunk_text'        END,
      CASE WHEN metadata_json ? 'full_text'         THEN 'full_text'         END,
      CASE WHEN metadata_json ? 'api_key'           THEN 'api_key'           END,
      CASE WHEN metadata_json ? 'secret'            THEN 'secret'            END,
      CASE WHEN metadata_json ? 'password'          THEN 'password'          END,
      CASE WHEN metadata_json ? 'token'             THEN 'token'             END,
      CASE WHEN metadata_json ? 'bearer'            THEN 'bearer'            END,
      CASE WHEN metadata_json ? 'embedding'         THEN 'embedding'         END,
      CASE WHEN metadata_json ? 'vector'            THEN 'vector'            END,
      CASE WHEN metadata_json ? 'embeddings'        THEN 'embeddings'        END,
      CASE WHEN metadata_json ? 'provider_response' THEN 'provider_response' END
    ])
    WHERE unnest IS NOT NULL
  ) AS forbidden_keys_found
FROM public.erp_ai_usage_logs
WHERE metadata_json IS NOT NULL
  AND (
    metadata_json ? 'prompt'
    OR metadata_json ? 'raw_prompt'
    OR metadata_json ? 'system_prompt'
    OR metadata_json ? 'user_prompt'
    OR metadata_json ? 'raw_response'
    OR metadata_json ? 'response_text'
    OR metadata_json ? 'ocr_text'
    OR metadata_json ? 'content_text'
    OR metadata_json ? 'chunk_text'
    OR metadata_json ? 'full_text'
    OR metadata_json ? 'api_key'
    OR metadata_json ? 'secret'
    OR metadata_json ? 'password'
    OR metadata_json ? 'token'
    OR metadata_json ? 'bearer'
    OR metadata_json ? 'embedding'
    OR metadata_json ? 'vector'
    OR metadata_json ? 'embeddings'
    OR metadata_json ? 'provider_response'
  );

-- ============================================================================
-- PART B: dms_ai_job_queue.payload_json
-- ============================================================================

-- B-01: Check forbidden keys in dms_ai_job_queue.payload_json
SELECT
  id,
  job_type,
  'dms_ai_job_queue.payload_json' AS location,
  ARRAY(
    SELECT unnest(ARRAY[
      CASE WHEN payload_json ? 'prompt'            THEN 'prompt'            END,
      CASE WHEN payload_json ? 'raw_prompt'        THEN 'raw_prompt'        END,
      CASE WHEN payload_json ? 'system_prompt'     THEN 'system_prompt'     END,
      CASE WHEN payload_json ? 'ocr_text'          THEN 'ocr_text'          END,
      CASE WHEN payload_json ? 'content_text'      THEN 'content_text'      END,
      CASE WHEN payload_json ? 'chunk_text'        THEN 'chunk_text'        END,
      CASE WHEN payload_json ? 'full_text'         THEN 'full_text'         END,
      CASE WHEN payload_json ? 'api_key'           THEN 'api_key'           END,
      CASE WHEN payload_json ? 'secret'            THEN 'secret'            END,
      CASE WHEN payload_json ? 'password'          THEN 'password'          END,
      CASE WHEN payload_json ? 'raw_response'      THEN 'raw_response'      END,
      CASE WHEN payload_json ? 'embedding'         THEN 'embedding'         END,
      CASE WHEN payload_json ? 'vector'            THEN 'vector'            END,
      CASE WHEN payload_json ? 'provider_response' THEN 'provider_response' END
    ])
    WHERE unnest IS NOT NULL
  ) AS forbidden_keys_found
FROM public.dms_ai_job_queue
WHERE payload_json IS NOT NULL
  AND (
    payload_json ? 'prompt'
    OR payload_json ? 'raw_prompt'
    OR payload_json ? 'system_prompt'
    OR payload_json ? 'ocr_text'
    OR payload_json ? 'content_text'
    OR payload_json ? 'chunk_text'
    OR payload_json ? 'full_text'
    OR payload_json ? 'api_key'
    OR payload_json ? 'secret'
    OR payload_json ? 'password'
    OR payload_json ? 'raw_response'
    OR payload_json ? 'embedding'
    OR payload_json ? 'vector'
    OR payload_json ? 'provider_response'
  );

-- B-02: Check forbidden keys in dms_ai_job_queue.safe_error_json
SELECT
  id,
  job_type,
  'dms_ai_job_queue.safe_error_json' AS location,
  safe_error_json
FROM public.dms_ai_job_queue
WHERE safe_error_json IS NOT NULL
  AND (
    safe_error_json ? 'api_key'
    OR safe_error_json ? 'secret'
    OR safe_error_json ? 'password'
    OR safe_error_json ? 'prompt'
    OR safe_error_json ? 'raw_response'
  );

-- ============================================================================
-- PART C: dms_review_queue.payload_json
-- ============================================================================

-- C-01: Check forbidden keys in dms_review_queue.payload_json
SELECT
  id,
  review_type,
  'dms_review_queue.payload_json' AS location,
  ARRAY(
    SELECT unnest(ARRAY[
      CASE WHEN payload_json ? 'prompt'            THEN 'prompt'            END,
      CASE WHEN payload_json ? 'raw_prompt'        THEN 'raw_prompt'        END,
      CASE WHEN payload_json ? 'system_prompt'     THEN 'system_prompt'     END,
      CASE WHEN payload_json ? 'ocr_text'          THEN 'ocr_text'          END,
      CASE WHEN payload_json ? 'content_text'      THEN 'content_text'      END,
      CASE WHEN payload_json ? 'chunk_text'        THEN 'chunk_text'        END,
      CASE WHEN payload_json ? 'full_text'         THEN 'full_text'         END,
      CASE WHEN payload_json ? 'api_key'           THEN 'api_key'           END,
      CASE WHEN payload_json ? 'secret'            THEN 'secret'            END,
      CASE WHEN payload_json ? 'password'          THEN 'password'          END,
      CASE WHEN payload_json ? 'raw_response'      THEN 'raw_response'      END,
      CASE WHEN payload_json ? 'embedding'         THEN 'embedding'         END,
      CASE WHEN payload_json ? 'provider_response' THEN 'provider_response' END
    ])
    WHERE unnest IS NOT NULL
  ) AS forbidden_keys_found
FROM public.dms_review_queue
WHERE payload_json IS NOT NULL
  AND (
    payload_json ? 'prompt'
    OR payload_json ? 'raw_prompt'
    OR payload_json ? 'system_prompt'
    OR payload_json ? 'ocr_text'
    OR payload_json ? 'content_text'
    OR payload_json ? 'chunk_text'
    OR payload_json ? 'full_text'
    OR payload_json ? 'api_key'
    OR payload_json ? 'secret'
    OR payload_json ? 'password'
    OR payload_json ? 'raw_response'
    OR payload_json ? 'embedding'
    OR payload_json ? 'provider_response'
  );

-- ============================================================================
-- PART D: dms_ai_validation_findings.evidence_json
-- ============================================================================

-- D-01: Check forbidden keys in evidence_json
SELECT
  id,
  rule_code,
  'dms_ai_validation_findings.evidence_json' AS location,
  ARRAY(
    SELECT unnest(ARRAY[
      CASE WHEN evidence_json ? 'prompt'            THEN 'prompt'            END,
      CASE WHEN evidence_json ? 'raw_response'      THEN 'raw_response'      END,
      CASE WHEN evidence_json ? 'ocr_text'          THEN 'ocr_text'          END,
      CASE WHEN evidence_json ? 'content_text'      THEN 'content_text'      END,
      CASE WHEN evidence_json ? 'api_key'           THEN 'api_key'           END,
      CASE WHEN evidence_json ? 'secret'            THEN 'secret'            END,
      CASE WHEN evidence_json ? 'embedding'         THEN 'embedding'         END
    ])
    WHERE unnest IS NOT NULL
  ) AS forbidden_keys_found
FROM public.dms_ai_validation_findings
WHERE evidence_json IS NOT NULL
  AND (
    evidence_json ? 'prompt'
    OR evidence_json ? 'raw_response'
    OR evidence_json ? 'ocr_text'
    OR evidence_json ? 'content_text'
    OR evidence_json ? 'api_key'
    OR evidence_json ? 'secret'
    OR evidence_json ? 'embedding'
  );

-- ============================================================================
-- PART E: Text column safety heuristics
-- ============================================================================

-- E-01: Check dms_ai_entity_match_candidates for suspiciously long text
-- Raw text leakage would produce very long strings (>1000 chars).
-- Expected: 0 rows = PASS (no raw content leakage)
SELECT
  id,
  'dms_ai_entity_match_candidates.source_text_summary' AS location,
  LENGTH(source_text_summary) AS len
FROM public.dms_ai_entity_match_candidates
WHERE source_text_summary IS NOT NULL
  AND LENGTH(source_text_summary) > 1000;

-- E-02: Check match_reason for raw text
SELECT
  id,
  'dms_ai_entity_match_candidates.match_reason' AS location,
  LENGTH(match_reason) AS len
FROM public.dms_ai_entity_match_candidates
WHERE match_reason IS NOT NULL
  AND LENGTH(match_reason) > 1000;

-- E-03: Check dms_ai_job_attempts.safe_error_message for sensitive patterns
-- Note: Using LIKE here because there is no JSON column.
-- False-positive risk is low since safe_error_message is already short.
SELECT
  id,
  job_id,
  'dms_ai_job_attempts.safe_error_message' AS location,
  safe_error_message
FROM public.dms_ai_job_attempts
WHERE safe_error_message IS NOT NULL
  AND (
    safe_error_message ILIKE '%api_key%'
    OR safe_error_message ILIKE '%sk-[A-Za-z0-9]%'
    OR safe_error_message ILIKE '%Bearer %'
    OR safe_error_message ILIKE '%password=%'
  );

-- ============================================================================
-- PART F: Summary count of all payload_json checks
-- ============================================================================
SELECT
  'erp_ai_usage_logs.metadata_json'          AS table_column,
  COUNT(*)                                    AS rows_with_forbidden_keys
FROM public.erp_ai_usage_logs
WHERE metadata_json IS NOT NULL
  AND (
    metadata_json ? 'prompt' OR metadata_json ? 'raw_prompt' OR
    metadata_json ? 'system_prompt' OR metadata_json ? 'user_prompt' OR
    metadata_json ? 'raw_response' OR metadata_json ? 'response_text' OR
    metadata_json ? 'ocr_text' OR metadata_json ? 'content_text' OR
    metadata_json ? 'chunk_text' OR metadata_json ? 'full_text' OR
    metadata_json ? 'api_key' OR metadata_json ? 'secret' OR
    metadata_json ? 'password' OR metadata_json ? 'token' OR
    metadata_json ? 'bearer' OR metadata_json ? 'embedding' OR
    metadata_json ? 'vector' OR metadata_json ? 'embeddings' OR
    metadata_json ? 'provider_response'
  )

UNION ALL

SELECT
  'dms_ai_job_queue.payload_json',
  COUNT(*)
FROM public.dms_ai_job_queue
WHERE payload_json IS NOT NULL
  AND (
    payload_json ? 'prompt' OR payload_json ? 'ocr_text' OR
    payload_json ? 'content_text' OR payload_json ? 'api_key' OR
    payload_json ? 'secret' OR payload_json ? 'raw_response' OR
    payload_json ? 'embedding'
  )

UNION ALL

SELECT
  'dms_review_queue.payload_json',
  COUNT(*)
FROM public.dms_review_queue
WHERE payload_json IS NOT NULL
  AND (
    payload_json ? 'prompt' OR payload_json ? 'ocr_text' OR
    payload_json ? 'content_text' OR payload_json ? 'api_key' OR
    payload_json ? 'secret' OR payload_json ? 'raw_response'
  )

UNION ALL

SELECT
  'dms_ai_validation_findings.evidence_json',
  COUNT(*)
FROM public.dms_ai_validation_findings
WHERE evidence_json IS NOT NULL
  AND (
    evidence_json ? 'prompt' OR evidence_json ? 'raw_response' OR
    evidence_json ? 'ocr_text' OR evidence_json ? 'api_key' OR
    evidence_json ? 'embedding'
  );
