"use server";

/**
 * OUTPUT.6 (WP10) — Global Output Operations Console server actions.
 *
 * Module-agnostic administrator surface over the issuance lifecycle:
 *  - listOpsIssuances:      paginated, server-filtered all-module history
 *  - getOpsIssuanceDetail:  full operational metadata (snapshots, QR, chain)
 *  - retryOpsIssuance:      permissioned idempotent retry of retryable failures
 *  - cancelOpsIssuance:     permissioned cancel of non-terminal rows
 *  - getOpsMetrics:         state counts, timings, renderer health (no secrets)
 *
 * Separation of duties: `outputs.ops.*` grants operational METADATA access.
 * Protected document CONTENT stays behind document-level permissions —
 * the Console never returns signed download URLs; it reuses
 * `getIssuanceDownloadUrl` (issuance-history.ts) which enforces them.
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { canAccessIssuedFile } from "@/lib/output/issued-file-access";
import { getAuthContext, hasPermission, type AuthContext } from "@/lib/rbac/check";
import { recoverOfficialDocument } from "@/server/actions/output/recover-official-document";
import { logAudit } from "@/server/actions/audit";
import { isGotenbergHealthy } from "@/lib/pdf/gotenberg";
import {
  canTransition,
  type LifecycleState,
} from "@/lib/output/lifecycle";
import { isOutputOpsConsoleEnabled } from "@/lib/output/feature-flags";
import type { GenerateOfficialDocumentOutcome } from "@/lib/output/types";

type ActionResult<T = unknown> = { success: boolean; data?: T; error?: string };

// ─────────────────────────────────────────────────────────────────────────────
// Guards
// ─────────────────────────────────────────────────────────────────────────────

async function requireOps(
  permission: "outputs.ops.view" | "outputs.ops.retry" | "outputs.ops.revoke"
): Promise<{ ctx: AuthContext } | { error: string }> {
  if (!isOutputOpsConsoleEnabled()) return { error: "The Output Operations Console is not enabled." };
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, permission)) {
    return { error: `You do not have the required permission (${permission}).` };
  }
  return { ctx };
}

// ─────────────────────────────────────────────────────────────────────────────
// List
// ─────────────────────────────────────────────────────────────────────────────

const listFiltersSchema = z.object({
  page: z.number().int().min(0).default(0),
  pageSize: z.number().int().min(1).max(100).default(25),
  lifecycleState: z.string().optional(),
  documentClass: z.string().optional(),
  outputCode: z.string().optional(),
  ownerCompanyId: z.number().int().optional(),
  renderer: z.string().optional(),
  generatedBy: z.number().int().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  search: z.string().max(120).optional(),
});
export type OpsListFilters = z.input<typeof listFiltersSchema>;

export interface OpsIssuanceRow {
  id: number;
  output_code: string | null;
  template_key: string;
  document_class: string | null;
  lifecycle_state: string | null;
  serial_no: string | null;
  serial_status: string | null;
  owner_company_id: number;
  source_record_type: string;
  source_record_id: number;
  file_name: string;
  file_size_bytes: number | null;
  renderer: string | null;
  renderer_version: string | null;
  generated_by: number | null;
  generated_at: string;
  issued_at: string | null;
  failed_at: string | null;
  cancelled_at: string | null;
  revoked_at: string | null;
  superseded_by_id: number | null;
  failure_reason: string | null;
  /** ms from generation to issue (null while in flight / failed). */
  total_duration_ms: number | null;
  qr_status: string | null;
  canRetry: boolean;
  canRevoke: boolean;
}

export interface OpsIssuanceList {
  rows: OpsIssuanceRow[];
  total: number;
  canRetry: boolean;
  canRevoke: boolean;
}

