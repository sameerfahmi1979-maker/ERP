/**
 * Global ERP Report Center — Preview Runner (No-Write)
 * Phase: REPORT DESIGNER.6 — Safe Renderer and Production Output Integration
 *
 * A read-only variant of the report runner that:
 *  - Calls registered report fetchers directly
 *  - NEVER writes to erp_report_runs
 *  - NEVER writes to erp_report_delivery_logs
 *  - NEVER sends emails
 *  - NEVER creates QR / erp_output_public_links rows
 *  - Caps preview rows at PREVIEW_ROW_LIMIT
 *  - Applies the same redaction engine as the official runner
 *
 * Intended for use in:
 *  - Report Designer Test Report panel (report_filters mode)
 *  - Future: Report preview before scheduling
 *
 * SERVER-SIDE ONLY. Do NOT import in client components.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { applyRedaction } from "./redaction-engine";
import type { ApplyRedactionOptions } from "./redaction-engine";
import { REPORT_FETCHERS } from "./report-fetchers";
import type { ReportDataResult, ReportRegistryEntry } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Maximum rows returned by preview runner — prevents large result sets in preview */
export const PREVIEW_ROW_LIMIT = 50;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PreviewRunInput {
  reportCode: string;
  filters?: Record<string, unknown>;
  /** Permission codes of the calling user — used for registry entry validation */
  permissionCodes: string[];
  /** Cap rows at this count (default: PREVIEW_ROW_LIMIT=50) */
  maxRows?: number;
}

export interface PreviewRunResult {
  success: boolean;
  error?: string;
  /** Report data columns */
  columns?: string[];
  /** Capped rows (≤ maxRows) */
  rows?: Record<string, unknown>[];
  /** Total rows from fetcher before capping */
  totalRows?: number;
  /** Whether the result was capped */
  isCapped?: boolean;
  /** Whether any field was redacted */
  wasRedacted?: boolean;
  /** Report code */
  reportCode?: string;
  /** Report title from registry */
  reportTitle?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Registry loader (shared with report-runner.ts)
// ─────────────────────────────────────────────────────────────────────────────

async function loadRegistryEntry(
  reportCode: string
): Promise<ReportRegistryEntry | null> {
  const db = createAdminClient();
  const { data } = await db
    .from("erp_report_registry")
    .select("*")
    .eq("report_code", reportCode)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();
  return data as ReportRegistryEntry | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main preview runner
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute a report fetcher in read-only preview mode.
 *
 * Differences from runReport():
 *  1. No erp_report_runs row created (read-only)
 *  2. No erp_report_delivery_logs row
 *  3. No email send/queue
 *  4. No QR/public-link creation
 *  5. Row count capped at PREVIEW_ROW_LIMIT (default 50)
 *
 * The same permission checks and redaction apply.
 */
export async function runReportFetcherPreview(
  input: PreviewRunInput
): Promise<PreviewRunResult> {
  const { reportCode, filters, permissionCodes, maxRows = PREVIEW_ROW_LIMIT } = input;

  try {
    // ── 1. Load registry ──────────────────────────────────────────────────
    const registryEntry = await loadRegistryEntry(reportCode);
    if (!registryEntry) {
      return {
        success: false,
        error: `Report '${reportCode}' not found in registry or is inactive.`,
      };
    }

    // ── 2. Permission check ───────────────────────────────────────────────
    const missingPerms = (registryEntry.required_permissions ?? []).filter(
      (p: string) => !permissionCodes.includes(p)
    );
    if (missingPerms.length > 0) {
      return {
        success: false,
        error: `Missing permissions for preview: ${missingPerms.join(", ")}`,
      };
    }

    // ── 3. Find fetcher ───────────────────────────────────────────────────
    const fetcher = REPORT_FETCHERS[reportCode];
    if (!fetcher) {
      return {
        success: false,
        error: `No fetcher registered for report '${reportCode}'. Preview not available.`,
      };
    }

    // ── 4. Execute fetcher (read-only) ────────────────────────────────────
    const rawResult: ReportDataResult = await fetcher.fetch(filters ?? {}, permissionCodes);

    const allRows = rawResult.rows ?? [];
    const totalRows = allRows.length;
    const isCapped = totalRows > maxRows;
    const cappedRows = isCapped ? allRows.slice(0, maxRows) : allRows;

    // ── 5. Apply redaction ────────────────────────────────────────────────
    const redactionOptions: ApplyRedactionOptions = {
      profile: (registryEntry as unknown as Record<string, unknown>).sensitive_profile as ApplyRedactionOptions["profile"] ?? "normal",
      permissionCodes,
    };
    const redactionResult = applyRedaction({ ...rawResult, rows: cappedRows }, redactionOptions);

    return {
      success: true,
      columns: rawResult.columns ?? [],
      rows: redactionResult.sanitizedData?.rows ?? [],
      totalRows,
      isCapped,
      wasRedacted: redactionResult.summary?.wasRedacted ?? false,
      reportCode,
      reportTitle: (registryEntry as unknown as Record<string, unknown>).report_name as string
        ?? (registryEntry as unknown as Record<string, unknown>).report_title as string
        ?? reportCode,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[preview-runner] runReportFetcherPreview error:", msg);
    return { success: false, error: `Preview runner error: ${msg}` };
  }
}
