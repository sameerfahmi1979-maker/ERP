"use server";

import type { OperationsCommandResult } from "@/lib/operations/command-result";
import { refreshOperationsPaths } from "@/server/operations/revalidate-command-paths";
import { z } from "zod";
import { fleetId } from "@/lib/fleet/asset-contract";
import { logger } from "@/lib/logger";
import { canUseApplication, getAuthContext } from "@/lib/rbac/check";
import { createClient } from "@/lib/supabase/server";
import { workshopAssetList, workshopReferrals, workshopRequest, workshopWorkspace } from "@/lib/workshop/workspace";

const maintenance = new Set(["create", "edit", "activate-reminder", "deactivate-reminder", "record-service", "reading"]);

async function read<T>(rpc: string, args: Record<string, unknown>, schema: z.ZodType<T>) {
  try {
    if (!canUseApplication(await getAuthContext())) return null;
    const { data, error } = await (await createClient()).rpc(rpc, args, { get: true });
    if (error) {
      logger.warn("Workshop read failed", { rpc, code: error.code });
      return null;
    }
    const parsed = schema.safeParse(data);
    if (!parsed.success && data !== null) logger.warn("Workshop response validation failed", { rpc });
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function listWorkshopAssets(search: string, before?: number) {
  if (!fleetId.optional().safeParse(before).success) return null;
  return read("t10_workshop_assets", { p_before: before, p_search: search.slice(0, 100) }, workshopAssetList);
}

export async function readWorkshopAsset(asset: number, before?: number) {
  if (!fleetId.safeParse(asset).success || !fleetId.optional().safeParse(before).success) return null;
  return read("t10_workshop_workspace", { p_asset: asset, p_before: before }, workshopWorkspace);
}

export async function readWorkshopReferrals(before?: number) {
  if (!fleetId.optional().safeParse(before).success) return null;
  return read("t10_hr_workshop_referrals", { p_before: before }, workshopReferrals);
}

const workshopReceipt = z.object({
  assessment: fleetId, job: fleetId.nullable(), cycle: fleetId.nullable(), state: z.string().min(1), replayed: z.boolean(),
});
const maintenanceReceipt = z.object({
  id: fleetId, clock: fleetId.nullable(), reminder_active: z.boolean().nullable(), replayed: z.boolean(),
});
type Receipt = z.infer<typeof workshopReceipt> | z.infer<typeof maintenanceReceipt>;

export async function saveWorkshopAction(input: unknown): Promise<OperationsCommandResult<Receipt>> {
  const parsed = workshopRequest.safeParse(input);
  if (!parsed.success) return { ok: false, uncertain: false, error: "Check the form before saving." };
  let dispatched = false;
  try {
    if (!canUseApplication(await getAuthContext())) return { ok: false, uncertain: false, error: "Sign in again to continue." };
    const { asset, nonce, action, data } = parsed.data;
    const isMaintenance = maintenance.has(action);
    const rpc = isMaintenance ? "t10_maintenance_command" : "t10_workshop_command";
    const client = await createClient();
    dispatched = true;
    const { data: raw, error } = await client.rpc(rpc, { p_operation: nonce, p_asset: asset, p_action: action, p_data: data });
    if (error) {
      logger.warn("Workshop action failed", { action, code: error.code });
      if (["22023", "42501", "PT409", "P0409"].includes(error.code)) return { ok: false, uncertain: false, error: error.message };
      if (["22007", "22008", "22P02", "22003"].includes(error.code)) return { ok: false, uncertain: false, error: "Check the date, quantity or reference." };
      return { ok: false, uncertain: true, error: "The Workshop action could not be confirmed. Retry using the same details." };
    }
    const result = (isMaintenance ? maintenanceReceipt : workshopReceipt).safeParse(raw);
    if (!result.success) return { ok: false, uncertain: true, error: "The Workshop action could not be confirmed. Retry using the same details." };
    const receipt = result.data;
    const refresh = refreshOperationsPaths({
      kind: "workshop", asset, ...("job" in receipt && receipt.job ? { job: receipt.job } : {}),
    });
    return { ok: true, receipt, ...refresh };
  } catch {
    return { ok: false, uncertain: dispatched, error: dispatched ? "The Workshop action could not be confirmed. Retry using the same details." : "The Workshop action could not start. Try again." };
  }
}
