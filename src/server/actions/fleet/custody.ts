"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  availabilityInput, custodyChoices, custodyCommand, custodyOccurrence, custodyReceipt,
  custodyWorkspace, fleetAvailability, fleetBoard, fleetExitScopes, fleetExitTasks, occurrenceInput,
} from "@/lib/fleet/custody-contract";
import { fleetId, fleetRow } from "@/lib/fleet/asset-contract";
import { logger } from "@/lib/logger";
import { getAuthContext } from "@/lib/rbac/check";
import { canUseApplication } from "@/lib/rbac/scope";
import { createClient } from "@/lib/supabase/server";

async function custodyRead<T>(name: string, args: Record<string, unknown>, schema: z.ZodType<T>, get = true) {
  if (!canUseApplication(await getAuthContext())) return null;
  const db = await createClient();
  const result = await db.rpc(name,args,{ get });
  if (result.error) {
    logger.warn("Fleet read unavailable", { rpc:name, code:result.error.code });
    return null;
  }
  if (result.data===null) return null;
  const value = schema.safeParse(result.data);
  if (!value.success) {
    logger.warn("Fleet read response did not match its contract", { rpc:name, fields:value.error.issues.map(issue=>issue.path.join(".")) });
    return null;
  }
  return value.data;
}

export async function getFleetCustody(asset: number, before?: number) {
  if (!fleetId.safeParse(asset).success || (before !== undefined && !fleetId.safeParse(before).success)) return null;
  return custodyRead("t06_fleet_custody_workspace",{p_asset:asset,p_before:before},custodyWorkspace);
}

export async function getFleetBoard(assets: number[]) {
  const ids=z.array(fleetId).min(1).max(50).safeParse(assets);
  return ids.success ? custodyRead("t06_fleet_board",{p_assets:ids.data},fleetBoard) : null;
}

export async function getFleetExitScopes() {
  return custodyRead("t18_fleet_exit_scopes", {}, fleetExitScopes, false);
}

export async function getFleetExitTasks(company: number, branch: number) {
  if (!fleetId.safeParse(company).success || !fleetId.safeParse(branch).success) return null;
  return custodyRead("t18_fleet_exit_tasks", { p_company: company, p_branch: branch }, fleetExitTasks, false);
}

export async function listHostedAssets(query: string) {
  if (query.length>200) return null;
  return custodyRead("t06_fleet_host_assets",{p_query:query},z.array(fleetRow).max(25));
}

export async function getCustodyChoices(asset: number, query: string) {
  if (!fleetId.safeParse(asset).success || query.length>100) return null;
  return custodyRead("t06_fleet_custody_choices",{p_asset:asset,p_query:query},custodyChoices);
}

export async function checkFleetAvailability(input: unknown) {
  const parsed=availabilityInput.safeParse(input);
  if (!parsed.success) return null;
  const {asset,employee,site,from,until}=parsed.data;
  return custodyRead("t06_fleet_availability",{p_asset:asset,p_employee:employee,p_site:site,p_from:from,p_to:until},fleetAvailability);
}

export async function findFleetCustodyAt(input: unknown) {
  const parsed=occurrenceInput.safeParse(input);
  if (!parsed.success) return null;
  const {asset,at,jurisdiction,plateClass,plate}=parsed.data;
  return custodyRead("t06_fleet_custody_at",{
    p_at:at,p_asset:asset,p_jurisdiction:jurisdiction,p_plate_class:plateClass,p_plate:plate,
  },custodyOccurrence);
}

export async function saveFleetCustody(input: unknown) {
  const parsed=custodyCommand.safeParse(input);
  if (!parsed.success) return {error:"Check the required fields.",uncertain:false} as const;
  const cmd=parsed.data;
  try {
    if (!canUseApplication(await getAuthContext())) return {error:"An active ERP session is required.",uncertain:false} as const;
    const db=await createClient();
    const policy=cmd.action==="prepare-policy" || cmd.action==="approve-policy";
    const result=policy
      ? await db.rpc("t06_fleet_policy",{p_operation:cmd.operation,p_company:cmd.company,
          p_action:cmd.action==="prepare-policy"?"prepare":"approve",p_data:cmd.data})
      : await db.rpc("t06_fleet_command",{p_operation:cmd.operation,p_asset:cmd.asset,p_action:cmd.action,p_data:cmd.data});
    const code=result.error?.code??"";
    if (code==="42501") return {error:"This action is outside your current Fleet authority.",uncertain:false} as const;
    if (code==="PT409" || code==="P0409" || code==="23P01" || code==="23505")
      return {error:"The commitment, availability, approval or proof changed. Refresh and review before saving.",uncertain:false} as const;
    if (code.startsWith("22") || code.startsWith("23"))
      return {error:"Check dates, the condition and the selected evidence or rule.",uncertain:false} as const;
    const saved=custodyReceipt.safeParse(result.data);
    if (result.error || !saved.success || (!policy && saved.data.asset_id!==cmd.asset))
      return {error:"Save outcome is unconfirmed. Retry the original request.",uncertain:true} as const;
    try { revalidatePath("/modules/fleet"); revalidatePath(`/modules/fleet/${cmd.asset}`); }
    catch { /* The persisted receipt controls retries. */ }
    return {data:saved.data} as const;
  } catch {
    return {error:"Save outcome is unconfirmed. Retry the original request.",uncertain:true} as const;
  }
}
