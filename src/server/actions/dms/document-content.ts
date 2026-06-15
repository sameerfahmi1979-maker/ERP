"use server";

/**
 * DMS 12.1 — Document Content Server Actions
 *
 * Manages dms_document_content: storing consolidated extracted text per document,
 * providing gated read access, and supporting admin backfill.
 *
 * Hard rules:
 *  - Never log content_text, OCR text, or prompt text.
 *  - Confidential documents (hr/legal/executive) require dms.admin for full text access.
 *  - createAdminClient() must NOT be used for user-facing search.
 *  - content_tsv on dms_documents is kept current by a DB trigger; server actions do not
 *    update it manually.
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { logAudit } from "@/server/actions/audit";
import { revalidatePath } from "next/cache";
import {
  capDmsContentText,
  sha256Text,
  contentTextFileSeparator,
  normalizeDmsContentText,
} from "@/lib/dms/content-text";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

export type ContentTextSource =
  | "ocr"
  | "ai_intake"
  | "manual_override"
  | "truncated"
  | "system_resync";

export type DocumentContentRow = {
  documentId: number;
  contentText: string | null;
  source: ContentTextSource | null;
  charCount: number | null;
  isTruncated: boolean;
  sha256: string | null;
  updatedAt: string | null;
};

const CONFIDENTIAL_LEVELS_REQUIRING_ADMIN = ["hr", "legal", "executive"];

function canEdit(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return (
    hasPermission(ctx, "dms.documents.edit") ||
    hasPermission(ctx, "dms.admin") ||
    ctx.roleCodes.includes("system_admin")
  );
}

function canAdmin(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return (
    hasPermission(ctx, "dms.admin") ||
    ctx.roleCodes.includes("system_admin")
  );
}

// ── Internal feature-flag check ──────────────────────────────────────────────

async function isDmsContentSyncEnabled(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("erp_ai_feature_flags")
      .select("is_enabled")
      .eq("feature_code", "DMS_CONTENT_TEXT_SYNC")
      .single();
    return (data as { is_enabled?: boolean } | null)?.is_enabled ?? false;
  } catch {
    return false;
  }
}

// ── Internal system writer (called from ai-intake and ocr flows) ─────────────

/**
 * Write or update dms_document_content for a document.
 * Designed to be called from existing server-action flows after authentication
 * is already established; auth param is the caller's user id.
 *
 * NEVER logs content_text.
 * Returns silently on feature-flag off.
 */
export async function writeDocumentContentTextSystem(params: {
  documentId: number;
  text: string | null;
  source: ContentTextSource;
  performedBy: number;
}): Promise<{ success: boolean; charCount: number; isTruncated: boolean; error?: string }> {
  try {
    if (!params.text || params.text.trim().length === 0) {
      return { success: true, charCount: 0, isTruncated: false };
    }

    const flagEnabled = await isDmsContentSyncEnabled();
    if (!flagEnabled) {
      return { success: true, charCount: 0, isTruncated: false };
    }

    const supabase = await createClient();

    const { text: cappedText, isTruncated } = capDmsContentText(params.text);
    const charCount = cappedText.length;
    const hash = sha256Text(cappedText);
    const effectiveSource: ContentTextSource = isTruncated ? "truncated" : params.source;
    const now = new Date().toISOString();

    const { error: upsertError } = await supabase
      .from("dms_document_content")
      .upsert(
        {
          document_id: params.documentId,
          content_text: cappedText,
          content_text_updated_at: now,
          content_text_source: effectiveSource,
          content_text_sha256: hash,
          content_text_char_count: charCount,
          is_truncated: isTruncated,
          updated_at: now,
        },
        { onConflict: "document_id" }
      );

    if (upsertError) {
      return { success: false, charCount: 0, isTruncated, error: upsertError.message };
    }

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_document_content",
      entity_id: params.documentId,
      entity_reference: `DOC-${params.documentId}`,
      action: "create",
      new_values: {
        action: "dms_content_text_synced",
        document_id: params.documentId,
        source: effectiveSource,
        char_count: charCount,
        is_truncated: isTruncated,
      },
    });

    return { success: true, charCount, isTruncated };
  } catch (e) {
    return { success: false, charCount: 0, isTruncated: false, error: String(e) };
  }
}

// ── updateDocumentContentText (public server action) ─────────────────────────

const UpdateContentTextSchema = z.object({
  documentId: z.number().int().positive(),
  text: z.string().nullable(),
  source: z.enum(["ocr", "ai_intake", "manual_override", "truncated", "system_resync"]),
});

