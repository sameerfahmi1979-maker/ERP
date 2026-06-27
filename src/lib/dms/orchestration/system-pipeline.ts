/**
 * ERP DMS AI Phase 9 — System-Level Orchestration Pipeline
 *
 * Worker-safe orchestration pipeline using createAdminClient() exclusively.
 * Called from the async job queue worker handler, where no user session
 * or cookies exist.
 *
 * This is the system-level counterpart of
 * `src/server/actions/dms/orchestration.ts` (which requires user auth).
 *
 * Security rules:
 *   - Uses admin client (service role) for ALL DB operations.
 *   - Called ONLY from the authenticated worker route (WORKER_SECRET verified).
 *   - No user permission checks — authorization delegated to the worker.
 *   - Never logs OCR text, AI prompts, raw AI responses, or document content.
 *   - Uses 0 as the system user ID for audit fields (no real user session).
 *   - Does NOT auto-approve, auto-save metadata, or write to ERP tables.
 *   - Human-review-first behavior preserved — fires AFTER human approval.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import {
  buildInitialSteps,
  runPipelineStepSafe,
  mergeStepResult,
  buildRunResult,
} from "./pipeline-runner";
import { getDmsAiProvider, getDmsEmbeddingProvider } from "@/lib/dms/ai/factory";
import { enqueueUniqueDmsAiJob } from "@/lib/dms/ai-jobs/job-runner";
import { DMS_AI_JOB_TYPE } from "@/lib/dms/ai-jobs/job-types";
import type {
  DmsAiOrchestrationStepCode,
  DmsAiOrchestrationStepResult,
  DmsAiOrchestrationRunResult,
} from "./types";

// ── Constants ─────────────────────────────────────────────────────────────────

const SUMMARY_INPUT_MAX_CHARS = 20_000;
const CONTENT_TEXT_MAX_CHARS  = 100_000;

// ── Feature flag helper (admin client) ───────────────────────────────────────

async function isFeatureEnabled(featureCode: string): Promise<boolean> {
  try {
    const db = createAdminClient();
    const { data } = await db
      .from("erp_ai_feature_flags")
      .select("is_enabled")
      .eq("feature_code", featureCode)
      .single();
    return (data as { is_enabled?: boolean } | null)?.is_enabled === true;
  } catch {
    return false;
  }
}

// ── Phase 11: Semantic index enqueue helper ────────────────────────────────────

/**
 * Optionally enqueues a semantic_document_index job after content sync.
 * Non-blocking: errors are swallowed — never fail the orchestration pipeline.
 * Only fires if DMS_SEMANTIC_INDEX_QUEUE and DMS_AI_JOB_QUEUE are both enabled.
 */
async function tryEnqueueSemanticIndexJob(documentId: number): Promise<void> {
  try {
    const [semanticQueueEnabled, jobQueueEnabled] = await Promise.all([
      isFeatureEnabled("DMS_SEMANTIC_INDEX_QUEUE"),
      isFeatureEnabled("DMS_AI_JOB_QUEUE"),
    ]);

    if (!semanticQueueEnabled || !jobQueueEnabled) return;

    await enqueueUniqueDmsAiJob({
      jobType:           DMS_AI_JOB_TYPE.SEMANTIC_DOCUMENT_INDEX,
      payload:           { documentId, source: "post_approve_orchestration", forceRebuild: false },
      idempotencyKey:    `semantic_document_index:doc:${documentId}`,
      priority:          3,
      relatedDocumentId: documentId,
    });

    logger.info("[system-pipeline] semantic_document_index job enqueued", { documentId });
  } catch (err) {
    // Semantic indexing is optional; never fail the main orchestration
    const safeMsg = err instanceof Error ? err.message.slice(0, 100) : String(err).slice(0, 100);
    logger.warn("[system-pipeline] semantic_document_index enqueue failed (non-fatal)", {
      documentId,
      error: safeMsg,
    });
  }
}

// ── Session status helper (admin client) ─────────────────────────────────────

