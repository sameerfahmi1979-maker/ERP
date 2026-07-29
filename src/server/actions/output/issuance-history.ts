"use server";

/**
 * OUTPUT.4 — Issuance history, download, revoke, and reissue actions.
 *
 * Backs the Employee "Letters & Forms" experience (and later the Ops Console):
 *  - listRecordIssuances: per-record issuance history with derived status
 *  - getIssuanceDownloadUrl: permissioned short-lived signed URL + audit
 *  - revokeIssuance: policy-controlled revoke (cancels the public QR link too)
 *  - reissueOfficialDocument: authorized reissue that supersedes a prior issuance
 */

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission, type AuthContext } from "@/lib/rbac/check";
import { logAudit } from "@/server/actions/audit";
import { createPdfSignedUrl } from "@/lib/pdf/storage";
import { generateOfficialDocument } from "@/server/actions/output/generate-official-document";
import type { GenerateOfficialDocumentOutcome } from "@/lib/output/types";

type ActionResult<T = unknown> = { success: boolean; data?: T; error?: string };

export type { IssuanceDisplayStatus } from "@/lib/output/issuance-status";
import {
  deriveIssuanceDisplayStatus,
  type IssuanceDisplayStatus,
} from "@/lib/output/issuance-status";

export interface IssuanceHistoryItem {
  id: number;
  output_code: string | null;
  document_class: string | null;
  file_name: string;
  lifecycle_state: string | null;
  status: IssuanceDisplayStatus;
  generated_at: string;
  issued_at: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
  expires_at: string | null;
  superseded_by_id: number | null;
  supersedes_issuance_id: number | null;
  serial_no: string | null;
  file_size_bytes: number | null;
  checksum: string | null;
  failure_reason: string | null;
}

async function assertCompanyAccess(
  ctx: AuthContext,
  ownerCompanyId: number
): Promise<boolean> {
  if (ctx.roleCodes.includes("system_admin") || ctx.roleCodes.includes("group_admin")) return true;
  const db = createAdminClient();
  const { data } = await db
    .from("user_roles")
    .select("owner_company_id")
    .eq("user_profile_id", ctx.profile?.id ?? 0)
    .eq("is_active", true)
    .not("owner_company_id", "is", null);
  return (data ?? []).some((r: { owner_company_id: number | null }) => r.owner_company_id === ownerCompanyId);
}

// ─────────────────────────────────────────────────────────────────────────────
// History
// ─────────────────────────────────────────────────────────────────────────────

export interface RecordIssuanceHistory {
  items: IssuanceHistoryItem[];
  /** Current user may revoke issued documents. */
  canRevoke: boolean;
  /** Current user may authorize a superseding reissue. */
  canReissue: boolean;
  /** Current user may permanently delete any document record (system_admin only). */
  canDelete: boolean;
}

