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

  const { data: savedFile, error: fileErr } = await supabase
    .from("dms_document_files")
    .update({
      ocr_status: "complete",
      ocr_text: hasText ? text!.slice(0, 500_000) : null,
      ocr_provider: provider,
      ocr_model: model ?? null,
      ocr_completed_at: now,
      ocr_error_message: null,
    })
    .eq("id", fileId)
    .eq("document_id", documentId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (fileErr || !savedFile) {
    errors.push("File OCR could not be saved. The record may have changed or access may have been denied.");
    // Never publish content or recompute a misleading summary after a rejected write.
    return { fileUpdated, documentUpdated, contentSynced, hasText, errors };
  } else {
    fileUpdated = true;
  }

  // ── 2. Recompute document-level OCR summary from all active files ─────────────
  //    Read failures must not be mistaken for an empty collection.

  try {
    const { data: allFiles, error: filesErr } = await supabase
      .from("dms_document_files")
      .select("ocr_status, ocr_text")
      .eq("document_id", documentId)
      .is("deleted_at", null);
    if (filesErr || !allFiles?.length) {
      errors.push("Saved OCR, but the document file summary could not be read. Retry to synchronize it.");
      return { fileUpdated, documentUpdated, contentSynced, hasText, errors };
    }

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

    const { data: savedDoc, error: docErr } = await supabase
      .from("dms_documents")
      .update({
        ocr_status: docOcrStatus,
        ocr_text_available: hasAnyText,
        ocr_last_run_at: now,
        updated_at: now,
      })
      .eq("id", documentId)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();

    if (docErr || !savedDoc) {
      errors.push("Saved OCR, but the document status could not be synchronized. Retry the operation.");
    } else {
      documentUpdated = true;
    }
  } catch {
    errors.push("Saved OCR, but the document status could not be synchronized. Retry the operation.");
  }
  if (!documentUpdated) return { fileUpdated, documentUpdated, contentSynced, hasText, errors };

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
        errors.push("Saved file OCR, but extracted document text could not be synchronized. Retry the operation.");
      }
    } catch {
      errors.push("Saved file OCR, but extracted document text could not be synchronized. Retry the operation.");
    }
  }

  return { fileUpdated, documentUpdated, contentSynced, hasText, errors };
}
