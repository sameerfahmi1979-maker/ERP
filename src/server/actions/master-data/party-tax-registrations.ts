"use server";

import { authorizePartyChildRead } from "@/server/party-child-read-authority";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { setPartyChildArchived } from "@/server/actions/master-data/party-child-lifecycle";
import { createNumberedParty } from "@/server/numbered-party-create";
import { savePartyChild } from "@/server/party-child-save";
import type { PartySaveReceipt } from "@/lib/master-data/party-save-contract";
import type { WorkspaceSaveContract } from "@/lib/workspace/save-contract";
import {
  createPartyTaxRegistrationSchema,
  updatePartyTaxRegistrationSchema,
  type CreatePartyTaxInput,
  type UpdatePartyTaxInput,
} from "@/features/master-data/parties/party-schemas";
import type { PartyTaxRegistration, ActionResult } from "@/features/master-data/parties/party-types";


export async function getPartyTaxRegistrations(partyId: number): Promise<ActionResult<PartyTaxRegistration[]>> {
  try {
    const access = await authorizePartyChildRead(partyId);
    if (!access.success) return access;
    const supabase = access.client;
    const { data, error } = await supabase
      .from("party_tax_registrations")
      .select(`*, tax_types!tax_type_id(tax_name_en), party_tax_statuses!tax_status_id(name_en)`)
      .eq("party_id", partyId)
      .order("is_primary", { ascending: false })
      .order("created_at");

    if (error || !Array.isArray(data)) return { success: false, kind: 'failed', error: 'Tax registrations could not be loaded. Try again.' };

    const rows = (data ?? []).map((row: Record<string, unknown>) => ({
      ...(row as PartyTaxRegistration),
      tax_type_name: (row.tax_types as { tax_name_en?: string } | null)?.tax_name_en ?? undefined,
      tax_status_name: (row.party_tax_statuses as { name_en?: string } | null)?.name_en ?? undefined,
    }));

    return { success: true, data: rows };
  } catch {
    return { success: false, kind: 'failed', error: 'Tax registrations could not be loaded. Try again.' };
  }
}

export async function createPartyTaxRegistration(input: CreatePartyTaxInput, contract: WorkspaceSaveContract): Promise<ActionResult<{ id: number; tax_registration_code: string; revision: string; replayed: boolean }>> {
  try {
    const parsed = createPartyTaxRegistrationSchema.strict().safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues.map(i => i.message).join("; ") };
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.parties.manage_tax")) return { success: false, error: "Permission denied" };
    return await createNumberedParty("party_tax_registrations", parsed.data, contract);
  } catch {
    return { success: false, error: "Creation could not start. Check your session and try again." };
  }
}

export async function updatePartyTaxRegistration(input: UpdatePartyTaxInput, contract?: WorkspaceSaveContract): Promise<ActionResult<PartySaveReceipt>> {
  const parsed = updatePartyTaxRegistrationSchema.strict().safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues.map(i => i.message).join("; ") };
  const { id, ...fields } = parsed.data;
  return savePartyChild("party_tax_registrations", id, fields, contract);
}

/** Compatibility name; this operation archives and never deletes history. */
export async function deletePartyTaxRegistration(id: number, contract?: WorkspaceSaveContract): Promise<ActionResult<PartySaveReceipt & {archived:boolean}>> {
  return setPartyChildArchived("party_tax_registrations", id, true, contract);
}
