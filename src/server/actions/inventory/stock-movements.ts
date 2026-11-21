"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canUseApplication, getAuthContext } from "@/lib/rbac/check";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { fleetId } from "@/lib/fleet/asset-contract";
import { fuelAssetList, fuelWorkspace, stockMovement, supplyActionQueue, supplyActionQueueKinds, supplyActionQueuePage,
  supplyActionQueueSearch, supplyActionReceipt, supplyBranchList, supplyRequest, supplyWorkspace, workspaceKinds } from "@/lib/supply/contracts";

const command = { setup: "t11_supply_setup", stock: "t11_stock_command",
  purchase: "t11_purchase_command", fuel: "t11_fuel_command" } as const;

async function read<T>(rpc: string, args: Record<string, unknown>, contract: z.ZodType<T>) {
  try {
    if (!canUseApplication(await getAuthContext())) return null;
    const { data, error } = await (await createClient()).rpc(rpc, args, { get: true });
    if (error) {
      logger.warn("Supply read failed", { rpc, code: error.code });
      return null;
    }
    const parsed = contract.safeParse(data);
    if (!parsed.success && data !== null) logger.warn("Supply response validation failed", { rpc });
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function listSupplyBranches(workspace: "inventory" | "procurement") {
  if (!workspaceKinds.safeParse(workspace).success) return null;
  return read("t11_supply_branches", { p_workspace: workspace }, supplyBranchList);
}
export async function getSupplyWorkspace(branch: number, workspace: "inventory" | "procurement") {
  if (!fleetId.safeParse(branch).success || !workspaceKinds.safeParse(workspace).success) return null;
  return read("t11_supply_workspace", { p_branch: branch, p_workspace: workspace }, supplyWorkspace);
}
export async function getSupplyActionQueue(branch: number, queue: "receiving" | "stock-review", query: string, page: number) {
  const search = supplyActionQueueSearch.safeParse(query);
  if (!fleetId.safeParse(branch).success || !supplyActionQueueKinds.safeParse(queue).success ||
      !search.success || !supplyActionQueuePage.safeParse(page).success) return null;
  const pageSize = 25;
  const result = await read("fa03_supply_action_queue", {
    p_branch: branch, p_queue: queue, p_search: search.data, p_page: page, p_page_size: pageSize,
  }, supplyActionQueue);
  if (!result || result.queue !== queue || result.page !== page || result.pageSize !== pageSize ||
      result.rows.length > pageSize) return null;
  return result;
}
export async function getSupplyMovement(movement: number) {
  if (!fleetId.safeParse(movement).success) return null;
  return read("t11_movement_receipt", { p_movement: movement }, stockMovement);
}
export async function listFuelAssets() {
  return read("t11_fuel_workspace", {}, fuelAssetList);
}
export async function readFuelAsset(asset: number) {
  if (!fleetId.safeParse(asset).success) return null;
  return read("t11_fuel_workspace", { p_asset: asset }, fuelWorkspace);
}

export async function saveSupplyAction(request: unknown) {
  const validity = supplyRequest.safeParse(request);
  if (!validity.success) return { ok: false as const, error: "Check the fields before saving." };
  try {
    if (!canUseApplication(await getAuthContext())) return { ok: false as const, error: "Sign in again to continue." };
    const { nonce, parent, family, action, data } = validity.data;
    const args = { p_operation: nonce, p_action: action, p_data: data,
      ...(family === "fuel" ? { p_asset: parent } : { p_branch: parent }) };
    const { data: raw, error } = await (await createClient()).rpc(command[family], args);
    if (error) {
      logger.warn("Supply action failed", { family, action, code: error.code });
      const expected = ["42501", "PT409", "P0409", "22023"].includes(error.code);
      const validation = ["23505", "23514", "23502", "22P02", "22003", "22007", "22008"].includes(error.code);
      return { ok: false as const, error: expected ? error.message :
        validation ? "Check for invalid fields or an existing reference." : "The save could not be confirmed. Retry with the same details." };
    }
    const result = supplyActionReceipt.safeParse(raw);
    if (!result.success) return { ok: false as const, error: "The save could not be confirmed. Retry with the same details." };
    revalidatePath("/modules/inventory");
    revalidatePath("/modules/procurement");
    revalidatePath("/modules/fleet/fuel");
    return { ok: true as const, receipt: result.data };
  } catch {
    return { ok: false as const, error: "The save could not be confirmed. Retry with the same details." };
  }
}