export async function listOpsIssuances(input: OpsListFilters): Promise<ActionResult<OpsIssuanceList>> {
  const gate = await requireOps("outputs.ops.view");
  if ("error" in gate) return { success: false, error: gate.error };
  const parsed = listFiltersSchema.safeParse(input ?? {});
  if (!parsed.success) return { success: false, error: "Invalid issuance filters." };

  try {
    const { search, ...filters } = parsed.data;
    const sanitizedSearch = search?.replace(/[%,()]/g, "").trim();
    const { data, error } = await (await createClient()).rpc("speed_output_ops_read", {
      p_mode: "list", p_input: { ...filters, ...(sanitizedSearch ? { search: sanitizedSearch } : {}) },
    });
    const result = data as Pick<OpsIssuanceList, "rows" | "total"> | null;
    if (error || !result || !Array.isArray(result.rows) || result.rows.length > filters.pageSize ||
        !Number.isSafeInteger(result.total) || result.total < result.rows.length) {
      return { success: false, error: "Issuance history could not be verified." };
    }
    return {
      success: true,
      data: {
        ...result,
        canRetry: hasPermission(gate.ctx, "outputs.ops.retry"),
        canRevoke: hasPermission(gate.ctx, "outputs.ops.revoke"),
      },
    };
  } catch {
    return { success: false, error: "Issuance history could not be verified." };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Detail
// ─────────────────────────────────────────────────────────────────────────────

export interface OpsIssuanceDetail extends OpsIssuanceRow {
  request_key: string | null;
  content_fingerprint: string | null;
  checksum: string | null;
  checksum_algorithm: string | null;
  chromium_version: string | null;
  template_id: number | null;
  template_version: number | null;
  locale: string | null;
  direction: string | null;
  page_count: number | null;
  rendering_started_at: string | null;
  uploaded_at: string | null;
  reconciled_at: string | null;
  revoke_reason: string | null;
  serial_void_reason: string | null;
  supersedes_issuance_id: number | null;
  expires_at: string | null;
  policy_snapshot_json: unknown;
  branding_snapshot_json: unknown;
  /** Data snapshot is sensitive — only included with document-level view rights. */
  data_snapshot_json: unknown | null;
  /** True when the snapshot exists but was withheld for lack of document-level rights. */
  data_snapshot_hidden: boolean;
  qr_links: Array<{
    id: number;
    status: string;
    issued_at: string | null;
    expires_at: string | null;
    cancelled_at: string | null;
    cancel_reason: string | null;
    view_count: number | null;
  }>;
  stage_durations_ms: {
    queue: number | null;
    render: number | null;
    upload_finalize: number | null;
    total: number | null;
  };
}

export async function getOpsIssuanceDetail(issuanceId: number): Promise<ActionResult<OpsIssuanceDetail>> {
  const gate = await requireOps("outputs.ops.view");
  if ("error" in gate) return { success: false, error: gate.error };
  const denied = { success: false, error: "Issuance not found or access denied." };
  if (!Number.isSafeInteger(issuanceId) || issuanceId <= 0) return denied;

  try {
    const { data, error } = await (await createClient()).rpc("speed_output_ops_read", {
      p_mode: "detail", p_input: { id: issuanceId },
    });
    const detail = data as Omit<OpsIssuanceDetail, "stage_durations_ms"> | null;
    if (error || detail?.id !== issuanceId || !Array.isArray(detail.qr_links)) return denied;

    const stamp = (v: string | null) => v ? new Date(v).getTime() : null;
    const generated = stamp(detail.generated_at), rendering = stamp(detail.rendering_started_at);
    const uploaded = stamp(detail.uploaded_at), issued = stamp(detail.issued_at);
    const elapsed = (start: number | null, end: number | null) =>
      start != null && end != null ? Math.max(0, end - start) : null;

    return {
      success: true,
      data: {
        ...detail,
        stage_durations_ms: {
          queue: elapsed(generated, rendering),
          render: elapsed(rendering, uploaded),
          upload_finalize: elapsed(uploaded, issued),
          total: elapsed(generated, issued),
        },
      },
    };
  } catch {
    return denied;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle transition helper (serial voiding + stage timestamps + audit)
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// Retry
// ─────────────────────────────────────────────────────────────────────────────

const retrySchema = z.object({
  issuanceId: z.number().int().positive(),
  reason: z.string().trim().min(5).max(1000),
});

/**
 * Recover the same original. Never cancel it or allocate another request/serial.
 */
export async function retryOpsIssuance(
  input: z.infer<typeof retrySchema>
): Promise<ActionResult<{ outcome: GenerateOfficialDocumentOutcome }>> {
  const gate = await requireOps("outputs.ops.retry");
  if ("error" in gate) return { success: false, error: gate.error };
  const parsed = retrySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "A retry reason (min 5 characters) is required." };
  if (!(await canAccessIssuedFile(parsed.data.issuanceId, "outputs.ops.retry"))) return { success: false, error: "Original request unavailable or access denied." };

  const db = await createClient();
  const { data: row, error } = await db
    .from("erp_generated_pdf_documents")
    .select("id, output_code, lifecycle_state")
    .eq("id", parsed.data.issuanceId)
    .single();
  if (error || !row) return { success: false, error: "Issuance not found." };

  if (!["pending", "rendering", "uploaded", "failed_retryable", "reconciliation_required", "issued"].includes(String(row.lifecycle_state))) {
    return { success: false, error: "Only an interrupted original or issued verification activation can be recovered." };
  }
  if (!row.output_code) {
    return { success: false, error: "Legacy issuances without an output code cannot be retried here." };
  }

  try { await logAudit({ module_code: "reports", entity_name: "erp_generated_pdf_documents", entity_id: row.id, entity_reference: String(row.output_code ?? row.id), action: "update", new_values: { event: "output_recovery_requested", reason: parsed.data.reason } }); }
  catch { return { success: false, error: "Recovery request audit was not recorded. No replacement was created." }; }
  const outcome = await recoverOfficialDocument(row.id as number);

  return { success: true, data: { outcome } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cancel
// ─────────────────────────────────────────────────────────────────────────────

const cancelSchema = z.object({
  issuanceId: z.number().int().positive(),
  reason: z.string().trim().min(5).max(1000),
});

export async function cancelOpsIssuance(input: z.infer<typeof cancelSchema>): Promise<ActionResult> {
  const gate = await requireOps("outputs.ops.retry");
  if ("error" in gate) return { success: false, error: gate.error };
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "A cancel reason (min 5 characters) is required." };
  if (!(await canAccessIssuedFile(parsed.data.issuanceId, "outputs.ops.retry"))) return { success: false, error: "Original request unavailable or access denied." };

  const db = await createClient();
  const { data: row, error } = await db
    .from("erp_generated_pdf_documents")
    .select("id, lifecycle_state")
    .eq("id", parsed.data.issuanceId)
    .single();
  if (error || !row) return { success: false, error: "Issuance not found." };

  if (row.lifecycle_state !== "cancelled" && !canTransition(row.lifecycle_state as LifecycleState, "cancelled")) {
    return { success: false, error: `A ${row.lifecycle_state} issuance cannot be cancelled.` };
  }

  const cancelled = await db.rpc("f08_end_operation", { p_id: row.id, p_lease: null, p_cancel: true, p_reason: parsed.data.reason });
  if (cancelled.error || cancelled.data?.id !== row.id) return { success: false, error: "Cancellation was not confirmed. Refresh the original request; no replacement was created." };
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Metrics + reconciliation queue
// ─────────────────────────────────────────────────────────────────────────────

const metricCount = z.number().int().nonnegative();
const metricRow = z.object({
  id: z.number().int().positive(),
  output_code: z.string().nullable(),
  generated_at: z.string(),
});
const opsMetricsSchema = z.object({
  stateCounts: z.record(z.string(), metricCount),
  issuedLast24h: metricCount,
  failedLast24h: metricCount,
  avgRenderMsLast24h: z.number().nullable(),
  voidedSerials: metricCount,
  stuckCount: metricCount,
  stuckInFlight: z.array(metricRow.extend({ lifecycle_state: z.string().nullable() })).max(20),
  reconciliationCount: metricCount,
  reconciliationRequired: z.array(metricRow.extend({ failure_reason: z.string().nullable() })).max(20),
  scheduleRuns: z.null(),
});

export type OpsMetrics = z.infer<typeof opsMetricsSchema> & { rendererHealthy: boolean };

export async function getOpsMetrics(): Promise<ActionResult<OpsMetrics>> {
  const gate = await requireOps("outputs.ops.view");
  if ("error" in gate) return { success: false, error: gate.error };
  const unavailable = { success: false, error: "Output operations metrics could not be verified." };

  try {
    const { data, error } = await (await createClient()).rpc("speed_output_ops_read", { p_mode: "metrics", p_input: {} });
    const result = opsMetricsSchema.safeParse(data);
    if (error || !result.success) return unavailable;
    const rendererHealthy = await isGotenbergHealthy().catch(() => false);
    return { success: true, data: { ...result.data, rendererHealthy } };
  } catch {
    return unavailable;
  }
}
