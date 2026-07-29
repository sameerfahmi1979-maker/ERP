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
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission, type AuthContext } from "@/lib/rbac/check";
import { logAudit } from "@/server/actions/audit";
import { generateOfficialDocument } from "@/server/actions/output/generate-official-document";
import { isGotenbergHealthy } from "@/lib/pdf/gotenberg";
import {
  canTransition,
  isRetryable,
  serialStatusOnTransition,
  stageTimestampColumn,
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

/** Company scope for non-global operators. Returns null when unrestricted. */
async function allowedCompanies(ctx: AuthContext): Promise<Set<number> | null> {
  if (ctx.roleCodes.includes("system_admin") || ctx.roleCodes.includes("group_admin")) return null;
  const db = createAdminClient();
  const { data } = await db
    .from("user_roles")
    .select("owner_company_id")
    .eq("user_profile_id", ctx.profile?.id ?? 0)
    .eq("is_active", true)
    .not("owner_company_id", "is", null);
  return new Set(
    (data ?? [])
      .map((r: { owner_company_id: number | null }) => r.owner_company_id)
      .filter((id): id is number => id !== null)
  );
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
  const { ctx } = gate;

  const f = listFiltersSchema.parse(input ?? {});
  const db = createAdminClient();

  let q = db
    .from("erp_generated_pdf_documents")
    .select(
      "id, output_code, template_key, document_class, lifecycle_state, serial_no, serial_status, owner_company_id, source_record_type, source_record_id, file_name, file_size_bytes, renderer, renderer_version, generated_by, generated_at, issued_at, failed_at, cancelled_at, revoked_at, superseded_by_id, failure_reason",
      { count: "exact" }
    );

  const companies = await allowedCompanies(ctx);
  if (companies !== null) {
    if (companies.size === 0) return { success: true, data: { rows: [], total: 0, canRetry: false, canRevoke: false } };
    q = q.in("owner_company_id", [...companies]);
  }
  if (f.lifecycleState) q = q.eq("lifecycle_state", f.lifecycleState);
  if (f.documentClass) q = q.eq("document_class", f.documentClass);
  if (f.outputCode) q = q.eq("output_code", f.outputCode);
  if (f.ownerCompanyId != null) q = q.eq("owner_company_id", f.ownerCompanyId);
  if (f.renderer) q = q.eq("renderer", f.renderer);
  if (f.generatedBy != null) q = q.eq("generated_by", f.generatedBy);
  if (f.dateFrom) q = q.gte("generated_at", f.dateFrom);
  if (f.dateTo) q = q.lte("generated_at", f.dateTo);
  if (f.search) {
    // Strip only % (wildcard) and PostgREST or() delimiters; keep _ because it is
    // ubiquitous in output codes and serials (it matching any-one-char is harmless).
    const s = f.search.replace(/[%,()]/g, "").trim();
    if (s) q = q.or(`serial_no.ilike.%${s}%,file_name.ilike.%${s}%,output_code.ilike.%${s}%`);
  }

  const { data, error, count } = await q
    .order("generated_at", { ascending: false })
    .range(f.page * f.pageSize, f.page * f.pageSize + f.pageSize - 1);
  if (error) return { success: false, error: error.message };

  // QR status per row (single query, no N+1).
  const ids = (data ?? []).map((r) => r.id as number);
  const qrByDoc = new Map<number, string>();
  if (ids.length > 0) {
    const { data: links } = await db
      .from("erp_output_public_links")
      .select("generated_pdf_document_id, status")
      .in("generated_pdf_document_id", ids);
    for (const l of links ?? []) {
      qrByDoc.set(l.generated_pdf_document_id as number, l.status as string);
    }
  }

  const rows: OpsIssuanceRow[] = (data ?? []).map((r) => ({
    ...(r as unknown as Omit<OpsIssuanceRow, "total_duration_ms" | "qr_status">),
    total_duration_ms:
      r.issued_at && r.generated_at
        ? new Date(r.issued_at as string).getTime() - new Date(r.generated_at as string).getTime()
        : null,
    qr_status: qrByDoc.get(r.id as number) ?? null,
  }));

  return {
    success: true,
    data: {
      rows,
      total: count ?? rows.length,
      canRetry: hasPermission(ctx, "outputs.ops.retry"),
      canRevoke: hasPermission(ctx, "outputs.ops.revoke"),
    },
  };
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
  const { ctx } = gate;

  const db = createAdminClient();
  const { data: r, error } = await db
    .from("erp_generated_pdf_documents")
    .select("*")
    .eq("id", issuanceId)
    .single();
  if (error || !r) return { success: false, error: "Issuance not found." };

  const companies = await allowedCompanies(ctx);
  if (companies !== null && !companies.has(r.owner_company_id as number)) {
    return { success: false, error: "You do not have access to this issuance's company." };
  }

  const { data: links } = await db
    .from("erp_output_public_links")
    .select("id, status, issued_at, expires_at, cancelled_at, cancel_reason, view_count")
    .eq("generated_pdf_document_id", issuanceId)
    .order("id");

  const t = (v: string | null) => (v ? new Date(v).getTime() : null);
  const g = t(r.generated_at), rs = t(r.rendering_started_at), up = t(r.uploaded_at), is = t(r.issued_at);

  // Content-adjacent data (the rendered variable values) requires document-level rights.
  const mayViewContent = hasPermission(ctx, "reports.view") || hasPermission(ctx, "reports.manage");

  const detail: OpsIssuanceDetail = {
    ...(r as unknown as Omit<OpsIssuanceDetail, "qr_links" | "stage_durations_ms" | "total_duration_ms" | "qr_status" | "data_snapshot_json" | "data_snapshot_hidden">),
    data_snapshot_json: mayViewContent ? r.data_snapshot_json : null,
    data_snapshot_hidden: !mayViewContent && r.data_snapshot_json != null,
    total_duration_ms: g != null && is != null ? is - g : null,
    qr_status: (links ?? [])[0]?.status ?? null,
    qr_links: (links ?? []) as OpsIssuanceDetail["qr_links"],
    // Clamped at 0: generated_at is a DB default while stage stamps are set by the
    // app, so sub-second clock skew can otherwise produce small negative values.
    stage_durations_ms: {
      queue: g != null && rs != null ? Math.max(0, rs - g) : null,
      render: rs != null && up != null ? Math.max(0, up - rs) : null,
      upload_finalize: up != null && is != null ? Math.max(0, is - up) : null,
      total: g != null && is != null ? Math.max(0, is - g) : null,
    },
  };
  return { success: true, data: detail };
}

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle transition helper (serial voiding + stage timestamps + audit)
// ─────────────────────────────────────────────────────────────────────────────

async function opsTransition(input: {
  ctx: AuthContext;
  row: { id: number; lifecycle_state: string | null; serial_no: string | null; output_code: string | null };
  to: LifecycleState;
  reason: string;
  event: string;
}): Promise<ActionResult> {
  const from = input.row.lifecycle_state as LifecycleState;
  if (!canTransition(from, input.to)) {
    return { success: false, error: `Illegal lifecycle transition ${from} → ${input.to}.` };
  }
  const db = createAdminClient();
  const patch: Record<string, unknown> = {
    lifecycle_state: input.to,
    failure_reason: input.reason,
  };
  const stampCol = stageTimestampColumn(input.to);
  if (stampCol) patch[stampCol] = new Date().toISOString();
  const serialStatus = serialStatusOnTransition(input.to, input.row.serial_no != null);
  if (serialStatus) {
    patch.serial_status = serialStatus;
    if (serialStatus === "voided") patch.serial_void_reason = input.reason;
  }

  // Atomic conditional update = idempotency guard (state must still match `from`).
  const { data, error } = await db
    .from("erp_generated_pdf_documents")
    .update(patch)
    .eq("id", input.row.id)
    .eq("lifecycle_state", from)
    .select("id");
  if (error) return { success: false, error: error.message };
  if (!data || data.length === 0) {
    return { success: false, error: "The issuance state changed concurrently — refresh and retry." };
  }

  await logAudit({
    module_code: "reports",
    entity_name: "erp_generated_pdf_documents",
    entity_id: input.row.id,
    entity_reference: input.row.output_code ?? String(input.row.id),
    action: "update",
    new_values: { event: input.event, from, to: input.to, reason: input.reason },
  }).catch(() => {});

  return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Retry
// ─────────────────────────────────────────────────────────────────────────────

const retrySchema = z.object({
  issuanceId: z.number().int().positive(),
  reason: z.string().min(5).max(1000),
});

/**
 * Operator retry: the failed attempt is closed out (cancelled — its serial is
 * voided, never recycled) and a FRESH coordinator run is started for the same
 * output + record. Idempotent: the close-out is an atomic conditional
 * transition, so a concurrent second retry fails cleanly instead of duplicating.
 */
export async function retryOpsIssuance(
  input: z.infer<typeof retrySchema>
): Promise<ActionResult<{ outcome: GenerateOfficialDocumentOutcome }>> {
  const gate = await requireOps("outputs.ops.retry");
  if ("error" in gate) return { success: false, error: gate.error };
  const { ctx } = gate;

  const parsed = retrySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "A retry reason (min 5 characters) is required." };

  const db = createAdminClient();
  const { data: row, error } = await db
    .from("erp_generated_pdf_documents")
    .select("id, output_code, source_record_type, source_record_id, template_id, owner_company_id, lifecycle_state, serial_no")
    .eq("id", parsed.data.issuanceId)
    .single();
  if (error || !row) return { success: false, error: "Issuance not found." };

  const companies = await allowedCompanies(ctx);
  if (companies !== null && !companies.has(row.owner_company_id as number)) {
    return { success: false, error: "You do not have access to this issuance's company." };
  }
  if (!isRetryable(row.lifecycle_state as LifecycleState)) {
    return { success: false, error: `Only retryable failures can be retried (state: ${row.lifecycle_state}).` };
  }
  if (!row.output_code) {
    return { success: false, error: "Legacy issuances without an output code cannot be retried here." };
  }

  const closed = await opsTransition({
    ctx,
    row: row as never,
    to: "cancelled",
    reason: `Operator retry: ${parsed.data.reason}`,
    event: "output_ops_retry_closeout",
  });
  if (!closed.success) return closed as ActionResult<{ outcome: GenerateOfficialDocumentOutcome }>;

  const outcome = await generateOfficialDocument(row.output_code as string, row.source_record_id as number, {
    templateId: (row.template_id as number | null) ?? undefined,
    issueQr: false,
    clientRequestToken: `ops-retry-${row.id}-${Date.now()}`,
  });

  await logAudit({
    module_code: "reports",
    entity_name: "erp_generated_pdf_documents",
    entity_id: row.id,
    entity_reference: row.output_code as string,
    action: "update",
    new_values: {
      event: "output_ops_retry",
      reason: parsed.data.reason,
      new_issuance_id: outcome.success ? outcome.issuanceId : null,
      result: outcome.success ? "issued" : outcome.blocked ?? "failed",
    },
  }).catch(() => {});

  return { success: true, data: { outcome } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cancel
// ─────────────────────────────────────────────────────────────────────────────

const cancelSchema = z.object({
  issuanceId: z.number().int().positive(),
  reason: z.string().min(5).max(1000),
});

export async function cancelOpsIssuance(input: z.infer<typeof cancelSchema>): Promise<ActionResult> {
  const gate = await requireOps("outputs.ops.retry");
  if ("error" in gate) return { success: false, error: gate.error };
  const { ctx } = gate;

  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "A cancel reason (min 5 characters) is required." };

  const db = createAdminClient();
  const { data: row, error } = await db
    .from("erp_generated_pdf_documents")
    .select("id, output_code, owner_company_id, lifecycle_state, serial_no")
    .eq("id", parsed.data.issuanceId)
    .single();
  if (error || !row) return { success: false, error: "Issuance not found." };

  const companies = await allowedCompanies(ctx);
  if (companies !== null && !companies.has(row.owner_company_id as number)) {
    return { success: false, error: "You do not have access to this issuance's company." };
  }
  if (!canTransition(row.lifecycle_state as LifecycleState, "cancelled")) {
    return { success: false, error: `A ${row.lifecycle_state} issuance cannot be cancelled.` };
  }

  return opsTransition({
    ctx,
    row: row as never,
    to: "cancelled",
    reason: parsed.data.reason,
    event: "output_ops_cancelled",
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Metrics + reconciliation queue
// ─────────────────────────────────────────────────────────────────────────────

export interface OpsMetrics {
  stateCounts: Record<string, number>;
  issuedLast24h: number;
  failedLast24h: number;
  avgRenderMsLast24h: number | null;
  rendererHealthy: boolean;
  /** In-flight rows stuck longer than 15 minutes (candidates for reconciliation). */
  stuckInFlight: Array<{ id: number; output_code: string | null; lifecycle_state: string | null; generated_at: string }>;
  reconciliationRequired: Array<{ id: number; output_code: string | null; failure_reason: string | null; generated_at: string }>;
  voidedSerials: number;
  /** OUTPUT.7 schedules worker visibility (global — worker runs are not company-scoped rows). */
  scheduleRuns: {
    retryable: number;
    terminal: number;
    succeededLast24h: number;
    terminalRecent: Array<{ id: number; schedule_id: number; failure_reason: string | null; finished_at: string | null }>;
  };
}

export async function getOpsMetrics(): Promise<ActionResult<OpsMetrics>> {
  const gate = await requireOps("outputs.ops.view");
  if ("error" in gate) return { success: false, error: gate.error };
  const { ctx } = gate;

  const db = createAdminClient();
  const companies = await allowedCompanies(ctx);

  let base = db.from("erp_generated_pdf_documents").select("lifecycle_state, generated_at, issued_at, rendering_started_at, uploaded_at, serial_status, id, output_code, failure_reason");
  if (companies !== null) {
    if (companies.size === 0) {
      return {
        success: true,
        data: {
          stateCounts: {}, issuedLast24h: 0, failedLast24h: 0, avgRenderMsLast24h: null,
          rendererHealthy: await isGotenbergHealthy(), stuckInFlight: [], reconciliationRequired: [], voidedSerials: 0,
          scheduleRuns: await getScheduleRunsSummary(db),
        },
      };
    }
    base = base.in("owner_company_id", [...companies]);
  }
  const { data, error } = await base.order("generated_at", { ascending: false }).limit(2000);
  if (error) return { success: false, error: error.message };

  const rows = data ?? [];
  const stateCounts: Record<string, number> = {};
  const dayAgo = Date.now() - 24 * 3600 * 1000;
  let issued24 = 0, failed24 = 0, renderSum = 0, renderN = 0, voided = 0;
  const stuck: OpsMetrics["stuckInFlight"] = [];
  const recon: OpsMetrics["reconciliationRequired"] = [];

  for (const r of rows) {
    const st = (r.lifecycle_state as string) ?? "unknown";
    stateCounts[st] = (stateCounts[st] ?? 0) + 1;
    const gen = new Date(r.generated_at as string).getTime();
    if (st === "issued" && gen >= dayAgo) issued24++;
    if ((st === "failed_retryable" || st === "failed_terminal") && gen >= dayAgo) failed24++;
    if (r.serial_status === "voided") voided++;
    if (st === "issued" && gen >= dayAgo && r.rendering_started_at && r.uploaded_at) {
      renderSum += new Date(r.uploaded_at as string).getTime() - new Date(r.rendering_started_at as string).getTime();
      renderN++;
    }
    if ((st === "pending" || st === "rendering" || st === "uploaded") && Date.now() - gen > 15 * 60 * 1000) {
      stuck.push({ id: r.id as number, output_code: r.output_code, lifecycle_state: st, generated_at: r.generated_at as string });
    }
    if (st === "reconciliation_required") {
      recon.push({ id: r.id as number, output_code: r.output_code, failure_reason: r.failure_reason, generated_at: r.generated_at as string });
    }
  }

  return {
    success: true,
    data: {
      stateCounts,
      issuedLast24h: issued24,
      failedLast24h: failed24,
      avgRenderMsLast24h: renderN > 0 ? Math.round(renderSum / renderN) : null,
      rendererHealthy: await isGotenbergHealthy(),
      stuckInFlight: stuck.slice(0, 20),
      reconciliationRequired: recon.slice(0, 20),
      voidedSerials: voided,
      scheduleRuns: await getScheduleRunsSummary(db),
    },
  };
}

/** OUTPUT.7 — schedules worker run summary for the Ops Console. */
async function getScheduleRunsSummary(
  db: ReturnType<typeof createAdminClient>
): Promise<OpsMetrics["scheduleRuns"]> {
  const dayAgoIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [retryable, terminal, succeeded24, terminalRecent] = await Promise.all([
    db.from("erp_report_schedule_runs").select("id", { count: "exact", head: true }).eq("status", "failed_retryable"),
    db.from("erp_report_schedule_runs").select("id", { count: "exact", head: true }).eq("status", "failed_terminal"),
    db.from("erp_report_schedule_runs").select("id", { count: "exact", head: true }).eq("status", "succeeded").gte("finished_at", dayAgoIso),
    db.from("erp_report_schedule_runs")
      .select("id, schedule_id, failure_reason, finished_at")
      .eq("status", "failed_terminal")
      .order("finished_at", { ascending: false })
      .limit(10),
  ]);
  return {
    retryable: retryable.count ?? 0,
    terminal: terminal.count ?? 0,
    succeededLast24h: succeeded24.count ?? 0,
    terminalRecent: (terminalRecent.data ?? []) as OpsMetrics["scheduleRuns"]["terminalRecent"],
  };
}
