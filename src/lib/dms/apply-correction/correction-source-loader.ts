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

import {readDmsCorrection} from "@/server/dms-reviewed-updates";
import { createClient } from "@/lib/supabase/server";
import {isPartyCorrectionTarget,loadPartyCorrectionSource} from '@/server/party-dms-correction';

import type { CorrectionSourceData, CorrectionErrorCode } from "./types";

// ── Summary max length ─────────────────────────────────────────────────────────



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

  if(isPartyCorrectionTarget(item.target_table)){
    const result=await loadPartyCorrectionSource(applyItemId);
    return result.success&&result.data?{ok:true,data:result.data}:{ok:false,error:{success:false,error:result.errorCode==='permission_denied'?'permission_denied':'server_error',message:result.error??'Correction source unavailable.'}};
  }

  const result=await readDmsCorrection(applyItemId);
  void userId;
  return result.success&&result.data?{ok:true,data:result.data}:{ok:false,error:{success:false,error:result.errorCode==='permission_denied'?'permission_denied':'server_error',message:result.error??"Correction source unavailable."}};
}