async function updateSessionStatus(
  sessionCode: string,
  update: {
    orchestration_status: string;
    orchestration_steps_json?: DmsAiOrchestrationStepResult[];
    orchestration_started_at?: string;
    orchestration_completed_at?: string;
  }
): Promise<void> {
  try {
    const db = createAdminClient();
    await db
      .from("dms_upload_sessions")
      .update({ ...update, updated_at: new Date().toISOString() })
      .eq("session_code", sessionCode)
      .is("deleted_at", null);
  } catch {
    // Non-fatal — best-effort status tracking
  }
}

// ── Step: content_sync ────────────────────────────────────────────────────────

async function runContentSyncStepSystem(
  documentId: number,
  uploadSessionId?: number | null
): Promise<{ success: boolean; error?: string; skipped?: boolean }> {
  try {
    if (!(await isFeatureEnabled("DMS_CONTENT_SYNC"))) {
      return { success: true, skipped: true, error: "DMS_CONTENT_SYNC disabled." };
    }

    const db = createAdminClient();

    // Skip if already synced
    const { data: existing } = await db
      .from("dms_document_content")
      .select("id")
      .eq("document_id", documentId)
      .maybeSingle();
    if (existing) return { success: true, skipped: true, error: "Content already synced." };

    let ocrText: string | null = null;

    // Try current version file OCR text
    const { data: docRow } = await db
      .from("dms_documents")
      .select("current_version_id")
      .eq("id", documentId)
      .maybeSingle();

    const versionId = (docRow as { current_version_id?: number | null } | null)?.current_version_id ?? null;
    if (versionId) {
      const { data: fileData } = await db
        .from("dms_document_files")
        .select("ocr_text")
        .eq("version_id", versionId)
        .eq("file_role", "original")
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();
      ocrText = (fileData as { ocr_text?: string | null } | null)?.ocr_text ?? null;
    }

    // Fallback: AI intake result OCR text
    if (!ocrText?.trim() && uploadSessionId) {
      const { data: sessRow } = await db
        .from("dms_upload_sessions")
        .select("ai_result_id")
        .eq("id", uploadSessionId)
        .maybeSingle();
      const aiResultId = (sessRow as { ai_result_id?: number | null } | null)?.ai_result_id ?? null;
      if (aiResultId) {
        const { data: aiRow } = await db
          .from("dms_ai_extraction_results")
          .select("raw_ocr_text")
          .eq("id", aiResultId)
          .maybeSingle();
        ocrText = (aiRow as { raw_ocr_text?: string | null } | null)?.raw_ocr_text ?? null;
      }
    }

    if (!ocrText?.trim()) {
      return { success: true, skipped: true, error: "No OCR text available for content sync." };
    }

    const isTruncated = ocrText.length > CONTENT_TEXT_MAX_CHARS;
    const cappedText  = isTruncated ? ocrText.slice(0, CONTENT_TEXT_MAX_CHARS) : ocrText;
    const now         = new Date().toISOString();

    const { error: upsertErr } = await db
      .from("dms_document_content")
      .upsert(
        {
          document_id:             documentId,
          content_text:            cappedText,
          content_text_updated_at: now,
          content_text_source:     isTruncated ? "truncated" : "ocr",
          content_text_char_count: cappedText.length,
          is_truncated:            isTruncated,
          updated_at:              now,
        },
        { onConflict: "document_id" }
      );

    if (upsertErr) {
      return { success: false, error: `Content sync DB error: ${upsertErr.message.slice(0, 100)}` };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

// ── Step: ai_summary ──────────────────────────────────────────────────────────

async function runAiSummaryStepSystem(
  documentId: number
): Promise<{ success: boolean; error?: string; skipped?: boolean }> {
  try {
    if (!(await isFeatureEnabled("DMS_AI_SUMMARY"))) {
      return { success: true, skipped: true, error: "DMS_AI_SUMMARY disabled." };
    }

    const db = createAdminClient();

    const { data: doc } = await db
      .from("dms_documents")
      .select(`
        id, document_no, title, issue_date, expiry_date, ai_summary_status,
        document_type:dms_document_types(name_en),
        category:dms_document_categories(name_en)
      `)
      .eq("id", documentId)
      .is("deleted_at", null)
      .maybeSingle();

    if (!doc) return { success: false, error: "Document not found." };

    const d = doc as Record<string, unknown>;
    if ((d.ai_summary_status as string | null) === "complete") {
      return { success: true, skipped: true, error: "Summary already exists." };
    }

    // Load content text
    const { data: contentRow } = await db
      .from("dms_document_content")
      .select("content_text")
      .eq("document_id", documentId)
      .maybeSingle();

    const contentText = (contentRow as { content_text?: string | null } | null)?.content_text ?? null;
    if (!contentText?.trim()) {
      await db.from("dms_documents").update({ ai_summary_status: "skipped", updated_at: new Date().toISOString() }).eq("id", documentId);
      return { success: true, skipped: true, error: "No content text for summary." };
    }

    const { provider } = await getDmsAiProvider();
    if (!provider.isConfigured()) {
      return { success: true, skipped: true, error: "AI provider not configured." };
    }

    const inputText = contentText.length > SUMMARY_INPUT_MAX_CHARS
      ? contentText.slice(0, SUMMARY_INPUT_MAX_CHARS)
      : contentText;

    const docType  = (d.document_type as { name_en?: string } | null)?.name_en ?? null;
    const category = (d.category as { name_en?: string } | null)?.name_en ?? null;

    const systemPrompt =
      "You are a professional document analyst for an ERP system. " +
      "Write a concise, factual 2–4 sentence summary of the document. " +
      "Include: document type, issuing entity if visible, key subject, validity/expiry, and key outcome. " +
      "Plain text only. No markdown. No bullet points. Do not invent details.";

    const userMsg = [
      `Document No: ${String(d.document_no ?? "")}`,
      `Title: ${String(d.title ?? "")}`,
      docType   ? `Document Type: ${docType}` : null,
      category  ? `Category: ${category}` : null,
      d.issue_date  ? `Issue Date: ${String(d.issue_date)}` : null,
      d.expiry_date ? `Expiry Date: ${String(d.expiry_date)}` : null,
      "",
      "Extracted Text:",
      inputText,
    ].filter((l): l is string => l !== null).join("\n");

    const startMs = Date.now();
    let summaryText: string | null = null;
    let modelName: string | null = null;
    let summaryError: string | null = null;

    try {
      const summaryResult = await provider.summarize(systemPrompt, userMsg);
      if (!summaryResult.summary?.trim()) throw new Error("Empty summary returned.");
      summaryText = summaryResult.summary.trim();
      modelName   = summaryResult.model ?? provider.providerCode;
    } catch (aiErr) {
      summaryError = String(aiErr).slice(0, 200);
    }

    const durationMs = Date.now() - startMs;
    const now        = new Date().toISOString();

    if (summaryText) {
      await db.from("dms_documents").update({
        ai_summary:                 summaryText,
        ai_summary_status:          "complete",
        ai_summary_updated_at:      now,
        ai_summary_model:           modelName,
        ai_summary_error:           null,
        ai_summary_input_char_count: inputText.length,
        ai_summary_input_truncated:  contentText.length > SUMMARY_INPUT_MAX_CHARS,
        updated_at:                 now,
      }).eq("id", documentId);
      logger.info("[system-pipeline] ai_summary done", { documentId, durationMs });
      return { success: true };
    } else {
      await db.from("dms_documents").update({
        ai_summary_status: "failed",
        ai_summary_error:  summaryError ?? "Unknown error.",
        updated_at:        now,
      }).eq("id", documentId);
      return { success: false, error: summaryError ?? "Summary generation failed." };
    }
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

// ── Step: intelligence ────────────────────────────────────────────────────────

async function runIntelligenceStepSystem(
  documentId: number
): Promise<{ success: boolean; error?: string; skipped?: boolean }> {
  try {
    const [completenessEnabled, riskEnabled] = await Promise.all([
      isFeatureEnabled("DMS_COMPLETENESS"),
      isFeatureEnabled("DMS_RISK"),
    ]);
    if (!completenessEnabled && !riskEnabled) {
      return { success: true, skipped: true, error: "DMS_COMPLETENESS and DMS_RISK both disabled." };
    }

    const db = createAdminClient();

    const { data: doc } = await db
      .from("dms_documents")
      .select(`
        id, document_type_id, issue_date, expiry_date, ai_summary, ai_summary_status,
        document_type:dms_document_types(requires_expiry_tracking)
      `)
      .eq("id", documentId)
      .is("deleted_at", null)
      .maybeSingle();

    if (!doc) return { success: false, error: "Document not found." };

    const d = doc as Record<string, unknown>;
    const docTypeId      = d.document_type_id as number | null;
    const docType        = d.document_type as { requires_expiry_tracking?: boolean } | null;
    const requiresExpiry = docType?.requires_expiry_tracking ?? false;
    const now            = new Date();
    const nowStr         = now.toISOString();

    // ── Completeness ─────────────────────────────────────────────────────────

    let completenessScore: number | null = null;
    let missingFieldsJson: unknown[] = [];

    if (completenessEnabled && docTypeId) {
      const { data: metaDefs } = await db
        .from("dms_metadata_definitions")
        .select("id, field_code, field_label_en")
        .eq("document_type_id", docTypeId)
        .eq("is_required", true)
        .eq("is_active", true)
        .is("deleted_at", null);

      const required = (metaDefs ?? []) as Array<{ id: number; field_code: string; field_label_en: string }>;
      const filledIds = new Set<number>();

      if (required.length > 0) {
        const defIds = required.map((r) => r.id);
        const { data: metaValues } = await db
          .from("dms_document_metadata_values")
          .select("definition_id, value_text, value_number, value_date, value_boolean")
          .eq("document_id", documentId)
          .in("definition_id", defIds);

        (metaValues ?? []).forEach((v) => {
          const row = v as Record<string, unknown>;
          if (
            (row.value_text != null && String(row.value_text).trim() !== "") ||
            row.value_number != null ||
            row.value_date != null ||
            row.value_boolean != null
          ) {
            filledIds.add(row.definition_id as number);
          }
        });
      }

      let bonus = 0;
      let maxBonus = 4;
      if (d.issue_date) bonus++;
      if (requiresExpiry && d.expiry_date) bonus++;
      if (!requiresExpiry) { bonus++; maxBonus--; }
      if ((d.ai_summary_status as string) === "complete") bonus++;

      const { data: contentCheck } = await db
        .from("dms_document_content")
        .select("id")
        .eq("document_id", documentId)
        .maybeSingle();
      if (contentCheck) bonus++;

      const totalPts = filledIds.size + bonus;
      const maxPts   = required.length + maxBonus;
      completenessScore = maxPts > 0 ? Math.min(1, totalPts / maxPts) : 1;
      missingFieldsJson = required
        .filter((r) => !filledIds.has(r.id))
        .map((r) => ({ field_code: r.field_code, field_label_en: r.field_label_en }));
    }

    // ── Risk ─────────────────────────────────────────────────────────────────

    let riskScore: number | null = null;
    let riskLevel: string | null = null;
    let riskReasons: string[]    = [];

    if (riskEnabled) {
      const risks: { severity: number; reason: string }[] = [];

      if (d.expiry_date && requiresExpiry) {
        const daysLeft = Math.floor(
          (new Date(d.expiry_date as string).getTime() - now.getTime()) / 86_400_000
        );
        if (daysLeft < 0)   risks.push({ severity: 0.9, reason: "Document has expired" });
        else if (daysLeft < 30)  risks.push({ severity: 0.7, reason: `Expires in ${daysLeft} days` });
        else if (daysLeft < 90)  risks.push({ severity: 0.4, reason: `Expires in ${daysLeft} days` });
      }
      if (completenessScore !== null && completenessScore < 0.6) {
        risks.push({ severity: 0.5, reason: "Completeness below 60%" });
      }
      if (!d.issue_date) {
        risks.push({ severity: 0.2, reason: "Issue date is missing" });
      }

      riskScore   = risks.length > 0 ? Math.min(1, Math.max(...risks.map((r) => r.severity))) : 0;
      riskReasons = risks.map((r) => r.reason);
      riskLevel   = riskScore >= 0.8 ? "critical"
                  : riskScore >= 0.6 ? "high"
                  : riskScore >= 0.4 ? "medium"
                  : riskScore >= 0.1 ? "low"
                  : "none";
    }

    const updates: Record<string, unknown> = { updated_at: nowStr };
    if (completenessScore !== null) {
      updates.completeness_score  = completenessScore;
      updates.missing_fields_json = missingFieldsJson;
    }
    if (riskScore !== null) {
      updates.ai_risk_score        = riskScore;
      updates.ai_risk_level        = riskLevel;
      updates.ai_risk_reasons_json = riskReasons;
      updates.ai_risk_updated_at   = nowStr;
    }

    await db.from("dms_documents").update(updates).eq("id", documentId);
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

// ── Step: embedding ───────────────────────────────────────────────────────────

async function runEmbeddingStepSystem(
  documentId: number
): Promise<{ success: boolean; error?: string; skipped?: boolean }> {
  try {
    if (!(await isFeatureEnabled("DMS_EMBEDDING"))) {
      return { success: true, skipped: true, error: "DMS_EMBEDDING disabled." };
    }

    const db = createAdminClient();

    const { data: docRow } = await db
      .from("dms_documents")
      .select("ai_summary, ai_summary_status, summary_embedding_status")
      .eq("id", documentId)
      .maybeSingle();

    if (!docRow) return { success: false, error: "Document not found." };

    const d = docRow as Record<string, unknown>;
    if ((d.summary_embedding_status as string | null) === "complete") {
      return { success: true, skipped: true, error: "Embedding already exists." };
    }

    const { provider: embProv } = await getDmsEmbeddingProvider();
    if (!embProv.isConfigured()) {
      await db.from("dms_documents").update({ summary_embedding_status: "skipped", updated_at: new Date().toISOString() }).eq("id", documentId);
      return { success: true, skipped: true, error: "Embedding provider not configured." };
    }

    // Prefer AI summary; fallback to content_text
    let sourceText: string | null = null;
    let embSource = "ai_summary";

    const aiSummary = (d.ai_summary as string | null) ?? null;
    if (aiSummary?.trim() && (d.ai_summary_status as string) === "complete") {
      sourceText = aiSummary;
    } else {
      const { data: contentRow } = await db
        .from("dms_document_content")
        .select("content_text")
        .eq("document_id", documentId)
        .maybeSingle();
      sourceText = (contentRow as { content_text?: string | null } | null)?.content_text ?? null;
      embSource  = "content_text";
    }

    if (!sourceText?.trim()) {
      await db.from("dms_documents").update({ summary_embedding_status: "skipped", updated_at: new Date().toISOString() }).eq("id", documentId);
      return { success: true, skipped: true, error: "No source text for embedding." };
    }

    let embeddingVector: number[] | null = null;
    let embModel: string | null = null;

    try {
      const embResult = await embProv.embedText(sourceText);
      embeddingVector = embResult.embedding;
      embModel        = embResult.model;
    } catch (embErr) {
      await db.from("dms_documents").update({
        summary_embedding_status: "failed",
        summary_embedding_error:  "Embedding generation failed.",
        updated_at:               new Date().toISOString(),
      }).eq("id", documentId);
      return { success: false, error: String(embErr).slice(0, 200) };
    }

    await db.from("dms_documents").update({
      summary_embedding:            embeddingVector,
      summary_embedding_model:      embModel,
      summary_embedding_status:     "complete",
      summary_embedding_updated_at: new Date().toISOString(),
      summary_embedding_source:     embSource,
      summary_embedding_error:      null,
      updated_at:                   new Date().toISOString(),
    }).eq("id", documentId);

    return { success: true };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

// ── Step: tag_suggestions ─────────────────────────────────────────────────────

async function runTagSuggestionsStepSystem(
  documentId: number
): Promise<{ success: boolean; error?: string; skipped?: boolean }> {
  try {
    if (!(await isFeatureEnabled("DMS_AUTO_TAGS"))) {
      return { success: true, skipped: true, error: "DMS_AUTO_TAGS disabled." };
    }

    const db = createAdminClient();

    const { data: doc } = await db
      .from("dms_documents")
      .select("id, document_no, title, ai_summary, dms_document_types!left(name_en), dms_document_categories!left(name_en)")
      .eq("id", documentId)
      .is("deleted_at", null)
      .maybeSingle();

    if (!doc) return { success: false, error: "Document not found." };

    const d = doc as Record<string, unknown>;
    const aiSummary = (d.ai_summary as string | null) ?? null;
    if (!aiSummary?.trim()) {
      return { success: true, skipped: true, error: "No AI summary for tag suggestions." };
    }

    const { provider } = await getDmsAiProvider();
    if (!provider.isConfigured()) {
      return { success: true, skipped: true, error: "AI provider not configured." };
    }

    const { data: allTags } = await db
      .from("dms_tags")
      .select("id, tag_name")
      .eq("is_active", true)
      .is("deleted_at", null)
      .limit(100);

    const tags = (allTags ?? []) as { id: number; tag_name: string }[];
    if (tags.length === 0) {
      return { success: true, skipped: true, error: "No tags available in the system." };
    }

    const { data: existingDocTags } = await db
      .from("dms_document_tags")
      .select("tag_id")
      .eq("document_id", documentId);
    const existingTagIds = new Set((existingDocTags ?? []).map((t) => (t as { tag_id: number }).tag_id));

    const tagListText = tags
      .filter((t) => !existingTagIds.has(t.id))
      .slice(0, 80)
      .map((t) => t.tag_name)
      .join(", ");

    if (!tagListText.trim()) {
      return { success: true, skipped: true, error: "All available tags already applied." };
    }

    const docTypeName = (d.dms_document_types as { name_en?: string } | null)?.name_en ?? null;
    const catName     = (d.dms_document_categories as { name_en?: string } | null)?.name_en ?? null;

    const systemPrompt =
      'You are a document tagging assistant. Suggest up to 5 relevant tags from the provided list. ' +
      'Return ONLY a JSON object: {"tags":[{"name":"tag1","confidence":0.9},{"name":"tag2","confidence":0.7}]}. ' +
      'confidence is 0.0–1.0. Only use tag names from the available list.';

    const userMsg = [
      `Document: ${String(d.document_no ?? "")} — ${String(d.title ?? "")}`,
      docTypeName ? `Type: ${docTypeName}` : null,
      catName     ? `Category: ${catName}` : null,
      `Summary: ${aiSummary.slice(0, 500)}`,
      `Available tags: ${tagListText}`,
    ].filter((l): l is string => l !== null).join("\n");

    let rawJson = "";
    try {
      const result = await provider.callStructuredCompletion(systemPrompt, userMsg, { maxTokens: 400, temperature: 0.1 });
      rawJson = result.rawJson;
    } catch {
      return { success: true, skipped: true, error: "Tag suggestion AI call failed." };
    }

    let parsed: { tags?: Array<{ name: string; confidence?: number }> } = {};
    try {
      parsed = JSON.parse(rawJson) as typeof parsed;
    } catch {
      return { success: true, skipped: true, error: "Could not parse tag suggestion response." };
    }

    const tagNameMap = new Map(tags.map((t) => [t.tag_name.toLowerCase().trim(), t.id]));
    const suggestions = (parsed.tags ?? [])
      .map((s) => ({
        tagId:      tagNameMap.get(s.name.toLowerCase().trim()),
        tagName:    s.name,
        confidence: typeof s.confidence === "number" ? s.confidence : 0.5,
      }))
      .filter((s): s is { tagId: number; tagName: string; confidence: number } =>
        s.tagId !== undefined && !existingTagIds.has(s.tagId)
      );

    if (suggestions.length === 0) {
      return { success: true, skipped: true, error: "No matching tags from suggestion." };
    }

    // Supersede existing pending suggestions
    const now = new Date().toISOString();
    await db
      .from("dms_ai_tag_suggestions")
      .update({ status: "superseded", updated_at: now })
      .eq("document_id", documentId)
      .eq("status", "pending");

    await db.from("dms_ai_tag_suggestions").insert(
      suggestions.map((s) => ({
        document_id:        documentId,
        tag_id:             s.tagId,
        suggested_tag_name: s.tagName,
        confidence:         s.confidence,
        reason:             "AI system worker suggestion",
        status:             "pending",
      }))
    );

    return { success: true };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

// ── Step: link_suggestions ────────────────────────────────────────────────────

async function runLinkSuggestionsStepSystem(
  documentId: number
): Promise<{ success: boolean; error?: string; skipped?: boolean }> {
  try {
    if (!(await isFeatureEnabled("DMS_SMART_LINKS"))) {
      return { success: true, skipped: true, error: "DMS_SMART_LINKS disabled." };
    }

    const db = createAdminClient();

    const { data: doc } = await db
      .from("dms_documents")
      .select("id, document_no, title, ai_summary")
      .eq("id", documentId)
      .is("deleted_at", null)
      .maybeSingle();

    if (!doc) return { success: false, error: "Document not found." };

    const d = doc as Record<string, unknown>;
    const aiSummary = (d.ai_summary as string | null) ?? null;

    if (!aiSummary?.trim()) {
      return { success: true, skipped: true, error: "No AI summary for link suggestions." };
    }

    // Skip if pending suggestions already exist
    const { count } = await db
      .from("dms_ai_link_suggestions")
      .select("id", { count: "exact", head: true })
      .eq("document_id", documentId)
      .eq("status", "pending");
    if (count && count > 0) {
      return { success: true, skipped: true, error: "Link suggestions already exist." };
    }

    const { provider } = await getDmsAiProvider();
    if (!provider.isConfigured()) {
      return { success: true, skipped: true, error: "AI provider not configured." };
    }

    const systemPrompt =
      "You are a document linking assistant. Based on the document summary, suggest relevant entity types to link. " +
      'Return ONLY a JSON object: {"links":[{"entity_type":"party","confidence":0.8,"reason":"Invoice mentions supplier"}]}. ' +
      'Valid entity_type values: "party", "employee". confidence is 0.0–1.0. reason max 80 chars.';

    const userMsg = [
      `Document: ${String(d.document_no ?? "")} — ${String(d.title ?? "")}`,
      `Summary: ${aiSummary.slice(0, 600)}`,
    ].join("\n");

    let rawJson = "";
    try {
      const result = await provider.callStructuredCompletion(systemPrompt, userMsg, { maxTokens: 400, temperature: 0.1 });
      rawJson = result.rawJson;
    } catch {
      return { success: true, skipped: true, error: "Link suggestion AI call failed." };
    }

    let parsed: { links?: Array<{ entity_type: string; confidence?: number; reason?: string }> } = {};
    try {
      parsed = JSON.parse(rawJson) as typeof parsed;
    } catch {
      return { success: true, skipped: true, error: "Could not parse link suggestion response." };
    }

    const suggestions = (parsed.links ?? [])
      .filter((s) => typeof s.entity_type === "string" && ["party", "employee"].includes(s.entity_type))
      .slice(0, 5);

    if (suggestions.length === 0) {
      return { success: true, skipped: true, error: "No valid link suggestions returned." };
    }

    await db.from("dms_ai_link_suggestions").insert(
      suggestions.map((s) => ({
        document_id: documentId,
        entity_type: s.entity_type,
        entity_id:   null,
        entity_name: null,
        confidence:  typeof s.confidence === "number" ? s.confidence : 0.5,
        reason:      String(s.reason ?? "").slice(0, 80) || "AI system worker suggestion",
        status:      "pending",
      }))
    );

    return { success: true };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

// ── Main system pipeline ──────────────────────────────────────────────────────

/**
 * System-level post-approval orchestration pipeline.
 *
 * Called from the async job queue worker handler.
 * Uses createAdminClient() for all DB operations.
 * Does NOT require user auth / session cookies.
 *
 * Worker-safe equivalent of runDmsAiOrchestrationPostDraft() from
 * src/server/actions/dms/orchestration.ts.
 */
export async function runDmsAiOrchestrationPostDraftSystem(params: {
  sessionCode:     string;
  documentId:      number;
  uploadSessionId: number;
}): Promise<{ success: boolean; data?: DmsAiOrchestrationRunResult; error?: string }> {
  const { sessionCode, documentId, uploadSessionId } = params;

  try {
    // Check DMS_AI_ORCHESTRATION feature flag
    if (!(await isFeatureEnabled("DMS_AI_ORCHESTRATION"))) {
      const skipped: DmsAiOrchestrationRunResult = {
        sessionCode,
        documentId,
        orchestrationStatus: "skipped_feature_disabled",
        steps: buildInitialSteps().map((s) => ({
          ...s,
          status: "skipped" as const,
          safeErrorMessage: "DMS_AI_ORCHESTRATION feature is not enabled.",
        })),
        durationMs: 0,
        completedStepCount: 0,
        failedStepCount: 0,
        skippedStepCount: 10,
      };
      await updateSessionStatus(sessionCode, { orchestration_status: "skipped_feature_disabled" });
      return { success: true, data: skipped };
    }

    const startMs   = Date.now();
    const startedAt = new Date().toISOString();

    await updateSessionStatus(sessionCode, {
      orchestration_status:     "running",
      orchestration_started_at: startedAt,
      orchestration_steps_json: buildInitialSteps(),
    });

    let steps = buildInitialSteps();
    const markRunning = (code: DmsAiOrchestrationStepCode) => {
      steps = mergeStepResult(steps, { step: code, status: "running", startedAt: new Date().toISOString() });
    };

    markRunning("content_sync");
    steps = mergeStepResult(steps, await runPipelineStepSafe("content_sync", () =>
      runContentSyncStepSystem(documentId, uploadSessionId)
    ));

    // Phase 11 — enqueue semantic_document_index if flags allow (non-blocking; errors are swallowed)
    await tryEnqueueSemanticIndexJob(documentId);

    markRunning("ai_summary");
    steps = mergeStepResult(steps, await runPipelineStepSafe("ai_summary", () =>
      runAiSummaryStepSystem(documentId)
    ));

    markRunning("intelligence");
    steps = mergeStepResult(steps, await runPipelineStepSafe("intelligence", () =>
      runIntelligenceStepSystem(documentId)
    ));

    markRunning("embedding");
    steps = mergeStepResult(steps, await runPipelineStepSafe("embedding", () =>
      runEmbeddingStepSystem(documentId)
    ));

    markRunning("tag_suggestions");
    steps = mergeStepResult(steps, await runPipelineStepSafe("tag_suggestions", () =>
      runTagSuggestionsStepSystem(documentId)
    ));

    markRunning("link_suggestions");
    steps = mergeStepResult(steps, await runPipelineStepSafe("link_suggestions", () =>
      runLinkSuggestionsStepSystem(documentId)
    ));

    // Mark ready_for_review
    steps = mergeStepResult(steps, {
      step:        "ready_for_review",
      status:      "completed",
      startedAt:   new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs:  0,
    });

    const runResult = buildRunResult({ sessionCode, documentId, steps, startMs });

    await updateSessionStatus(sessionCode, {
      orchestration_status:       runResult.orchestrationStatus,
      orchestration_steps_json:   steps,
      orchestration_completed_at: new Date().toISOString(),
    });

    logger.info("[system-pipeline] orchestration completed", {
      sessionCode, documentId,
      status:    runResult.orchestrationStatus,
      completed: runResult.completedStepCount,
      failed:    runResult.failedStepCount,
      skipped:   runResult.skippedStepCount,
      durationMs: runResult.durationMs,
    });

    return { success: true, data: runResult };
  } catch (err) {
    const safeMsg = err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200);
    logger.error("[system-pipeline] orchestration failed", { sessionCode, documentId, error: safeMsg });
    return { success: false, error: safeMsg };
  }
}
