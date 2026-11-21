
"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { fleetId } from "@/lib/fleet/asset-contract";
import {
  fineAssignments, fineBranchChoices, fineDriverChoices, fineFleetCommand, fineFleetWorkspace, fineReceipt,
  fleetFinePath, scopeFineBranches,
} from "@/lib/fleet/fine-contract";
import { canUseApplication, getAuthContext } from "@/lib/rbac/check";
import { createClient } from "@/lib/supabase/server";

async function read<T>(rpc: string, args: Record<string, unknown>, contract: z.ZodType<T>) {
  try {
    const actor = await getAuthContext();
    if (!canUseApplication(actor) || fineAssignments(actor.roleAssignments).length === 0) return null;
    const { data, error } = await (await createClient()).rpc(rpc, args);
    if (error) return null;
    const result = contract.safeParse(data);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export async function readFleetFineBranches() {
  const actor = await getAuthContext();
  if (!canUseApplication(actor) || fineAssignments(actor.roleAssignments).length === 0) return [];
  const branches = await read("t13_fleet_scopes", {}, fineBranchChoices);
  return branches ? scopeFineBranches(branches, actor.roleAssignments) : null;
}

export async function readFleetFines(branch: number, before: number | null = null) {
  if (!fleetId.safeParse(branch).success || !fleetId.nullable().safeParse(before).success) return null;
  return read("t13_fleet_workspace_page", { p_branch: branch, p_before: before }, fineFleetWorkspace);
}

export async function readFleetFineDrivers(caseId: number, search: string) {
  if (!fleetId.safeParse(caseId).success || typeof search !== "string") return null;
  const query = search.trim();
  if (query.length < 2 || query.length > 80) return null;
  return read("t13_driver_choices", { p_case: caseId, p_search: query }, fineDriverChoices);
}

type SaveResult = { ok: true; id: number; replayed: boolean } | { ok: false; error: string; uncertain: boolean };
const uncertainSave: SaveResult = { ok: false, error: "Save unconfirmed. Retry the original request.", uncertain: true };

export async function saveFleetFine(input: unknown): Promise<SaveResult> {
  const command = fineFleetCommand.safeParse(input);
  if (!command.success) return { ok: false, error: "Check the required details and the selected DMS original.", uncertain: false };
  try {
    const actor = await getAuthContext();
    if (!canUseApplication(actor) || fineAssignments(actor.roleAssignments).length === 0) {
      return { ok: false, error: "An active ERP session and an assigned Fleet scope are required.", uncertain: false };
    }
    const { operation, target, action, data: facts } = command.data;
    const { data, error } = await (await createClient()).rpc("t13_fleet_command", {
      p_operation: operation, p_target: target, p_action: action, p_data: facts,
    });
    if (error?.code === "42501") {
      return { ok: false, error: "This request requires current authority in the affected scope.", uncertain: false };
    }
    if (["PT409", "P0409", "55000"].includes(error?.code ?? "")) {
      return { ok: false, error: "Check the current source, retained original and whether this reference is already recorded.", uncertain: false };
    }
    if (error?.code?.startsWith("22") || error?.code?.startsWith("23")) {
      return { ok: false, error: "Check the amount, dates, selected records and required details.", uncertain: false };
    }
    const receipt = fineReceipt.safeParse(data);
    if (error || !receipt.success) return uncertainSave;
    try { revalidatePath(fleetFinePath); } catch { /* The database receipt confirms the save. */ }
    return { ok: true, ...receipt.data };
  } catch {
    return uncertainSave;
  }
}

