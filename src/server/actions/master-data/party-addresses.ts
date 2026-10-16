"use server";

import { authorizePartyChildRead } from "@/server/party-child-read-authority";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { setPartyChildArchived } from "@/server/actions/master-data/party-child-lifecycle";
import { createNumberedParty } from "@/server/numbered-party-create";
import { attachPartyReferenceLabels } from "@/server/party-reference-labels";
import { savePartyAddress } from "@/server/party-address-save";
import type { PartySaveReceipt } from "@/lib/master-data/party-save-contract";
import type { WorkspaceSaveContract } from "@/lib/workspace/save-contract";
import {
  createPartyAddressSchema,
  updatePartyAddressSchema,
  type CreatePartyAddressInput,
  type UpdatePartyAddressInput,
} from "@/features/master-data/parties/party-schemas";
import type { PartyAddress, ActionResult } from "@/features/master-data/parties/party-types";


export async function getPartyAddresses(partyId: number): Promise<ActionResult<PartyAddress[]>> {
  try {
    const access = await authorizePartyChildRead(partyId);
    if (!access.success) return access;
    const supabase = access.client;
    const { data, error } = await supabase
      .from("party_addresses")
      .select(`
        *,
        party_address_types!address_type_id(name_en),
        countries!country_id(name_en),
        emirates!emirate_id(name_en),
        cities!city_id(name_en),
        areas_zones!area_zone_id(name_en)
      `)
      .eq("party_id", partyId)
      .order("is_primary", { ascending: false })
      .order("created_at");

    if (error || !Array.isArray(data)) return { success: false, kind: 'failed', error: 'Addresses could not be loaded. Try again.' };

    const rows = (data ?? []).map((row: Record<string, unknown>) => ({
      ...(row as PartyAddress),
      address_type_name: (row.party_address_types as { name_en?: string } | null)?.name_en ?? undefined,
      country_name: (row.countries as { name_en?: string } | null)?.name_en ?? undefined,
      emirate_name: (row.emirates as { name_en?: string } | null)?.name_en ?? undefined,
      city_name: (row.cities as { name_en?: string } | null)?.name_en ?? undefined,
      area_zone_name: (row.areas_zones as { name_en?: string } | null)?.name_en ?? undefined,
    }));

    return { success: true, data: await attachPartyReferenceLabels('party_addresses', rows) };
  } catch {
    return { success: false, kind: 'failed', error: 'Addresses could not be loaded. Try again.' };
  }
}

export async function createPartyAddress(input: CreatePartyAddressInput, contract: WorkspaceSaveContract): Promise<ActionResult<{ id: number; address_code: string; revision: string; replayed: boolean }>> {
  try {
    const parsed = createPartyAddressSchema.strict().safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues.map(i => i.message).join("; ") };
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.parties.manage_addresses")) return { success: false, error: "Permission denied" };
    return await createNumberedParty("party_addresses", parsed.data, contract);
  } catch {
    return { success: false, error: "Creation could not start. Check your session and try again." };
  }
}

export async function updatePartyAddress(input: UpdatePartyAddressInput, contract?: WorkspaceSaveContract): Promise<ActionResult<PartySaveReceipt>> {
  try {
    const parsed = updatePartyAddressSchema.strict().safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
    }

    const { id, ...fields } = parsed.data;
    return await savePartyAddress(id, fields, contract);
  } catch {
    return { success: false, error: "The save could not start. Check your session and try again." };
  }
}

/** Compatibility name; this operation archives and never deletes history. */
export async function deletePartyAddress(id: number, contract?: WorkspaceSaveContract): Promise<ActionResult<PartySaveReceipt & {archived:boolean}>> {
  return setPartyChildArchived("party_addresses", id, true, contract);
}
