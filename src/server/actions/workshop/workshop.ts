"use server";

import { revalidatePath } from "next/cache";
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

export async function saveWorkshopAction(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = workshopRequest.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the form before saving." };
  try {
    if (!canUseApplication(await getAuthContext())) return { ok: false, error: "Sign in again to continue." };
    const { asset, nonce, action, data } = parsed.data;
    const rpc = maintenance.has(action) ? "t10_maintenance_command" : "t10_workshop_command";
    const { error } = await (await createClient()).rpc(rpc, { p_operation: nonce, p_asset: asset, p_action: action, p_data: data });
    if (error) {
      logger.warn("Workshop action failed", { action, code: error.code });
      if (["22023", "42501", "PT409"].includes(error.code)) return { ok: false, error: error.message };
      if (["22007", "22008", "22P02", "22003"].includes(error.code)) return { ok: false, error: "Check the date, quantity or reference." };
      return { ok: false, error: "The Workshop action could not be saved. Retry using the same details." };
    }
    revalidatePath("/modules/workshop");
    revalidatePath("/admin/hr/operations/workshop-referrals");
    revalidatePath(`/modules/fleet/${asset}`);
    return { ok: true };
  } catch {
    return { ok: false, error: "The Workshop action could not be confirmed. Retry using the same details." };
  }
}
