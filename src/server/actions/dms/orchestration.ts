"use server";

/**
 * ERP DMS AI ORCH.1 — Orchestration Server Actions
 *
 * Coordinates the full AI processing pipeline after a DMS upload session
 * has produced a draft intake session/document.
 *
 * Pipeline phases:
 *   Phase A (Critical — existing flow): OCR + AI classification/extraction → draft
 *   Phase B (Best-effort — this file): content sync, summary, intelligence,
 *            embedding, tag suggestions, smart links
 *
 * Security rules:
 * - Permission check done ONCE at orchestrator boundary.
 * - orchestration_steps_json NEVER contains OCR text, prompts, AI responses,
 *   content_text, file content, API keys, or sensitive extracted values.
 * - Step-level errors are sanitized before storage.
 * - All AI calls delegated to existing DMS AI server actions.
 * - DMS_AI_ORCHESTRATION flag must be enabled for pipeline to run.
 * - No auto-approval — human review remains mandatory.
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { logAudit } from "@/server/actions/audit";

import type {
  DmsAiOrchestrationStepCode,
  DmsAiOrchestrationStepResult,
  DmsAiOrchestrationRunResult,
  DmsAiOrchestrationStatusRow,
} from "@/lib/dms/orchestration/types";
import {
  buildInitialSteps,
  runPipelineStepSafe,
  mergeStepResult,
  calculateOverallStatus,
  buildRunResult,
} from "@/lib/dms/orchestration/pipeline-runner";

// Existing DMS AI server actions — called as regular async functions
import { generateAndSaveDmsAiSummary } from "@/server/actions/dms/ai-summary";
import { evaluateDmsDocumentIntelligence } from "@/server/actions/dms/ai-intelligence";
import { generateDmsDocumentEmbedding } from "@/server/actions/dms/semantic-search";
import { suggestDmsDocumentTags } from "@/server/actions/dms/ai-tags";
import { suggestDmsDocumentLinks } from "@/server/actions/dms/ai-links";
import { writeDocumentContentTextSystem } from "@/server/actions/dms/document-content";

// ── Types ─────────────────────────────────────────────────────────────────────

type ActionResult<T = undefined> = T extends undefined
  ? { success: boolean; error?: string }
  : { success: boolean; data?: T; error?: string };

// ── Feature flag helper ───────────────────────────────────────────────────────

async function isDmsAiOrchestrationEnabled(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("erp_ai_feature_flags")
      .select("is_enabled")
      .eq("feature_code", "DMS_AI_ORCHESTRATION")
      .single();
    return (data as { is_enabled?: boolean } | null)?.is_enabled === true;
  } catch {
    return false;
  }
}

// ── Permission helper ─────────────────────────────────────────────────────────

function canRunOrchestration(ctx: Awaited<ReturnType<typeof getAuthContext>>): boolean {
  return (
    hasPermission(ctx, "dms.documents.upload") ||
    hasPermission(ctx, "dms.documents.ai.run") ||
    hasPermission(ctx, "dms.admin") ||
    ctx.roleCodes.includes("system_admin")
  );
}

// ── Update orchestration status on session ────────────────────────────────────

async function updateSessionOrchestration(
  sessionCode: string,
  update: {
    orchestration_status: string;
    orchestration_steps_json?: DmsAiOrchestrationStepResult[];
    orchestration_started_at?: string;
    orchestration_completed_at?: string;
  }
): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase
      .from("dms_upload_sessions")
      .update({
        ...update,
        orchestration_steps_json: update.orchestration_steps_json ?? undefined,
        updated_at: new Date().toISOString(),
      })
      .eq("session_code", sessionCode)
      .is("deleted_at", null);
  } catch {
    // Non-fatal — best-effort status tracking
  }
}

// ── Content sync step ─────────────────────────────────────────────────────────

async function runContentSyncStep(
  documentId: number,
  uploadSessionId?: number | null
): Promise<{ success: boolean; error?: string; skipped?: boolean }> {
  try {
    const supabase = await createClient();

    const { data: existingContent } = await supabase
      .from("dms_document_content")
      .select("id")
      .eq("document_id", documentId)
      .maybeSingle();

    if (existingContent) {
      return { success: true, skipped: true, error: "Content already synced." };
    }

    let ocrText: string | null = null;

    // 1. OCR text on current version file (via document.current_version_id)
    const { data: docRow } = await supabase
      .from("dms_documents")
      .select("current_version_id")
      .eq("id", documentId)
      .maybeSingle();

    const versionId = docRow?.current_version_id as number | null;
    if (versionId) {
      const { data: fileData } = await supabase
        .from("dms_document_files")
        .select("ocr_text")
        .eq("version_id", versionId)
        .eq("file_role", "original")
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();
      ocrText = (fileData as { ocr_text?: string | null } | null)?.ocr_text ?? null;
    }

    // 2. AI intake transcription (draft docs often have no file OCR yet)
    if (!ocrText?.trim() && uploadSessionId) {
      const { data: sessionRow } = await supabase
        .from("dms_upload_sessions")
        .select("ai_result_id")
        .eq("id", uploadSessionId)
        .maybeSingle();

      const aiResultId = sessionRow?.ai_result_id as number | null;
      if (aiResultId) {
        const { data: aiRow } = await supabase
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

    const result = await writeDocumentContentTextSystem({
      documentId,
      text: ocrText,
      source: "ocr",
      performedBy: 0,
    });

    return { success: result.success, error: result.error };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

// ── 1. runDmsAiOrchestrationPostDraft ─────────────────────────────────────────

/**
 * Runs the best-effort AI pipeline after a draft intake document exists.
 * Called from the intake review page client on mount (single-file flow)
 * or from runDmsBatchOrchestration (batch flow).
 *
 * Steps:
 *   content_sync → ai_summary → intelligence → embedding → tag_suggestions → link_suggestions
 *
 * Idempotency: each step checks existing status before running.
 * Best-effort: a failed step is recorded but does not block subsequent steps.
 */
