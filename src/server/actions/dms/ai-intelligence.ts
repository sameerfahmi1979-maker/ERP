"use server";

/**
 * DMS 12.3 — Combined Intelligence and Bulk Evaluation Actions
 *
 * Provides:
 *  - evaluateDmsDocumentIntelligence(documentId) — runs completeness then risk
 *  - bulkEvaluateDmsDocuments(input) — admin-only batch scoring
 *
 * No AI calls. Deterministic scoring only.
 * Never logs content_text, OCR text, or AI responses.
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { logAudit } from "@/server/actions/audit";
import { revalidatePath } from "next/cache";
import { evaluateDmsDocumentCompleteness } from "./ai-completeness";
import { evaluateDmsDocumentRisk } from "./ai-risk";

type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

function isAdminUser(ctx: Awaited<ReturnType<typeof getAuthContext>>): boolean {
  return (
    hasPermission(ctx, "dms.admin") ||
    ctx.roleCodes.includes("system_admin")
  );
}

// ── Combined single-document evaluation ──────────────────────────────────────

export async function evaluateDmsDocumentIntelligence(
  documentId: number
): Promise<ActionResult<{
  documentId: number;
  completenessScore: number | null;
  completenessLabel: string | null;
  riskScore: number | null;
  riskLevel: string | null;
}>> {
  try {
    const parsed = z.number().int().positive().safeParse(documentId);
    if (!parsed.success) return { success: false, error: "Invalid document ID" };

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (
      !hasPermission(ctx, "dms.documents.edit") &&
      !hasPermission(ctx, "dms.admin") &&
      !ctx.roleCodes.includes("system_admin")
    ) {
      return { success: false, error: "Permission denied — requires dms.documents.edit or dms.admin" };
    }

    const completenessResult = await evaluateDmsDocumentCompleteness(documentId);
    const riskResult = await evaluateDmsDocumentRisk(documentId);

    revalidatePath(`/dms/documents/record/${documentId}`);
    revalidatePath("/dms/documents");

    if (!completenessResult.success && !riskResult.success) {
      return {
        success: false,
        error: `Completeness: ${completenessResult.error ?? "failed"} | Risk: ${riskResult.error ?? "failed"}`,
      };
    }

    return {
      success: true,
      data: {
        documentId,
        completenessScore: completenessResult.data?.completenessScore ?? null,
        completenessLabel: completenessResult.data?.completenessLabel ?? null,
        riskScore: riskResult.data?.riskScore ?? null,
        riskLevel: riskResult.data?.riskLevel ?? null,
      },
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── Bulk evaluation ───────────────────────────────────────────────────────────

const BulkEvalSchema = z.object({
  batchSize: z.number().int().min(1).max(100).optional().default(50),
  resumeFromDocumentId: z.number().int().positive().optional(),
  dryRun: z.boolean().optional().default(false),
});

export async function bulkEvaluateDmsDocuments(
  input: z.infer<typeof BulkEvalSchema>
): Promise<ActionResult<{
  processed: number;
  failed: number;
  errors: Array<{ documentId: number; documentNo?: string; error: string }>;
  nextResumeFromDocumentId: number | null;
}>> {
  try {
    const parsed = BulkEvalSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

    const { batchSize, resumeFromDocumentId, dryRun } = parsed.data;

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!isAdminUser(ctx)) {
      return { success: false, error: "Permission denied — requires dms.admin" };
    }

    const supabase = await createClient();

    let docsQuery = supabase
      .from("dms_documents")
      .select("id, document_no")
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .limit(batchSize + 1);

    if (resumeFromDocumentId) {
      docsQuery = docsQuery.gte("id", resumeFromDocumentId);
    }

    const { data: docRows, error: docsErr } = await docsQuery;
    if (docsErr) return { success: false, error: "Failed to query documents: " + docsErr.message };

    const rows = (docRows ?? []) as Array<{ id: number; document_no: string }>;
    const hasMore = rows.length > batchSize;
    const batch = hasMore ? rows.slice(0, batchSize) : rows;
    const nextResumeFromDocumentId = hasMore ? (rows[batchSize]?.id ?? null) : null;

    if (dryRun) {
      return {
        success: true,
        data: {
          processed: 0,
          failed: 0,
          errors: [],
          nextResumeFromDocumentId: hasMore ? nextResumeFromDocumentId : null,
        },
      };
    }

    let processed = 0;
    let failed = 0;
    const errors: Array<{ documentId: number; documentNo?: string; error: string }> = [];

    for (const row of batch) {
      try {
        const completenessResult = await evaluateDmsDocumentCompleteness(row.id);
        const riskResult = await evaluateDmsDocumentRisk(row.id);

        if (completenessResult.success || riskResult.success) {
          processed++;
        } else {
          failed++;
          errors.push({
            documentId: row.id,
            documentNo: row.document_no,
            error: `Completeness: ${completenessResult.error ?? "ok"} | Risk: ${riskResult.error ?? "ok"}`,
          });
        }
      } catch (rowErr) {
        failed++;
        errors.push({ documentId: row.id, documentNo: row.document_no, error: String(rowErr) });
      }
    }

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_documents",
      entity_id: 0,
      entity_reference: "BULK_INTELLIGENCE",
      action: "update",
      new_values: {
        action: "bulk_intelligence_evaluated",
        batch_size: batchSize,
        processed,
        failed,
        resume_from: resumeFromDocumentId ?? null,
        next_resume: nextResumeFromDocumentId,
      },
    });

    revalidatePath("/dms/documents");

    return {
      success: true,
      data: { processed, failed, errors, nextResumeFromDocumentId },
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
