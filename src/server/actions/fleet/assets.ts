"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  fleetAsset, fleetChoices, fleetCommand, fleetId, fleetPartyChoices, fleetReceipt, fleetRow,
  type FleetReceipt,
} from "@/lib/fleet/asset-contract";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { canUseApplication } from "@/lib/rbac/scope";
import { createClient } from "@/lib/supabase/server";

async function readFleet<T>(name: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<T | null> {
  const actor = await getAuthContext();
  if (!canUseApplication(actor) || !hasPermission(actor, "fleet.assets.view")) return null;
  const db = await createClient();
  const { data, error } = await db.rpc(name, args, { get: true });
  const parsed = schema.safeParse(data);
  return error || !parsed.success ? null : parsed.data;
}

export async function listFleetAssets(query: string, offset: number) {
  if (query.length > 200 || !Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) return null;
  return readFleet("t05_search_fleet_assets", { p_query: query, p_limit: 26, p_offset: offset }, z.array(fleetRow).max(26));
}

export async function getFleetAsset(asset: number) {
  if (!fleetId.safeParse(asset).success) return null;
  return readFleet("t05_read_fleet_asset", { p_asset: asset }, fleetAsset);
}

export async function getFleetChoices(company?: number, branch?: number) {
  if (company !== undefined && !fleetId.safeParse(company).success) return null;
  if (branch !== undefined && !fleetId.safeParse(branch).success) return null;
  return readFleet("t05_fleet_asset_choices", { p_company: company, p_branch: branch }, fleetChoices);
}

export async function searchFleetParties(company: number, branch: number, query: string) {
  if (!fleetId.safeParse(company).success || !fleetId.safeParse(branch).success || query.trim().length < 2 || query.length > 100) return null;
  return readFleet("t05_search_fleet_parties", { p_company: company, p_branch: branch, p_query: query }, fleetPartyChoices);
}

type SaveResult = { data: FleetReceipt } | { error: string; uncertain: boolean };

export async function saveFleetAsset(input: unknown): Promise<SaveResult> {
  const parsed = fleetCommand.safeParse(input);
  if (!parsed.success) return { error: "Check the Fleet form and try again.", uncertain: false };
  const command = parsed.data;
  try {
    if (!canUseApplication(await getAuthContext())) return { error: "An active ERP session is required.", uncertain: false };
    const db = await createClient();
    const { data, error } = await db.rpc("t05_write_fleet_asset", {
      p_operation: command.operation, p_asset: command.asset, p_action: command.action, p_data: command.data,
    });
    const code = error?.code ?? "";
    if (code === "42501") return { error: "This asset or document is outside your current authority.", uncertain: false };
    if (code === "23505" || code === "23P01") return { error: "That identifier or plate period is already recorded.", uncertain: false };
    if (code === "PT409" || code === "P0409") return { error: "The record, dates or evidence changed. Refresh and review before saving.", uncertain: false };
    if (code.startsWith("22") || code.startsWith("23")) return { error: "Check the dates, required facts and selected evidence.", uncertain: false };
    const saved = fleetReceipt.safeParse(data);
    if (error || !saved.success || (command.asset !== null && saved.data.id !== command.asset)) {
      return { error: "The save result is unconfirmed. Retry the original request.", uncertain: true };
    }
    try {
      revalidatePath("/modules/fleet");
      revalidatePath(`/modules/fleet/${saved.data.id}`);
    } catch { /* The committed receipt is authoritative. */ }
    return { data: saved.data };
  } catch {
    return { error: "The save result is unconfirmed. Retry the original request.", uncertain: true };
  }
}