export async function listRecordIssuances(input: {
  sourceRecordType: string;
  recordId: number;
}): Promise<ActionResult<RecordIssuanceHistory>> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "reports.view") && !hasPermission(ctx, "hr.employees.view")) {
    return { success: false, error: "You do not have permission to view document history." };
  }

  const db = createAdminClient();
  const { data, error } = await db
    .from("erp_generated_pdf_documents")
    .select(
      "id, output_code, document_class, file_name, lifecycle_state, generated_at, issued_at, revoked_at, revoke_reason, expires_at, superseded_by_id, supersedes_issuance_id, serial_no, file_size_bytes, checksum, failure_reason, owner_company_id"
    )
    .eq("source_record_type", input.sourceRecordType)
    .eq("source_record_id", input.recordId)
    .not("output_code", "is", null)
    .order("generated_at", { ascending: false })
    .limit(200);

  if (error) return { success: false, error: error.message };

  // Company scope: filter out rows the user's companies don't cover.
  const isGlobal = ctx.roleCodes.includes("system_admin") || ctx.roleCodes.includes("group_admin");
  let allowedCompanyIds: Set<number> | null = null;
  if (!isGlobal) {
    const { data: roles } = await db
      .from("user_roles")
      .select("owner_company_id")
      .eq("user_profile_id", ctx.profile?.id ?? 0)
      .eq("is_active", true)
      .not("owner_company_id", "is", null);
    allowedCompanyIds = new Set(
      (roles ?? [])
        .map((r: { owner_company_id: number | null }) => r.owner_company_id)
        .filter((id): id is number => id !== null)
    );
  }

  const items = (data ?? [])
    .filter((r) => allowedCompanyIds === null || allowedCompanyIds.has(r.owner_company_id as number))
    .map((r) => ({
      id: r.id as number,
      output_code: r.output_code,
      document_class: r.document_class,
      file_name: r.file_name,
      lifecycle_state: r.lifecycle_state,
      status: deriveIssuanceDisplayStatus(r as never),
      generated_at: r.generated_at,
      issued_at: r.issued_at,
      revoked_at: r.revoked_at,
      revoke_reason: r.revoke_reason,
      expires_at: r.expires_at,
      superseded_by_id: r.superseded_by_id,
      supersedes_issuance_id: r.supersedes_issuance_id,
      serial_no: r.serial_no,
      file_size_bytes: r.file_size_bytes,
      checksum: r.checksum,
      failure_reason: r.failure_reason,
    }));

  return {
    success: true,
    data: {
      items,
      canRevoke: hasPermission(ctx, "outputs.ops.revoke") || hasPermission(ctx, "reports.pdf.approve"),
      canReissue: hasPermission(ctx, "reports.pdf.approve") || hasPermission(ctx, "outputs.ops.retry"),
      /** canDelete = may remove FAILED generation artifacts only — never issued documents. */
      canDelete: ctx.roleCodes.includes("system_admin") || ctx.roleCodes.includes("group_admin"),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Download
// ─────────────────────────────────────────────────────────────────────────────

export async function getIssuanceDownloadUrl(
  issuanceId: number
): Promise<ActionResult<{ url: string; fileName: string }>> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "reports.view") && !hasPermission(ctx, "hr.employees.view")) {
    return { success: false, error: "You do not have permission to download documents." };
  }

  const db = createAdminClient();
  const { data: doc, error } = await db
    .from("erp_generated_pdf_documents")
    .select("id, storage_path, file_name, owner_company_id, lifecycle_state, revoked_at, output_code")
    .eq("id", issuanceId)
    .single();
  if (error || !doc) return { success: false, error: "Document not found." };

  if (!(await assertCompanyAccess(ctx, doc.owner_company_id as number))) {
    return { success: false, error: "You do not have access to this document's company." };
  }
  if (doc.lifecycle_state !== "issued") {
    return { success: false, error: "Only issued documents can be downloaded." };
  }
  if (doc.revoked_at) {
    return { success: false, error: "This document has been revoked and can no longer be downloaded." };
  }

  const url = await createPdfSignedUrl(doc.storage_path as string, 600);

  await logAudit({
    module_code: "reports",
    entity_name: "erp_generated_pdf_documents",
    entity_id: issuanceId,
    entity_reference: doc.output_code ?? String(issuanceId),
    action: "view",
    new_values: { event: "output_downloaded", file_name: doc.file_name },
  }).catch(() => {});

  return { success: true, data: { url, fileName: doc.file_name as string } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Revoke
// ─────────────────────────────────────────────────────────────────────────────

const revokeSchema = z.object({
  issuanceId: z.number().int().positive(),
  reason: z.string().min(5).max(1000),
});

export async function revokeIssuance(
  input: z.infer<typeof revokeSchema>
): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "outputs.ops.revoke") && !hasPermission(ctx, "reports.pdf.approve")) {
    return { success: false, error: "You do not have permission to revoke issued documents." };
  }
  const parsed = revokeSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "A revoke reason (min 5 characters) is required." };

  const db = createAdminClient();
  const { data: doc, error } = await db
    .from("erp_generated_pdf_documents")
    .select("id, owner_company_id, lifecycle_state, revoked_at, output_code, file_name")
    .eq("id", parsed.data.issuanceId)
    .single();
  if (error || !doc) return { success: false, error: "Document not found." };
  if (!(await assertCompanyAccess(ctx, doc.owner_company_id as number))) {
    return { success: false, error: "You do not have access to this document's company." };
  }
  if (doc.lifecycle_state !== "issued") {
    return { success: false, error: "Only issued documents can be revoked." };
  }
  if (doc.revoked_at) return { success: false, error: "Document is already revoked." };

  const now = new Date().toISOString();
  const { error: updateError } = await db
    .from("erp_generated_pdf_documents")
    .update({
      revoked_at: now,
      revoked_by: ctx.profile?.id ?? null,
      revoke_reason: parsed.data.reason,
    })
    .eq("id", doc.id)
    .is("revoked_at", null);
  if (updateError) return { success: false, error: updateError.message };

  // Cancel the linked public verification link(s) — a revoked document must not verify.
  await db
    .from("erp_output_public_links")
    .update({ status: "cancelled", updated_at: now, updated_by: ctx.profile?.id ?? null })
    .eq("generated_pdf_document_id", doc.id)
    .in("status", ["valid", "pending_activation"]);

  await logAudit({
    module_code: "reports",
    entity_name: "erp_generated_pdf_documents",
    entity_id: doc.id,
    entity_reference: doc.output_code ?? String(doc.id),
    action: "update",
    new_values: { event: "output_revoked", reason: parsed.data.reason, file_name: doc.file_name },
  }).catch(() => {});

  return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Reissue (supersede)
