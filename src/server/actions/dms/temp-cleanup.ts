"use server";

/**
 * OUTPUT.1 — Governed dms-temp cleanup (upgrade of session-cleanup.ts).
 *
 * v6.1 requirements implemented here:
 *  - settings-driven retention per terminal status (erp_dms_temp_cleanup_settings)
 *  - dry-run by default; real deletion requires settings.enabled AND the
 *    DMS_TEMP_CLEANUP_DELETE_ENABLED feature flag AND dms.admin
 *  - legal-hold prefixes and manual retain list are never deleted
 *  - orphan reconciliation (storage folders with no session row) — report-only
 *  - every run is persisted to erp_dms_temp_cleanup_runs via service role
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { logAudit } from "@/server/actions/audit";
import { logger } from "@/lib/logger";
import { revalidatePath } from "next/cache";
import { isDmsTempCleanupDeletionEnabled } from "@/lib/output/feature-flags";
import {
  CLEANABLE_STATUSES,
  evaluateSessionEligibility,
  findOrphanFolders,
  type DmsTempCleanupSettings,
  type SkipReason,
} from "@/lib/dms/temp-cleanup/eligibility";

export type ActionResult<T = unknown> = { success: boolean; data?: T; error?: string };

export type DmsTempCleanupRunSummary = {
  run_id: number | null;
  mode: "dry_run" | "delete";
  scanned: number;
  eligible: number;
  deleted: number;
  failed: number;
  skipped: number;
  bytes_freed: number;
  orphans_found: number;
  orphan_folders: string[];
  skip_reasons: Partial<Record<SkipReason, number>>;
  errors: { session_id: number; error: string }[];
  duration_ms: number;
};

const ORPHAN_SCAN_FOLDER_LIMIT = 1000;
const STORAGE_DELETE_RETRIES = 2;

// ── Settings ──────────────────────────────────────────────────────────────────

export async function getDmsTempCleanupSettings(): Promise<ActionResult<DmsTempCleanupSettings>> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "dms.admin")) return { success: false, error: "Permission denied: requires dms.admin" };

  const db = createAdminClient();
  const { data, error } = await db
    .from("erp_dms_temp_cleanup_settings")
    .select("*")
    .eq("id", 1)
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data: normalizeSettings(data) };
}

export async function updateDmsTempCleanupSettings(
  patch: Partial<DmsTempCleanupSettings>
): Promise<ActionResult> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "dms.admin")) return { success: false, error: "Permission denied: requires dms.admin" };

  const allowed: Record<string, unknown> = {};
  if (typeof patch.enabled === "boolean") allowed.enabled = patch.enabled;
  for (const k of [
    "retention_hours_completed",
    "retention_hours_cancelled",
    "retention_hours_failed",
    "retention_hours_expired",
    "batch_size",
  ] as const) {
    const v = patch[k];
    if (typeof v === "number" && Number.isInteger(v) && v > 0) allowed[k] = v;
  }
  if (Array.isArray(patch.legal_hold_prefixes)) {
    allowed.legal_hold_prefixes = patch.legal_hold_prefixes.filter((p) => typeof p === "string");
  }
  if (Array.isArray(patch.manual_retain_session_ids)) {
    allowed.manual_retain_session_ids = patch.manual_retain_session_ids.filter(
      (n) => typeof n === "number" && Number.isInteger(n)
    );
  }
  if (Object.keys(allowed).length === 0) return { success: false, error: "No valid settings provided" };

  allowed.updated_at = new Date().toISOString();
  allowed.updated_by = ctx.profile?.id ?? null;

  const db = createAdminClient();
  const { error } = await db.from("erp_dms_temp_cleanup_settings").update(allowed).eq("id", 1);
  if (error) return { success: false, error: error.message };

  await logAudit({
    module_code: "DMS",
    entity_name: "erp_dms_temp_cleanup_settings",
    entity_id: 1,
    entity_reference: "singleton",
    action: "update",
    new_values: allowed,
  });
  return { success: true };
}

// ── Run ───────────────────────────────────────────────────────────────────────

export async function runDmsTempCleanup(options?: {
  mode?: "dry_run" | "delete";
}): Promise<ActionResult<DmsTempCleanupRunSummary>> {
  const startedAt = Date.now();
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.admin")) {
      return { success: false, error: "Permission denied: requires dms.admin" };
    }

    const db = createAdminClient();
    const { data: settingsRow, error: settingsError } = await db
      .from("erp_dms_temp_cleanup_settings")
      .select("*")
      .eq("id", 1)
      .single();
    if (settingsError || !settingsRow) {
      return { success: false, error: settingsError?.message ?? "Cleanup settings not found" };
    }
    const settings = normalizeSettings(settingsRow);

    const mode: "dry_run" | "delete" = options?.mode === "delete" ? "delete" : "dry_run";
    if (mode === "delete" && (!settings.enabled || !isDmsTempCleanupDeletionEnabled())) {
      // Governance gate: fall back to dry-run rather than deleting.
      return {
        success: false,
        error:
          "Deletion mode is disabled. Enable it in cleanup settings AND set DMS_TEMP_CLEANUP_DELETE_ENABLED=true. Run a dry-run instead.",
      };
    }

    // 1. Load candidate sessions (terminal statuses, not yet cleaned)
    const { data: rows, error: fetchError } = await db
      .from("dms_upload_sessions")
      .select("id, session_code, status, original_filename, file_size_bytes, temp_storage_path, temp_cleaned_at, uploaded_at")
      .in("status", [...CLEANABLE_STATUSES])
      .is("deleted_at", null)
      .is("temp_cleaned_at", null)
      .order("uploaded_at", { ascending: true })
      .limit(settings.batch_size);
    if (fetchError) return { success: false, error: fetchError.message };

    const now = new Date();
    const skipReasons: Partial<Record<SkipReason, number>> = {};
    const eligibleSessions: NonNullable<typeof rows> = [];

    for (const s of rows ?? []) {
      const decision = evaluateSessionEligibility(s, settings, now);
      if (decision.eligible) eligibleSessions.push(s);
      else skipReasons[decision.reason] = (skipReasons[decision.reason] ?? 0) + 1;
    }

    // 2. Orphan reconciliation (report-only): storage folders with no session row
    let orphanFolders: string[] = [];
    try {
      const { data: folders } = await db.storage
        .from("dms-temp")
        .list("sessions", { limit: ORPHAN_SCAN_FOLDER_LIMIT });
      const folderCodes = (folders ?? [])
        .filter((f) => f.id === null) // folders, not files
        .map((f) => f.name);
      if (folderCodes.length > 0) {
        const { data: known } = await db
          .from("dms_upload_sessions")
          .select("session_code")
          .in("session_code", folderCodes);
        orphanFolders = findOrphanFolders(
          folderCodes,
          new Set((known ?? []).map((k: { session_code: string }) => k.session_code))
        );
      }
    } catch (e) {
      logger.error("dms-temp orphan scan failed", e);
    }

    const summary: DmsTempCleanupRunSummary = {
      run_id: null,
      mode,
      scanned: rows?.length ?? 0,
      eligible: eligibleSessions.length,
      deleted: 0,
      failed: 0,
      skipped: (rows?.length ?? 0) - eligibleSessions.length,
      bytes_freed: 0,
      orphans_found: orphanFolders.length,
      orphan_folders: orphanFolders.slice(0, 50),
      skip_reasons: skipReasons,
      errors: [],
      duration_ms: 0,
    };

    // 3. Deletion (only in delete mode)
    if (mode === "delete") {
      for (const s of eligibleSessions) {
        const path = s.temp_storage_path as string;
        let lastError: string | null = null;
        for (let attempt = 0; attempt <= STORAGE_DELETE_RETRIES; attempt++) {
          const { error: delError } = await db.storage.from("dms-temp").remove([path]);
          if (!delError) { lastError = null; break; }
          lastError = delError.message;
          await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
        }

        if (lastError) {
          summary.failed++;
          summary.errors.push({ session_id: s.id, error: lastError });
          await db
            .from("dms_upload_sessions")
            .update({ cleanup_error_message: lastError, updated_at: now.toISOString() })
            .eq("id", s.id);
          continue;
        }

        await db
          .from("dms_upload_sessions")
          .update({
            temp_cleaned_at: now.toISOString(),
            cleanup_error_message: null,
            updated_at: now.toISOString(),
          })
          .eq("id", s.id);
        summary.deleted++;
        summary.bytes_freed += s.file_size_bytes ?? 0;
      }
    }

    summary.duration_ms = Date.now() - startedAt;

    // 4. Persist run log (service role only)
    const { data: runRow, error: runError } = await db
      .from("erp_dms_temp_cleanup_runs")
      .insert({
        mode,
        triggered_by: ctx.profile?.id ?? null,
        scanned: summary.scanned,
        eligible: summary.eligible,
        deleted: summary.deleted,
        failed: summary.failed,
        skipped: summary.skipped,
        bytes_freed: summary.bytes_freed,
        orphans_found: summary.orphans_found,
        skip_reasons: summary.skip_reasons,
        errors: summary.errors.length > 0 ? summary.errors : null,
        status: summary.failed === 0 ? "completed" : summary.deleted > 0 ? "partial" : "failed",
        duration_ms: summary.duration_ms,
      })
      .select("id")
      .single();
    if (runError) logger.error("dms-temp cleanup run log insert failed", runError);
    summary.run_id = runRow?.id ?? null;

    if (mode === "delete") {
      await logAudit({
        module_code: "DMS",
        entity_name: "dms_upload_sessions",
        entity_id: 0,
        entity_reference: `temp-cleanup-run-${summary.run_id ?? "?"}`,
        action: "delete",
        new_values: {
          deleted: summary.deleted,
          failed: summary.failed,
          bytes_freed: summary.bytes_freed,
          orphans_found: summary.orphans_found,
        },
      });
      revalidatePath("/dms/inbox");
    }

    return { success: true, data: summary };
  } catch (err) {
    logger.error("runDmsTempCleanup error", err);
    return { success: false, error: String(err) };
  }
}

export async function listDmsTempCleanupRuns(limit = 20): Promise<ActionResult<unknown[]>> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "dms.admin")) return { success: false, error: "Permission denied: requires dms.admin" };

  const db = createAdminClient();
  const { data, error } = await db
    .from("erp_dms_temp_cleanup_runs")
    .select("*")
    .order("run_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  if (error) return { success: false, error: error.message };
  return { success: true, data: data ?? [] };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeSettings(row: Record<string, unknown>): DmsTempCleanupSettings {
  return {
    enabled: Boolean(row.enabled),
    retention_hours_completed: Number(row.retention_hours_completed ?? 24),
    retention_hours_cancelled: Number(row.retention_hours_cancelled ?? 24),
    retention_hours_failed: Number(row.retention_hours_failed ?? 168),
    retention_hours_expired: Number(row.retention_hours_expired ?? 336),
    batch_size: Number(row.batch_size ?? 100),
    legal_hold_prefixes: Array.isArray(row.legal_hold_prefixes)
      ? (row.legal_hold_prefixes as string[]).filter((p) => typeof p === "string")
      : [],
    manual_retain_session_ids: Array.isArray(row.manual_retain_session_ids)
      ? (row.manual_retain_session_ids as number[]).filter((n) => typeof n === "number")
      : [],
  };
}
