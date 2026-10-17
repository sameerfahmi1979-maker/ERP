"use server";

import { authorizePartyChildRead } from "@/server/party-child-read-authority";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { setPartyChildArchived } from "@/server/actions/master-data/party-child-lifecycle";
import { createNumberedParty } from "@/server/numbered-party-create";
import { savePartyChild, verifyPartyBank } from "@/server/party-child-save";
import type { PartySaveReceipt } from "@/lib/master-data/party-save-contract";
import type { WorkspaceSaveContract } from "@/lib/workspace/save-contract";
import {
  createPartyBankDetailSchema,
  updatePartyBankDetailSchema,
  type CreatePartyBankDetailInput,
  type UpdatePartyBankDetailInput,
} from "@/features/master-data/parties/party-schemas";
import type { PartyBankDetail, ActionResult } from "@/features/master-data/parties/party-types";


export async function getPartyBankDetails(partyId: number): Promise<ActionResult<PartyBankDetail[]>> {
  try {
    const access = await authorizePartyChildRead(partyId, true);
    if (!access.success) return access;
    const supabase = access.client;
    const { data, error } = await supabase
      .from("party_bank_details")
      .select(`*, banks!bank_id(bank_name_en), currencies!currency_id(currency_code), countries!country_id(name_en)`)
      .eq("party_id", partyId)
      .order("is_primary", { ascending: false })
      .order("created_at");

    if (error || !Array.isArray(data)) return { success: false, kind: 'failed', error: 'Bank details could not be loaded. Try again.' };

    const rows = (data ?? []).map((row: Record<string, unknown>) => ({
      ...(row as PartyBankDetail),
      bank_name: (row.banks as { bank_name_en?: string } | null)?.bank_name_en ?? undefined,
      currency_code: (row.currencies as { currency_code?: string } | null)?.currency_code ?? undefined,
      country_name: (row.countries as { name_en?: string } | null)?.name_en ?? undefined,
    }));

    return { success: true, data: rows };
  } catch {
    return { success: false, kind: 'failed', error: 'Bank details could not be loaded. Try again.' };
  }
}

export async function createPartyBankDetail(input: CreatePartyBankDetailInput, contract: WorkspaceSaveContract): Promise<ActionResult<{ id: number; bank_detail_code: string; revision: string; replayed: boolean }>> {
  try {
    const parsed = createPartyBankDetailSchema.strict().safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues.map(i => i.message).join("; ") };
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.parties.manage_bank_details")) return { success: false, error: "Permission denied" };
    return await createNumberedParty("party_bank_details", parsed.data, contract);
  } catch {
    return { success: false, error: "Creation could not start. Check your session and try again." };
  }
}

export async function updatePartyBankDetail(input: UpdatePartyBankDetailInput, contract?: WorkspaceSaveContract): Promise<ActionResult<PartySaveReceipt>> {
  const parsed = updatePartyBankDetailSchema.strict().safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues.map(i => i.message).join("; ") };
  const { id, ...fields } = parsed.data;
  return savePartyChild("party_bank_details", id, fields, contract);
}

export async function verifyPartyBankDetail(id: number, contract?: WorkspaceSaveContract): Promise<ActionResult<PartySaveReceipt>> {
  return verifyPartyBank(id, contract);
}

/** Compatibility name; this operation archives and never deletes history. */
export async function deletePartyBankDetail(id: number, contract?: WorkspaceSaveContract): Promise<ActionResult<PartySaveReceipt & {archived:boolean}>> {
  return setPartyChildArchived("party_bank_details", id, true, contract);
}