// ─────────────────────────────────────────────────────────────────────────────

const reissueSchema = z.object({
  issuanceId: z.number().int().positive(),
  reason: z.string().min(5).max(1000),
  issueQr: z.boolean().default(false),
});

export async function reissueOfficialDocument(
  input: z.infer<typeof reissueSchema>
): Promise<GenerateOfficialDocumentOutcome> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "reports.pdf.approve") && !hasPermission(ctx, "outputs.ops.retry")) {
    return {
      success: false,
      blocked: "permission_denied",
      error: "Reissuing requires approval permission (reports.pdf.approve).",
    };
  }
  const parsed = reissueSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, blocked: "validation_failed", error: "A reissue reason (min 5 characters) is required." };
  }

  const db = createAdminClient();
  const { data: doc, error } = await db
    .from("erp_generated_pdf_documents")
    .select(
      "id, output_code, source_record_type, source_record_id, template_id, owner_company_id, lifecycle_state, data_snapshot_json"
    )
    .eq("id", parsed.data.issuanceId)
    .single();
  if (error || !doc || !doc.output_code) {
    return { success: false, blocked: "validation_failed", error: "Original issuance not found." };
  }
  if (doc.lifecycle_state !== "issued") {
    return { success: false, blocked: "validation_failed", error: "Only issued documents can be superseded by a reissue." };
  }

  // OFFICIAL DOCS.1: catalog documents record language + optional inputs in the
  // data snapshot. A superseding copy MUST keep the same variant — a bilingual
  // letter must not silently reissue as English.
  const snapshot = (doc.data_snapshot_json ?? {}) as {
    language?: "en" | "ar" | "bilingual";
    inputs?: Record<string, string>;
  };

  const outcome = await generateOfficialDocument(doc.output_code as string, doc.source_record_id as number, {
    templateId: (doc.template_id as number | null) ?? undefined,
    issueQr: parsed.data.issueQr,
    authorizeReissue: true,
    supersedesIssuanceId: doc.id as number,
    clientRequestToken: `reissue-${doc.id}-${Date.now()}`,
    language: snapshot.language,
    inputs: snapshot.inputs,
  });

  if (outcome.success && outcome.issuanceId) {
    // Mark the old issuance as superseded by the new one.
    await db
      .from("erp_generated_pdf_documents")
      .update({ superseded_by_id: outcome.issuanceId })
      .eq("id", doc.id)
      .is("superseded_by_id", null);

    await logAudit({
      module_code: "reports",
      entity_name: "erp_generated_pdf_documents",
      entity_id: doc.id,
      entity_reference: doc.output_code as string,
      action: "update",
      new_values: {
        event: "output_superseded",
        reason: parsed.data.reason,
        superseded_by_id: outcome.issuanceId,
      },
    }).catch(() => {});
  }

  return outcome;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cleanup of failed generation artifacts (system_admin only)