export async function runDmsAiOrchestrationPostDraft(input: {
  sessionCode: string;
}): Promise<ActionResult<DmsAiOrchestrationRunResult>> {
  try {
    const parsed = z.object({ sessionCode: z.string().min(1) }).safeParse(input);
    if (!parsed.success) return { success: false, error: "Invalid session code." };

    const { sessionCode } = parsed.data;
    const ctx = await getAuthContext();

    if (!ctx.profile) return { success: false, error: "Not authenticated." };
    if (!canRunOrchestration(ctx)) {
      return { success: false, error: "Permission denied. Requires dms.documents.upload or dms.admin." };
    }

    // Load session
    const supabase = await createClient();
    const { data: session, error: sessErr } = await supabase
      .from("dms_upload_sessions")
      .select("id, session_code, document_id, uploaded_by, intake_status, orchestration_status, deleted_at")
      .eq("session_code", sessionCode)
      .is("deleted_at", null)
      .single();

    if (sessErr || !session) {
      return { success: false, error: "Upload session not found." };
    }

    const typedSession = session as Record<string, unknown>;

    // Verify ownership
    const isAdmin = hasPermission(ctx, "dms.admin") || ctx.roleCodes.includes("system_admin");
    const isOwner = (typedSession.uploaded_by as number | null) === ctx.profile.id;
    if (!isOwner && !isAdmin) {
      return { success: false, error: "Access denied to this upload session." };
    }

    const documentId = typedSession.document_id as number | null;
    const uploadSessionId = typedSession.id as number;
    if (!documentId) {
      return {
        success: false,
        error: "No draft document exists for this session. Complete the AI intake step first.",
      };
    }

    // Check if already complete
    const currentOrchStatus = (typedSession.orchestration_status as string) ?? "pending";
    if (currentOrchStatus === "complete") {
      // Already done — return existing status
      const statusResult = await getDmsOrchestrationStatus({ sessionCode });
      if (statusResult.success && statusResult.data) {
        return {
          success: true,
          data: {
            sessionCode,
            documentId,
            orchestrationStatus: "complete",
            steps: statusResult.data.steps,
            durationMs: 0,
            completedStepCount: statusResult.data.steps.filter((s) => s.status === "completed").length,
            failedStepCount: 0,
            skippedStepCount: statusResult.data.steps.filter((s) => s.status === "skipped").length,
          },
        };
      }
    }

    // Check feature flag
    const flagEnabled = await isDmsAiOrchestrationEnabled();
    if (!flagEnabled) {
      await updateSessionOrchestration(sessionCode, {
        orchestration_status: "skipped_feature_disabled",
      });
      return {
        success: true,
        data: buildRunResult({
          sessionCode,
          documentId,
          steps: buildInitialSteps().map((s) => ({
            ...s,
            status: "skipped" as const,
            safeErrorMessage: "DMS AI Orchestration feature is not enabled.",
          })),
          startMs: Date.now(),
        }),
      };
    }

    // Start pipeline
    const startMs = Date.now();
    const startedAt = new Date().toISOString();

    await updateSessionOrchestration(sessionCode, {
      orchestration_status: "running",
      orchestration_started_at: startedAt,
      orchestration_steps_json: buildInitialSteps(),
    });

    let steps = buildInitialSteps();
    const markRunning = (code: DmsAiOrchestrationStepCode) => {
      steps = mergeStepResult(steps, { step: code, status: "running", startedAt: new Date().toISOString() });
    };

    // ── Step: content_sync ────────────────────────────────────────────────────
    markRunning("content_sync");
    const contentSyncResult = await runPipelineStepSafe("content_sync", () =>
      runContentSyncStep(documentId, uploadSessionId)
    );
    steps = mergeStepResult(steps, contentSyncResult);

    // ── Step: ai_summary ──────────────────────────────────────────────────────
    markRunning("ai_summary");
    const summaryResult = await runPipelineStepSafe("ai_summary", async () => {
      const res = await generateAndSaveDmsAiSummary(documentId);
      return { success: res.success, error: res.error };
    });
    steps = mergeStepResult(steps, summaryResult);

    // ── Step: intelligence (completeness + risk — no AI cost) ─────────────────
    markRunning("intelligence");
    const intelligenceResult = await runPipelineStepSafe("intelligence", async () => {
      const res = await evaluateDmsDocumentIntelligence(documentId);
      return { success: res.success, error: res.error };
    });
    steps = mergeStepResult(steps, intelligenceResult);

    // ── Step: embedding ───────────────────────────────────────────────────────
    markRunning("embedding");
    const embeddingResult = await runPipelineStepSafe("embedding", async () => {
      const res = await generateDmsDocumentEmbedding(documentId);
      return { success: res.success, error: res.error };
    });
    steps = mergeStepResult(steps, embeddingResult);

    // ── Step: tag_suggestions ─────────────────────────────────────────────────
    markRunning("tag_suggestions");
    const tagsResult = await runPipelineStepSafe("tag_suggestions", async () => {
      const res = await suggestDmsDocumentTags(documentId);
      return { success: res.success, error: res.error };
    });
    steps = mergeStepResult(steps, tagsResult);

    // ── Step: link_suggestions ────────────────────────────────────────────────
    markRunning("link_suggestions");
    const linksResult = await runPipelineStepSafe("link_suggestions", async () => {
      const res = await suggestDmsDocumentLinks(documentId);
      return { success: res.success, error: res.error };
    });
    steps = mergeStepResult(steps, linksResult);

    // ── Mark ready_for_review ─────────────────────────────────────────────────
    steps = mergeStepResult(steps, {
      step: "ready_for_review",
      status: "completed",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 0,
    });

    // ── Finalize ──────────────────────────────────────────────────────────────
    const runResult = buildRunResult({ sessionCode, documentId, steps, startMs });

    await updateSessionOrchestration(sessionCode, {
      orchestration_status: runResult.orchestrationStatus,
      orchestration_steps_json: steps,
      orchestration_completed_at: new Date().toISOString(),
    });

    // Safe audit event
    const auditAction = runResult.failedStepCount > 0
      ? "dms_ai_orchestration_completed_with_warnings"
      : "dms_ai_orchestration_completed";

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_upload_sessions",
      entity_id: documentId,
      entity_reference: sessionCode,
      action: auditAction,
      new_values: {
        sessionCode,
        documentId,
        completedSteps: runResult.completedStepCount,
        failedSteps: runResult.failedStepCount,
        skippedSteps: runResult.skippedStepCount,
        durationMs: runResult.durationMs,
      },
    });

    return { success: true, data: runResult };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

