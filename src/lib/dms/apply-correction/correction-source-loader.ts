/**
 * ERP DMS AI Phase 17 — Correction Source Loader
 *
 * Loads source data for a correction proposal:
 *   1. Validates original apply item is status=applied
 *   2. Loads parent apply run
 *   3. Reloads current target value from DB (fresh)
 *   4. Validates target is still allowlisted
 *   5. Determines restorePreviousEnabled eligibility
 *
 * Read-only — writes nothing.
 */

import { createClient } from "@/lib/supabase/server";
import {
  validateApplyTarget,
} from "@/lib/dms/apply-to-erp/apply-target-registry";
import type { CorrectionSourceData, CorrectionErrorCode } from "./types";

// ── Summary max length ─────────────────────────────────────────────────────────

const SUMMARY_MAX = 200;

// ── Public: loadCorrectionSource ─────────────────────────────────────────────

/**
 * Load all data needed to create a correction proposal from a given apply item.
 *
 * Returns CorrectionSourceData on success or a CorrectionResult error.
 */
type LoadError = { success: false; error: CorrectionErrorCode; message: string };

export async function loadCorrectionSource(
  applyItemId: number,
  userId: number
): Promise<
  | { ok: true; data: CorrectionSourceData }
  | { ok: false; error: LoadError }
> {
  const supabase = await createClient();

  // ── 1. Load original apply item (must be status=applied) ──────────────────
  type ItemRow = {
    id: number;
    apply_run_id: number;
    target_table: string;
    target_field: string;
    target_record_id: number | null;
    target_display_label: string | null;
    value_type: string;
    current_value_summary: string | null;
    applied_value_summary: string | null;
    status: string;
  };

  const { data: rawItem, error: itemErr } = await supabase
    .from("dms_ai_erp_apply_items")
    .select("id, apply_run_id, target_table, target_field, target_record_id, target_display_label, value_type, current_value_summary, applied_value_summary, status")
    .eq("id", applyItemId)
    .maybeSingle();

  const item = rawItem as ItemRow | null;

  if (itemErr || !item) {
    return {
      ok: false,
      error: {
        success: false,
        error: "original_item_not_found",
        message: `Apply item ${applyItemId} not found.`,
      },
    };
  }

  if (item.status !== "applied") {
    return {
      ok: false,
      error: {
        success: false,
        error: "original_item_not_applied",
        message: `Apply item ${applyItemId} has status '${item.status}'. Only 'applied' items can be corrected.`,
      },
    };
  }

  // ── 2. Load parent apply run ──────────────────────────────────────────────
  type RunRow = {
    id: number;
    run_code: string | null;
    document_id: number | null;
    target_module: string;
  };

  const { data: rawRun, error: runErr } = await supabase
    .from("dms_ai_erp_apply_runs")
    .select("id, run_code, document_id, target_module")
    .eq("id", item.apply_run_id)
    .maybeSingle();

  const run = rawRun as RunRow | null;

  if (runErr || !run) {
    return {
      ok: false,
      error: {
        success: false,
        error: "original_run_not_found",
        message: `Apply run ${item.apply_run_id} not found.`,
      },
    };
  }

  // ── 3. Validate target is still allowlisted ───────────────────────────────
  const targetModule = run.target_module as string;
  const registryValidation = validateApplyTarget(item.target_table, item.target_field);

  if (!registryValidation.valid) {
    return {
      ok: false,
      error: {
        success: false,
        error: "target_not_allowlisted",
        message: `${item.target_table}.${item.target_field} is no longer in the apply target allowlist.`,
      },
    };
  }

  // ── 4. Reload current live value from DB ──────────────────────────────────
  const currentValueSummary = await loadCurrentValueSummary(
    supabase,
    item.target_table,
    item.target_field,
    item.target_record_id
  );

  // ── 5. Determine restorePreviousEnabled ───────────────────────────────────
  const { enabled: restorePreviousEnabled, warning: restorePreviousWarning } =
    evaluateRestorePrevious(
      item.value_type as string,
      item.current_value_summary as string | null
    );

  const sourceData: CorrectionSourceData = {
    originalApplyItemId:    item.id,
    originalApplyRunId:     run.id,
    documentId:             run.document_id ?? null,
    targetModule:           targetModule as CorrectionSourceData["targetModule"],
    targetTable:            item.target_table,
    targetField:            item.target_field,
    targetRecordId:         item.target_record_id ?? null,
    targetDisplayLabel:     (item.target_display_label as string | null) ?? null,
    valueType:              item.value_type as CorrectionSourceData["valueType"],
    originalBeforeSummary:  (item.current_value_summary as string | null) ?? null,
    originalAppliedSummary: (item.applied_value_summary as string | null) ?? null,
    currentValueSummary:    currentValueSummary,
    restorePreviousEnabled,
    restorePreviousWarning,
  };

  void userId; // auth context validated by server action
  void targetModule; // captured for sourceData

  return { ok: true, data: sourceData };
}

// ── Private: live value loader ────────────────────────────────────────────────

async function loadCurrentValueSummary(
  supabase: Awaited<ReturnType<typeof createClient>>,
  targetTable: string,
  targetField: string,
  targetRecordId: number | null
): Promise<string | null> {
  if (!targetRecordId) return null;

  try {
    const { data } = await supabase
      .from(targetTable as never)
      .select(targetField)
      .eq("id", targetRecordId)
      .maybeSingle();

    if (!data) return null;
    const raw = (data as unknown as Record<string, unknown>)[targetField];
    if (raw == null) return null;
    const str = String(raw);
    return str.length <= SUMMARY_MAX ? str : str.slice(0, SUMMARY_MAX - 3) + "...";
  } catch {
    return null;
  }
}

// ── Private: restore previous eligibility ────────────────────────────────────

function evaluateRestorePrevious(
  valueType: string,
  originalBeforeSummary: string | null
): { enabled: boolean; warning: string | null } {
  // Non-text types: safe to prefill from summary if present
  if (valueType === "date" || valueType === "number" || valueType === "bigint" || valueType === "boolean") {
    if (!originalBeforeSummary || originalBeforeSummary.trim() === "") {
      return { enabled: false, warning: "No previous value is available to restore." };
    }
    return { enabled: true, warning: null };
  }

  // Text types: warn about potential truncation
  if (valueType === "text") {
    if (!originalBeforeSummary || originalBeforeSummary.trim() === "") {
      return { enabled: false, warning: "No previous text value is available." };
    }
    const maybeTruncated =
      originalBeforeSummary.length >= SUMMARY_MAX ||
      originalBeforeSummary.endsWith("...");

    if (maybeTruncated) {
      return {
        enabled: true,
        warning:
          "The previous value may be truncated. The summary stored in history may not be the exact original text. " +
          "Review carefully before applying.",
      };
    }
    return {
      enabled: true,
      warning:
        "The previous value is a stored summary. Verify it is accurate before applying.",
    };
  }

  return { enabled: false, warning: null };
}