//
// GOVERNANCE: Issued official documents are immutable records. Hard deletion is
// NEVER permitted for any document in the `issued` lifecycle state. Use
// revokeIssuance to invalidate a document — the DB row, PDF, hash, audit trail,
// and supersession links are all retained. Serial numbers are never reused.
//
// This action is ONLY permitted for documents that failed before reaching the
// `issued` state (failed_retryable, failed_terminal, cancelled, pending orphans)
// and have no associated official issuance record.
// ─────────────────────────────────────────────────────────────────────────────

const DELETABLE_LIFECYCLE_STATES = new Set([
  "failed_retryable",
  "failed_terminal",
  "cancelled",
  "pending",
]);

export async function deleteIssuance(input: { issuanceId: number }): Promise<ActionResult<void>> {
  const ctx = await getAuthContext();
  const isGlobalAdmin = ctx.roleCodes.includes("system_admin") || ctx.roleCodes.includes("group_admin");
  if (!isGlobalAdmin) {
    return { success: false, error: "Only System Administrators can remove failed document artifacts." };
  }

  const db = createAdminClient();
  const { data: doc, error: fetchErr } = await db
    .from("erp_generated_pdf_documents")
    .select("id, storage_path, file_name, output_code, lifecycle_state, serial_no, issued_at")
    .eq("id", input.issuanceId)
    .single();

  if (fetchErr || !doc) return { success: false, error: "Document not found." };

  // IMMUTABILITY GUARD — issued documents can NEVER be hard-deleted.
  // `uploaded` is also protected: it reached storage before the issued transition.
  if (
    doc.lifecycle_state === "issued" ||
    doc.lifecycle_state === "uploaded" ||
    doc.lifecycle_state === "rendering"
  ) {
    return {
      success: false,
      error:
        `Official document '${doc.file_name}' is in state '${doc.lifecycle_state}' and cannot be permanently deleted. ` +
        "Issued documents are immutable records. Use Revoke to invalidate the document while retaining the compliance record, " +
        "or Generate New to create a fresh issuance.",
    };
  }

  if (!DELETABLE_LIFECYCLE_STATES.has(doc.lifecycle_state as string)) {
    return {
      success: false,
      error: `Document lifecycle state '${doc.lifecycle_state}' does not permit deletion.`,
    };
  }

  // For failed artifacts, remove any orphan storage object (these were never
  // officially issued and may not exist — best-effort only).
  if (doc.storage_path) {
    await db.storage.from("erp-generated-pdfs").remove([doc.storage_path as string]).catch(() => {});
  }

  // Clear self-referencing FK columns on rows that supersede/were superseded by this one
  await db
    .from("erp_generated_pdf_documents")
    .update({ superseded_by_id: null })
    .eq("superseded_by_id", input.issuanceId);
  await db
    .from("erp_generated_pdf_documents")
    .update({ supersedes_issuance_id: null })
    .eq("supersedes_issuance_id", input.issuanceId);

  const { error: delErr } = await db
    .from("erp_generated_pdf_documents")
    .delete()
    .eq("id", input.issuanceId);

  if (delErr) return { success: false, error: delErr.message };

  await logAudit({
    module_code: "reports",
    action: "delete",
    entity_name: "erp_generated_pdf_documents",
    entity_id: input.issuanceId,
    entity_reference: (doc.output_code as string | null) ?? String(input.issuanceId),
    new_values: { event: "output_failed_artifact_removed", file_name: doc.file_name, lifecycle_state: doc.lifecycle_state },
  }).catch(() => {});

  return { success: true };
}