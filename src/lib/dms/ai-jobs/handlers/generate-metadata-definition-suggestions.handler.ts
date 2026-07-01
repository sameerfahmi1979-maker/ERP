/**
 * DMS AI META.2 — Generate Metadata Definition Suggestions Job Handler
 *
 * Handles the generate_metadata_definition_suggestions job type.
 *
 * Governance rule: AI suggests. Human chooses. System saves only approved items.
 *
 * This handler ONLY generates AI metadata field suggestions and stores them in
 * the DMS review queue (dms_review_queue.payload_json) for later authorized
 * human review. It NEVER creates metadata definitions and NEVER writes to
 * dms_metadata_definitions — that table is written to ONLY by
 * createDmsMetadataDefinition() after a human explicitly approves selected
 * fields via the review queue or intake review UI.
 *
 * Security rules:
 *   - Called only from the WORKER_SECRET-authenticated worker route.
 *   - No user session — uses createAdminClient() throughout (via
 *     generateAndQueueMetadataSuggestions).
 *   - Never logs OCR text, prompts, raw provider responses, or field values.
 */

import type { DmsAiJobHandler, DmsAiJobHandlerResult } from "@/lib/dms/ai-jobs/job-types";
import { DMS_AI_JOB_TYPE, GenerateMetadataDefinitionSuggestionsPayloadSchema } from "@/lib/dms/ai-jobs/job-types";
import { generateAndQueueMetadataSuggestions } from "@/server/actions/dms/metadata-suggestion-queue";

export const generateMetadataDefinitionSuggestionsHandler: DmsAiJobHandler = {
  jobType: DMS_AI_JOB_TYPE.GENERATE_METADATA_DEFINITION_SUGGESTIONS,

  async handle(payload: Record<string, unknown>): Promise<DmsAiJobHandlerResult> {
    const parsed = GenerateMetadataDefinitionSuggestionsPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return {
        success: false,
        errorCode: "validation_error",
        safeMessage: `Invalid metadata suggestion payload: ${parsed.error.issues[0]?.message ?? "unknown"}`,
        retryable: false,
      };
    }

    const { documentTypeId, triggerDocumentId, source } = parsed.data;

    // This call ONLY writes to dms_review_queue and dms_document_types
    // (ai_suggestions_generated_at). It never calls createDmsMetadataDefinition
    // and never inserts into dms_metadata_definitions.
    const result = await generateAndQueueMetadataSuggestions(documentTypeId, triggerDocumentId, source);

    if (result.success) {
      return { success: true };
    }

    return {
      success: false,
      errorCode: "metadata_suggestion_generation_failed",
      safeMessage: result.error ?? "Failed to generate metadata suggestions.",
      retryable: true,
    };
  },
};