export async function updateDocumentContentText(
  input: z.infer<typeof UpdateContentTextSchema>
): Promise<ActionResult<{ documentId: number; charCount: number; isTruncated: boolean }>> {
  try {
    const parsed = UpdateContentTextSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

    const { documentId, text, source } = parsed.data;

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canEdit(ctx)) return { success: false, error: "Permission denied" };

    const result = await writeDocumentContentTextSystem({
      documentId,
      text,
      source,
      performedBy: ctx.profile.id as number,
    });

    if (!result.success) return { success: false, error: result.error };

    revalidatePath(`/dms/documents/record/${documentId}`);

    return { success: true, data: { documentId, charCount: result.charCount, isTruncated: result.isTruncated } };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── resyncDocumentContentText ─────────────────────────────────────────────────

export async function resyncDocumentContentText(
  documentId: number
): Promise<ActionResult<{ documentId: number; charCount: number; isTruncated: boolean }>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canEdit(ctx)) return { success: false, error: "Permission denied" };

    // Verify document exists and is accessible
    const { data: doc, error: docErr } = await supabase
      .from("dms_documents")
      .select("id, current_version_id")
      .eq("id", documentId)
      .is("deleted_at", null)
      .single();

    if (docErr || !doc) return { success: false, error: docErr?.message ?? "Document not found" };

    // Load OCR text from current-version files (or all active files if no version)
    let filesQuery = supabase
      .from("dms_document_files")
      .select("id, file_name, ocr_text")
      .eq("document_id", documentId)
      .eq("ocr_status", "complete")
      .is("deleted_at", null)
      .order("created_at", { ascending: true });

    if (doc.current_version_id) {
      filesQuery = filesQuery.eq("version_id", doc.current_version_id);
    }

    const { data: files, error: filesErr } = await filesQuery;
    if (filesErr) return { success: false, error: filesErr.message };

    const usableFiles = (files ?? []).filter((f) => (f.ocr_text as string | null)?.trim());
    if (usableFiles.length === 0) {
      return { success: false, error: "No OCR text available to sync. Run OCR first." };
    }

    const consolidatedText = usableFiles
      .map((f, i) =>
        i === 0
          ? normalizeDmsContentText((f.ocr_text as string) ?? "")
          : contentTextFileSeparator(f.file_name as string) +
            normalizeDmsContentText((f.ocr_text as string) ?? "")
      )
      .join("");

    const result = await writeDocumentContentTextSystem({
      documentId,
      text: consolidatedText,
      source: "system_resync",
      performedBy: ctx.profile.id as number,
    });

    if (!result.success) return { success: false, error: result.error };

    revalidatePath(`/dms/documents/record/${documentId}`);

    return { success: true, data: { documentId, charCount: result.charCount, isTruncated: result.isTruncated } };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── getDocumentContentText ────────────────────────────────────────────────────

