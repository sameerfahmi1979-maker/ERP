/**
 * DMS AI META.2 — AI Re-Extraction Job Handler
 *
 * Handles the ai_re_extraction job type.
 *
 * Runs AFTER an authorized user has approved AI-suggested metadata definitions
 * and they have been created via createDmsMetadataDefinition(). Re-extraction
 * is extraction-only: it does NOT reclassify the document, and it NEVER
 * overwrites existing metadata values — only definitions with no existing
 * value row for the document are considered, so human-approved values (or any
 * previously saved value) are always preserved.
 *
 * There is no existing document-level (post-approval) extraction job/handler
 * to reuse — `rerunMetadataExtractionForIntakeSession` in
 * src/server/actions/dms/ai-intake.ts only works for in-progress intake
 * sessions (requires dms_ai_extraction_results.raw_ocr_text and a non-approved
 * intake_status), not for already-approved documents. This handler is a new,
 * minimal, extraction-only flow built for approved documents; it reuses the
 * existing metadata-value column mapping helper
 * (resolveMetadataPayloadColumns / buildMetadataValuePayloads) instead of
 * duplicating that logic.
 *
 * Security rules:
 *   - Called only from the WORKER_SECRET-authenticated worker route.
 *   - No user session — uses createAdminClient() throughout.
 *   - Never logs OCR text, prompts, raw provider responses, or field values.
 *   - Never inserts into dms_metadata_definitions.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { callCommonAiStructuredCompletion } from "@/lib/ai/common/provider-bridge";
import { buildMetadataValuePayloads } from "@/lib/dms/approve/approve-ai-intake-payload";
import type { DmsAiJobHandler, DmsAiJobHandlerResult } from "@/lib/dms/ai-jobs/job-types";
import { DMS_AI_JOB_TYPE, AiReExtractionPayloadSchema } from "@/lib/dms/ai-jobs/job-types";

const CONTENT_INPUT_MAX_CHARS = 20_000;

export const aiReExtractionHandler: DmsAiJobHandler = {
  jobType: DMS_AI_JOB_TYPE.AI_RE_EXTRACTION,

  async handle(payload: Record<string, unknown>): Promise<DmsAiJobHandlerResult> {
    const parsed = AiReExtractionPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return {
        success: false,
        errorCode: "validation_error",
        safeMessage: `Invalid re-extraction payload: ${parsed.error.issues[0]?.message ?? "unknown"}`,
        retryable: false,
      };
    }

    const { documentId } = parsed.data;

    try {
      const db = createAdminClient();

      const { data: doc } = await db
        .from("dms_documents")
        .select("id, document_type_id, deleted_at")
        .eq("id", documentId)
        .maybeSingle();

      const docRow = doc as { id: number; document_type_id: number | null; deleted_at: string | null } | null;
      if (!docRow || docRow.deleted_at || !docRow.document_type_id) {
        return { success: true }; // nothing to extract — treat as a safe no-op, not a failure
      }

      // Fields eligible for extraction: active, AI-extractable definitions
      // for this document's type.
      const { data: defsRaw } = await db
        .from("dms_metadata_definitions")
        .select("id, field_code, field_label_en, field_type, ai_field_hint")
        .eq("document_type_id", docRow.document_type_id)
        .eq("is_active", true)
        .eq("is_ai_extractable", true)
        .is("deleted_at", null);

      const defs = (defsRaw ?? []) as Array<{
        id: number;
        field_code: string;
        field_label_en: string;
        field_type: string;
        ai_field_hint: string | null;
      }>;

      if (defs.length === 0) {
        return { success: true }; // no AI-extractable fields defined — safe no-op
      }

      // Never overwrite existing values — only extract fields with NO existing row.
      const { data: existingValuesRaw } = await db
        .from("dms_document_metadata_values")
        .select("definition_id")
        .eq("document_id", documentId)
        .is("deleted_at", null);

      const existingDefIds = new Set(
        ((existingValuesRaw ?? []) as Array<{ definition_id: number }>).map((v) => v.definition_id)
      );

      const missingDefs = defs.filter((d) => !existingDefIds.has(d.id));
      if (missingDefs.length === 0) {
        return { success: true }; // all fields already have values — nothing to fill
      }

      const { data: contentRow } = await db
        .from("dms_document_content")
        .select("content_text")
        .eq("document_id", documentId)
        .maybeSingle();

      const contentText = (contentRow as { content_text?: string | null } | null)?.content_text ?? null;
      if (!contentText?.trim()) {
        return { success: true }; // no source text available — safe no-op, retry not useful
      }

      const fieldList = missingDefs
        .map((d) => `- ${d.field_code} (${d.field_type}): ${d.field_label_en}${d.ai_field_hint ? ` [hint: ${d.ai_field_hint.slice(0, 120)}]` : ""}`)
        .join("\n");

      const systemPrompt =
        "You are a document data extraction assistant for an enterprise ERP system. " +
        "Extract ONLY the requested field values from the provided document text. " +
        'Return ONLY a valid JSON object mapping field_code to its extracted value as a string, e.g. {"field_code":"value"}. ' +
        "If a value cannot be found, omit that field_code or set it to null. Do not invent values. No explanation, no markdown.";

      const cappedText =
        contentText.length > CONTENT_INPUT_MAX_CHARS ? contentText.slice(0, CONTENT_INPUT_MAX_CHARS) : contentText;

      const userPrompt = `Fields to extract:\n${fieldList}\n\nDocument text:\n---\n${cappedText}\n---`;

      let rawJson = "";
      try {
        const result = await callCommonAiStructuredCompletion(systemPrompt, userPrompt, {
          maxTokens: 800,
          temperature: 0,
        });
        if (!result.success) {
          return { success: true }; // AI call failed or not configured — non-fatal, no values to overwrite
        }
        rawJson = result.rawJson;
      } catch {
        return { success: true };
      }

      let extracted: Record<string, unknown> = {};
      try {
        const jsonParsed = JSON.parse(rawJson);
        if (jsonParsed && typeof jsonParsed === "object" && !Array.isArray(jsonParsed)) {
          extracted = jsonParsed as Record<string, unknown>;
        }
      } catch {
        return { success: true }; // unparsable AI response — non-fatal
      }

      const byFieldCode = new Map(missingDefs.map((d) => [d.field_code, d]));
      const valueInputs = Object.entries(extracted)
        .filter(([code, value]) => byFieldCode.has(code) && value !== null && value !== undefined && String(value).trim() !== "")
        .map(([code, value]) => ({
          definitionId: byFieldCode.get(code)!.id,
          fieldType: byFieldCode.get(code)!.field_type,
          rawValue: String(value),
        }));

      const valuePayloads = buildMetadataValuePayloads(valueInputs);
      if (valuePayloads.length === 0) {
        return { success: true }; // AI found nothing new — safe no-op
      }

      const nowIso = new Date().toISOString();
      const { error: insertError } = await db.from("dms_document_metadata_values").insert(
        valuePayloads.map((v) => ({
          document_id: documentId,
          ...v,
          created_at: nowIso,
          updated_at: nowIso,
        }))
      );

      if (insertError) {
        // Unique violation means a value row was created concurrently (e.g. user
        // saved manually) between our existence check and this insert — safe to
        // treat as a no-op rather than a failure, since we never overwrite.
        if ((insertError as { code?: string }).code === "23505") {
          return { success: true };
        }
        return {
          success: false,
          errorCode: "database_error",
          safeMessage: "Failed to save re-extracted metadata values.",
          retryable: true,
        };
      }

      logger.info("[ai-re-extraction] values filled", {
        documentId,
        fieldsFilled: valuePayloads.length,
      });

      return { success: true };
    } catch (err) {
      logger.error("[ai-re-extraction] unexpected error", { documentId, error: String(err).slice(0, 200) });
      return {
        success: false,
        errorCode: "unexpected",
        safeMessage: "Unexpected error during AI re-extraction.",
        retryable: true,
      };
    }
  },
};