// ── 2. getDmsOrchestrationStatus ──────────────────────────────────────────────

/**
 * Read-only action: returns current orchestration status for a session.
 * Returns only safe metadata — no content, no OCR text.
 */
export async function getDmsOrchestrationStatus(input: {
  sessionCode: string;
}): Promise<ActionResult<DmsAiOrchestrationStatusRow>> {
  try {
    const parsed = z.object({ sessionCode: z.string().min(1) }).safeParse(input);
    if (!parsed.success) return { success: false, error: "Invalid session code." };

    const { sessionCode } = parsed.data;
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated." };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("dms_upload_sessions")
      .select(
        "session_code, document_id, uploaded_by, orchestration_status, orchestration_steps_json, orchestration_started_at, orchestration_completed_at"
      )
      .eq("session_code", sessionCode)
      .is("deleted_at", null)
      .single();

    if (error || !data) return { success: false, error: "Session not found." };

    const row = data as Record<string, unknown>;

    // Permission check
    const isAdmin = hasPermission(ctx, "dms.admin") || ctx.roleCodes.includes("system_admin");
    const isOwner = (row.uploaded_by as number | null) === ctx.profile.id;
    if (!isOwner && !isAdmin) return { success: false, error: "Access denied." };

    return {
      success: true,
      data: {
        sessionCode: row.session_code as string,
        documentId: (row.document_id as number | null) ?? null,
        orchestrationStatus: (row.orchestration_status as string ?? "pending") as import("@/lib/dms/orchestration/types").DmsAiOrchestrationStatus,
        steps: (row.orchestration_steps_json as DmsAiOrchestrationStepResult[] | null) ?? [],
        orchestrationStartedAt: (row.orchestration_started_at as string | null) ?? null,
        orchestrationCompletedAt: (row.orchestration_completed_at as string | null) ?? null,
      },
    };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

// ── 3. retryDmsOrchestrationStep ──────────────────────────────────────────────

/**
 * Retries a single failed or skipped best-effort step.
 * Only allowed for best-effort steps (not OCR/extraction).
 */
export async function retryDmsOrchestrationStep(input: {
  sessionCode: string;
  stepCode: DmsAiOrchestrationStepCode;
}): Promise<ActionResult<DmsAiOrchestrationStepResult>> {
  const RETRYABLE: DmsAiOrchestrationStepCode[] = [
    "content_sync", "ai_summary", "intelligence", "embedding", "tag_suggestions", "link_suggestions",
  ];

  try {
    const parsed = z.object({
      sessionCode: z.string().min(1),
      stepCode: z.string().min(1),
    }).safeParse(input);
    if (!parsed.success) return { success: false, error: "Invalid input." };

    const { sessionCode, stepCode } = parsed.data;
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated." };
    if (!canRunOrchestration(ctx)) return { success: false, error: "Permission denied." };

    // Phase 5: honour the DMS_AI_ORCHESTRATION feature flag on retry as well
    const orchestrationEnabled = await isDmsAiOrchestrationEnabled();
    if (!orchestrationEnabled) {
      return {
        success: false,
        error: "DMS AI Orchestration is currently disabled. Enable the DMS_AI_ORCHESTRATION feature flag to retry steps.",
      };
    }

    if (!RETRYABLE.includes(stepCode as DmsAiOrchestrationStepCode)) {
      return { success: false, error: `Step "${stepCode}" cannot be retried via orchestration. Use the manual button instead.` };
    }

    // Load session + document
    const supabase = await createClient();
    const { data: session } = await supabase
      .from("dms_upload_sessions")
      .select("document_id, uploaded_by, orchestration_steps_json")
      .eq("session_code", sessionCode)
      .is("deleted_at", null)
      .single();

    if (!session) return { success: false, error: "Session not found." };

    const typedSession = session as Record<string, unknown>;
    const isAdmin = hasPermission(ctx, "dms.admin") || ctx.roleCodes.includes("system_admin");
    const isOwner = (typedSession.uploaded_by as number | null) === ctx.profile.id;
    if (!isOwner && !isAdmin) return { success: false, error: "Access denied." };

    const documentId = typedSession.document_id as number | null;
    const uploadSessionId = typedSession.id as number;
    if (!documentId) return { success: false, error: "No draft document exists for this session." };

    // Run the step
    let stepResult: DmsAiOrchestrationStepResult;
    const code = stepCode as DmsAiOrchestrationStepCode;

    switch (code) {
      case "content_sync":
        stepResult = await runPipelineStepSafe(code, () =>
          runContentSyncStep(documentId, typedSession.id as number)
        );
        break;
      case "ai_summary":
        stepResult = await runPipelineStepSafe(code, async () => {
          const r = await generateAndSaveDmsAiSummary(documentId);
          return { success: r.success, error: r.error };
        });
        break;
      case "intelligence":
        stepResult = await runPipelineStepSafe(code, async () => {
          const r = await evaluateDmsDocumentIntelligence(documentId);
          return { success: r.success, error: r.error };
        });
        break;
      case "embedding":
        stepResult = await runPipelineStepSafe(code, async () => {
          const r = await generateDmsDocumentEmbedding(documentId);
          return { success: r.success, error: r.error };
        });
        break;
      case "tag_suggestions":
        stepResult = await runPipelineStepSafe(code, async () => {
          const r = await suggestDmsDocumentTags(documentId);
          return { success: r.success, error: r.error };
        });
        break;
      case "link_suggestions":
        stepResult = await runPipelineStepSafe(code, async () => {
          const r = await suggestDmsDocumentLinks(documentId);
          return { success: r.success, error: r.error };
        });
        break;
      default:
        return { success: false, error: `Unknown step: ${code}` };
    }

    // Update step in session
    const existingSteps = (typedSession.orchestration_steps_json as DmsAiOrchestrationStepResult[] | null) ?? [];
    const updatedSteps = mergeStepResult(existingSteps, stepResult);
    const newStatus = calculateOverallStatus(updatedSteps);

    await updateSessionOrchestration(sessionCode, {
      orchestration_status: newStatus,
      orchestration_steps_json: updatedSteps,
    });

    return { success: true, data: stepResult };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

// ── 4. runDmsBatchOrchestration ───────────────────────────────────────────────

/**
 * Runs post-draft orchestration for all draft sessions in a batch.
 * Processes sequentially. Preserves one-by-one approval — does NOT approve anything.
 */
export async function runDmsBatchOrchestration(input: {
  batchCode: string;
}): Promise<ActionResult<{
  batchCode: string;
  processedCount: number;
  results: Array<{ sessionCode: string; documentId: number | null; orchestrationStatus: string }>;
}>> {
  try {
    const parsed = z.object({ batchCode: z.string().min(1) }).safeParse(input);
    if (!parsed.success) return { success: false, error: "Invalid batch code." };

    const { batchCode } = parsed.data;
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated." };
    if (!canRunOrchestration(ctx)) return { success: false, error: "Permission denied." };

    // Load batch
    const supabase = await createClient();
    const { data: batch, error: batchErr } = await supabase
      .from("dms_upload_batches")
      .select("id, created_by, status, deleted_at")
      .eq("batch_code", batchCode)
      .is("deleted_at", null)
      .single();

    if (batchErr || !batch) return { success: false, error: "Batch not found." };

    const isAdmin = hasPermission(ctx, "dms.admin") || ctx.roleCodes.includes("system_admin");
    const batchTyped = batch as Record<string, unknown>;
    const isOwner = (batchTyped.created_by as number | null) === ctx.profile.id;
    if (!isOwner && !isAdmin) return { success: false, error: "Access denied to this batch." };

    // Load draft sessions in the batch that have a document_id
    const { data: sessions } = await supabase
      .from("dms_upload_sessions")
      .select("session_code, document_id, orchestration_status")
      .eq("batch_id", batchTyped.id as number)
      .is("deleted_at", null)
      .not("document_id", "is", null);

    const sessionList = (sessions ?? []) as Array<{ session_code: string; document_id: number; orchestration_status: string }>;

    const results: Array<{ sessionCode: string; documentId: number | null; orchestrationStatus: string }> = [];

    for (const s of sessionList) {
      // Skip sessions already complete
      if (s.orchestration_status === "complete") {
        results.push({ sessionCode: s.session_code, documentId: s.document_id, orchestrationStatus: "complete" });
        continue;
      }

      const orchResult = await runDmsAiOrchestrationPostDraft({ sessionCode: s.session_code });
      results.push({
        sessionCode: s.session_code,
        documentId: s.document_id,
        orchestrationStatus: orchResult.success
          ? (orchResult.data?.orchestrationStatus ?? "failed")
          : "failed",
      });
    }

    return {
      success: true,
      data: {
        batchCode,
        processedCount: results.length,
        results,
      },
    };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}
