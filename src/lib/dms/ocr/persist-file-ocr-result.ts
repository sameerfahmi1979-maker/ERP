/**
 * DMS OCR-AI FIX.1 — Shared OCR Persistence Helper
 *
 * Single source of truth for writing OCR results across all code paths:
 *   - ocr.ts (manual Run OCR)
 *   - ai-intake.ts (approval-time sync)
 *   - batch-intake.ts (approval-time sync)
 *   - ai-analysis.ts (side-effect text extraction)
 *
 * Guarantees:
 *  - dms_document_files.ocr_text / ocr_status / ocr_provider / ocr_model updated
 *  - dms_documents OCR summary flags always recomputed from all active file rows
 *  - dms_document_content.content_text refreshed via writeDocumentContentTextSystem
 *  - Never logs OCR text or content text
 *  - Idempotent and safe to re-run
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OcrProviderCode } from "./types";
import { writeDocumentContentTextSystem } from "@/server/actions/dms/document-content";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PersistFileOcrResultParams {
  /** Authenticated RLS supabase client (createClient(), already created by caller). */
  supabase: SupabaseClient;
  /** dms_document_files.id */
  fileId: number;
  /** dms_documents.id */
  documentId: number;
  /** Extracted OCR text (null or empty = no text found). */
  text: string | null;
  /** Provider code used for OCR. */
  provider: OcrProviderCode | "ai_intake" | "ai_analysis";
  /** Model identifier used (e.g. "gpt-4.1"). Null if not applicable. */
  model: string | null;
  /** Authenticated user ID for content sync audit. */
  performedBy: number;
  /** Content text source label for dms_document_content. Defaults to "ocr". */
  source?: "ocr" | "ai_intake";
}

export interface PersistFileOcrResultOutput {
  /** Whether the file row was updated successfully. */
  fileUpdated: boolean;
  /** Whether document-level OCR flags were recomputed successfully. */
  documentUpdated: boolean;
  /** Whether content text was synced to dms_document_content. */
  contentSynced: boolean;
  /** True when extractedText was non-empty. */
  hasText: boolean;
  errors: string[];
}

// ── Helper ────────────────────────────────────────────────────────────────────

export async function persistFileOcrResult(
  params: PersistFileOcrResultParams
): Promise<PersistFileOcrResultOutput> {
  const { supabase, fileId, documentId, provider, model, performedBy } = params;
  const text = params.text?.trim() || null;
  const source = params.source ?? "ocr";
  const hasText = (text?.length ?? 0) > 0;
  const now = new Date().toISOString();
  const errors: string[] = [];

  let fileUpdated = false;
  let documentUpdated = false;
  let contentSynced = false;

  // ── 1. Update dms_document_files ─────────────────────────────────────────────

  const { error: fileErr } = await supabase
    .from("dms_document_files")
    .update({
      ocr_status: "complete",
      ocr_text: hasText ? text!.slice(0, 500_000) : null,
      ocr_provider: provider,
      ocr_model: model ?? null,
      ocr_completed_at: now,
      ocr_error_message: null,
      updated_at: now,
    })
    .eq("id", fileId);

  if (fileErr) {
    errors.push(`file update: ${fileErr.message}`);
  } else {
    fileUpdated = true;
  }

  // ── 2. Recompute document-level OCR summary from all active files ─────────────
  //    Always do this — even if file update failed — to heal inconsistent states.

  try {
    const { data: allFiles } = await supabase
      .from("dms_document_files")
      .select("ocr_status, ocr_text")
      .eq("document_id", documentId)
      .is("deleted_at", null);

    const files = (allFiles ?? []) as { ocr_status: string | null; ocr_text: string | null }[];
    const hasAnyText = files.some((f) => typeof f.ocr_text === "string" && f.ocr_text.trim().length > 0);
    const allComplete = files.length > 0 && files.every((f) => f.ocr_status === "complete" || f.ocr_status === "skipped");
    const anyFailed = files.some((f) => f.ocr_status === "failed");
    const anyProcessing = files.some((f) => f.ocr_status === "processing");

    const docOcrStatus = anyProcessing
      ? "processing"
      : anyFailed
      ? "failed"
      : allComplete
      ? "complete"
      : "not_started";

    const { error: docErr } = await supabase
      .from("dms_documents")
      .update({
        ocr_status: docOcrStatus,
        ocr_text_available: hasAnyText,
        ocr_last_run_at: now,
        updated_at: now,
      })
      .eq("id", documentId);

    if (docErr) {
      errors.push(`document update: ${docErr.message}`);
    } else {
      documentUpdated = true;
    }
  } catch (e) {
    errors.push(`document recompute: ${String(e)}`);
  }

  // ── 3. Sync content text to dms_document_content ──────────────────────────────
  //    Non-fatal — do not crash callers on content sync failure.

  if (hasText) {
    try {
      const result = await writeDocumentContentTextSystem({
        documentId,
        text: text!,
        source,
        performedBy,
      });
      contentSynced = result.success;
      if (!result.success && result.error) {
        errors.push(`content sync: ${result.error}`);
      }
    } catch (e) {
      errors.push(`content sync exception: ${String(e)}`);
    }
  }

  return { fileUpdated, documentUpdated, contentSynced, hasText, errors };
}