export async function getDocumentContentText(
  documentId: number
): Promise<ActionResult<DocumentContentRow>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!hasPermission(ctx, "dms.documents.view") && !canAdmin(ctx)) {
      return { success: false, error: "Permission denied" };
    }

    // Load document basic info — needed for confidentiality check
    const { data: doc, error: docErr } = await supabase
      .from("dms_documents")
      .select("id, confidentiality_level")
      .eq("id", documentId)
      .is("deleted_at", null)
      .single();

    if (docErr || !doc) return { success: false, error: docErr?.message ?? "Document not found" };

    // Confidentiality gate: hr/legal/executive require dms.admin
    const confidentiality = (doc.confidentiality_level as string | null) ?? "internal";
    if (
      CONFIDENTIAL_LEVELS_REQUIRING_ADMIN.includes(confidentiality) &&
      !canAdmin(ctx)
    ) {
      return {
        success: false,
        error: "Access denied — full content for HR, legal, and executive documents requires administrator access.",
      };
    }

    // Load content row
    const { data: contentRow, error: contentErr } = await supabase
      .from("dms_document_content")
      .select(
        "document_id, content_text, content_text_updated_at, content_text_source, content_text_sha256, content_text_char_count, is_truncated"
      )
      .eq("document_id", documentId)
      .single();

    if (contentErr && contentErr.code !== "PGRST116") {
      return { success: false, error: contentErr.message };
    }

    if (!contentRow) {
      return {
        success: true,
        data: {
          documentId,
          contentText: null,
          source: null,
          charCount: null,
          isTruncated: false,
          sha256: null,
          updatedAt: null,
        },
      };
    }

    const row = contentRow as Record<string, unknown>;

    return {
      success: true,
      data: {
        documentId,
        contentText: (row.content_text as string | null) ?? null,
        source: (row.content_text_source as ContentTextSource | null) ?? null,
        charCount: (row.content_text_char_count as number | null) ?? null,
        isTruncated: (row.is_truncated as boolean | null) ?? false,
        sha256: (row.content_text_sha256 as string | null) ?? null,
        updatedAt: (row.content_text_updated_at as string | null) ?? null,
      },
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── adminBackfillDmsContentText ───────────────────────────────────────────────

const BackfillSchema = z.object({
  batchSize: z.number().int().min(1).max(100).optional().default(50),
  resumeFromDocumentId: z.number().int().positive().optional(),
  dryRun: z.boolean().optional().default(false),
});

export async function adminBackfillDmsContentText(
  input: z.infer<typeof BackfillSchema>
): Promise<
  ActionResult<{
    processed: number;
    skipped: number;
    errors: Array<{ documentId: number; error: string }>;
    nextResumeDocumentId: number | null;
  }>
> {
  try {
    const parsed = BackfillSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

    const { batchSize, resumeFromDocumentId, dryRun } = parsed.data;

    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canAdmin(ctx)) return { success: false, error: "Permission denied — requires dms.admin" };

    // Find documents that have OCR text but no content row yet
    let docsQuery = supabase
      .from("dms_documents")
      .select("id")
      .is("deleted_at", null)
      .eq("ocr_text_available", true)
      .not("id", "in",
        `(SELECT document_id FROM dms_document_content)`
      )
      .order("id", { ascending: true })
      .limit(batchSize + 1);

    if (resumeFromDocumentId) {
      docsQuery = docsQuery.gte("id", resumeFromDocumentId);
    }

    const { data: docRows, error: docsErr } = await docsQuery;
    if (docsErr) return { success: false, error: docsErr.message };

    const rows = (docRows ?? []) as Array<{ id: number }>;
    const hasMore = rows.length > batchSize;
    const batch = hasMore ? rows.slice(0, batchSize) : rows;
    const nextResumeDocumentId = hasMore ? rows[batchSize]?.id ?? null : null;

    let processed = 0;
    let skipped = 0;
    const errors: Array<{ documentId: number; error: string }> = [];

    for (const row of batch) {
      try {
        // Load current-version OCR text
        const { data: docDetail } = await supabase
          .from("dms_documents")
          .select("id, current_version_id")
          .eq("id", row.id)
          .single();

        let filesQuery = supabase
          .from("dms_document_files")
          .select("id, file_name, ocr_text")
          .eq("document_id", row.id)
          .eq("ocr_status", "complete")
          .is("deleted_at", null)
          .order("created_at", { ascending: true });

        if (docDetail?.current_version_id) {
          filesQuery = filesQuery.eq("version_id", docDetail.current_version_id);
        }

        const { data: files } = await filesQuery;
        const usableFiles = (files ?? []).filter((f) => (f.ocr_text as string | null)?.trim());

        if (usableFiles.length === 0) {
          skipped++;
          continue;
        }

        const consolidatedText = usableFiles
          .map((f, i) =>
            i === 0
              ? normalizeDmsContentText((f.ocr_text as string) ?? "")
              : contentTextFileSeparator(f.file_name as string) +
                normalizeDmsContentText((f.ocr_text as string) ?? "")
          )
          .join("");

        if (!dryRun) {
          const result = await writeDocumentContentTextSystem({
            documentId: row.id,
            text: consolidatedText,
            source: "system_resync",
            performedBy: ctx.profile.id as number,
          });

          if (!result.success) {
            errors.push({ documentId: row.id, error: result.error ?? "Unknown error" });
            continue;
          }
        }

        processed++;
      } catch (rowErr) {
        errors.push({ documentId: row.id, error: String(rowErr) });
      }
    }

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_document_content",
      entity_id: 0,
      entity_reference: "BACKFILL",
      action: "update",
      new_values: {
        action: "dms_content_text_backfill",
        batch_size: batchSize,
        dry_run: dryRun,
        processed,
        skipped,
        error_count: errors.length,
        resume_from: resumeFromDocumentId ?? null,
        next_resume: nextResumeDocumentId,
      },
    });

    return {
      success: true,
      data: { processed, skipped, errors, nextResumeDocumentId },
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
