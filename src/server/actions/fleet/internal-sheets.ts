"use server";

import { z } from "zod";
import { fleetId } from "@/lib/fleet/asset-contract";
import { canUseApplication, getAuthContext } from "@/lib/rbac/check";
import { createClient } from "@/lib/supabase/server";

const original = z.strictObject({ document: fleetId, version: fleetId, file: fleetId });
const choices = z.array(original.extend({ label: z.string(), reference: z.string() })).max(40);
const filing = z.strictObject({ work: fleetId, operation: z.uuid(), original });
const receipt = z.strictObject({ work: fleetId, evidence: fleetId, replayed: z.boolean() });

export async function readInternalSheetChoices(work: number) {
  if (!fleetId.safeParse(work).success || !canUseApplication(await getAuthContext())) return null;
  const { data, error } = await (await createClient()).rpc("t19_internal_sheet_choices", { p_work: work });
  const parsed = choices.safeParse(data);
  return error || !parsed.success ? null : parsed.data;
}

export async function fileInternalSheet(input: unknown) {
  const parsed = filing.safeParse(input);
  if (!parsed.success) return { error: "Choose the exact signed original." };
  if (!canUseApplication(await getAuthContext())) return { error: "Internal paper filing is unavailable in this scope." };
  const { data, error } = await (await createClient()).rpc("t19_file_internal_sheet", {
    p_operation: parsed.data.operation, p_work: parsed.data.work, p_original: parsed.data.original,
  });
  if (error?.code === "42501") return { error: "Internal paper filing is unavailable in this scope." };
  if (["22023", "23505", "P0409", "PT409"].includes(error?.code ?? ""))
    return { error: "Refresh the available originals and choose the correct file." };
  const result = receipt.safeParse(data);
  if (error || !result.success || result.data.work !== parsed.data.work)
    return { error: "Filing is unconfirmed. Retry the original request.", uncertain: true };
  return { id: result.data.evidence };
}
