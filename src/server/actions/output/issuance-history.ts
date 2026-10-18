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
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission, isGlobalAdmin } from "@/lib/rbac/check";
import { canAccessIssuedFile, issuedFileUrl } from "@/lib/output/issued-file-access";
import { getEmployeeAccess } from "@/lib/rbac/employee-access";
import { generateOfficialDocument } from "@/server/actions/output/generate-official-document";
import type { GenerateOfficialDocumentOutcome } from "@/lib/output/types";

type ActionResult<T = unknown> = { success: boolean; data?: T; error?: string };

export type { IssuanceDisplayStatus } from "@/lib/output/issuance-status";
import {
  deriveIssuanceDisplayStatus,
  type IssuanceDisplayStatus,
} from "@/lib/output/issuance-status";

export interface IssuanceHistoryItem {
  can_recover?: boolean;
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

// ─────────────────────────────────────────────────────────────────────────────
// History
// ─────────────────────────────────────────────────────────────────────────────

export interface RecordIssuanceHistory {
  items: IssuanceHistoryItem[];
  /** Current user may revoke issued documents. */
  canRevoke: boolean;
  /** Current user may authorize a superseding reissue. */
  canReissue: boolean;
  /** Permanent disposal stays disabled pending approved retention governance. */
  canDelete: boolean;
}

export async function listRecordIssuances(input: {
  sourceRecordType: string;
  recordId: number;
}): Promise<ActionResult<RecordIssuanceHistory>> {
  const ctx = await getAuthContext();
  if (input.sourceRecordType !== "employee" || !Number.isSafeInteger(input.recordId) || input.recordId <= 0) return { success: false, error: "Invalid employee record." };
  let access;
  try { access = await getEmployeeAccess(ctx, input.recordId); }
  catch { return { success: false, error: "Document history is unavailable or access is denied." }; }
  const db = await createClient();
  const { data, error } = await db
    .from("erp_generated_pdf_documents")
    .select(
      "id, output_code, document_class, file_name, lifecycle_state, generated_at, issued_at, revoked_at, revoke_reason, expires_at, superseded_by_id, supersedes_issuance_id, serial_no, file_size_bytes, checksum, failure_reason, owner_company_id, generated_by"
    )
    .eq("source_record_type", input.sourceRecordType)
    .eq("source_record_id", input.recordId)
    .not("output_code", "is", null)
    .order("generated_at", { ascending: false })
    .limit(200);

  if (error) return { success: false, error: error.message };

  // RLS applies the employee relationship, branch and each output's sensitive permissions.
  const items = (data ?? [])
    .map((r) => ({
      id: r.id as number,
      can_recover: r.generated_by === ctx.profile?.id && access.allows("reports.pdf.generate") && access.allows("reports.run") && ["pending", "rendering", "uploaded", "failed_retryable", "reconciliation_required"].includes(r.lifecycle_state ?? ""),
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
      canRevoke: access.allows("outputs.ops.revoke") || access.allows("reports.pdf.approve"),
      canReissue: access.allows("reports.pdf.approve") || access.allows("outputs.ops.retry"),
      canDelete: false,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Download
// ─────────────────────────────────────────────────────────────────────────────

export async function getIssuanceDownloadUrl(
  issuanceId: number
): Promise<ActionResult<{ url: string; fileName: string }>> {
  if (!(await canAccessIssuedFile(issuanceId, "download"))) {
    return { success: false, error: "You do not have permission to download documents." };
  }

  const db = await createClient();
  const { data: doc, error } = await db
    .from("erp_generated_pdf_documents")
    .select("id, storage_path, file_name, owner_company_id, lifecycle_state, revoked_at, output_code")
    .eq("id", issuanceId)
    .single();
  if (error || !doc) return { success: false, error: "Document not found." };

  if (doc.lifecycle_state !== "issued") {
    return { success: false, error: "Only issued documents can be downloaded." };
  }
  if (doc.revoked_at) {
    return { success: false, error: "This document has been revoked and can no longer be downloaded." };
  }

  // Actual bytes, lifecycle and audit are checked by the endpoint on every request.
  return { success: true, data: { url: issuedFileUrl(issuanceId), fileName: doc.file_name as string } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Revoke
// ─────────────────────────────────────────────────────────────────────────────

const revokeSchema = z.object({
  issuanceId: z.number().int().positive(),
  reason: z.string().trim().min(5).max(1000),
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
  if (!(await canAccessIssuedFile(parsed.data.issuanceId, "outputs.ops.revoke")) && !(await canAccessIssuedFile(parsed.data.issuanceId, "reports.pdf.approve"))) return { success: false, error: "Document unavailable or access denied." };

  // Parent, public links and mandatory audit commit (or roll back) together.
  const result = await (await createClient()).rpc("f08_revoke_output", {
    p_id: parsed.data.issuanceId, p_reason: parsed.data.reason,
  });
  if (result.error || result.data?.id !== parsed.data.issuanceId) return {
    success: false, error: "Revocation was not confirmed. Refresh the original history before retrying.",
  };
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Reissue (supersede)
// ─────────────────────────────────────────────────────────────────────────────

const reissueSchema = z.object({
  issuanceId: z.number().int().positive(),
  reason: z.string().trim().min(5).max(1000),
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
  if (!(await canAccessIssuedFile(parsed.data.issuanceId, "reports.pdf.approve")) && !(await canAccessIssuedFile(parsed.data.issuanceId, "outputs.ops.retry"))) return { success: false, blocked: "permission_denied", error: "Document unavailable or access denied." };

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
    reissueReason: parsed.data.reason,
    // A response-loss retry must keep the original command identity.
    clientRequestToken: `reissue-${createHash("sha256").update(JSON.stringify([
      ctx.profile?.id, doc.id, parsed.data.reason, parsed.data.issueQr,
    ])).digest("hex")}`,
    language: snapshot.language,
    inputs: snapshot.inputs,
  });

  if (outcome.success && outcome.issuanceId) {
    // Finalization owns both graph edges and audit. Never repair half a graph here.
    const original = await db.from("erp_generated_pdf_documents").select("superseded_by_id").eq("id", doc.id).single();
    const replacement = await db.from("erp_generated_pdf_documents").select("supersedes_issuance_id,lifecycle_state").eq("id", outcome.issuanceId).single();
    if (original.error || replacement.error || original.data?.superseded_by_id !== outcome.issuanceId ||
      replacement.data?.supersedes_issuance_id !== doc.id || replacement.data?.lifecycle_state !== "issued") {
      return { success: false, blocked: "reconciliation_required", error: "Replacement was not confirmed. Reconcile this request; do not create another issuance." };
    }
  }

  return outcome;
}

/** Failed artifacts may still contain committed bytes, serials and recovery evidence.
 * No permanent removal is permitted until retention/provenance policy is approved.
 */
export async function deleteIssuance(_input: { issuanceId: number }): Promise<ActionResult<void>> {
  void _input;
  const ctx = await getAuthContext();
  if (!isGlobalAdmin(ctx)) return { success: false, error: "Only System Administrators may review retained document artifacts." };
  return { success: false, error: "Permanent removal is disabled pending approved retention governance. Original files, serials and recovery history are retained." };
}
