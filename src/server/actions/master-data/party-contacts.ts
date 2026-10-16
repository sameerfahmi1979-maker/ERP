"use server";

import { authorizePartyChildRead } from "@/server/party-child-read-authority";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { setPartyChildArchived } from "@/server/actions/master-data/party-child-lifecycle";
import { createNumberedParty } from "@/server/numbered-party-create";
import { savePartyChild } from "@/server/party-child-save";
import type { PartySaveReceipt } from "@/lib/master-data/party-save-contract";
import type { WorkspaceSaveContract } from "@/lib/workspace/save-contract";
import {
  createPartyContactSchema,
  updatePartyContactSchema,
  type CreatePartyContactInput,
  type UpdatePartyContactInput,
} from "@/features/master-data/parties/party-schemas";
import type { PartyContact, ActionResult } from "@/features/master-data/parties/party-types";


export async function getPartyContacts(partyId: number): Promise<ActionResult<PartyContact[]>> {
  try {
    const access = await authorizePartyChildRead(partyId);
    if (!access.success) return access;
    const supabase = access.client;
    const { data, error } = await supabase
      .from("party_contacts")
      .select(`*, party_contact_departments!department_id(name_en), party_contact_roles!contact_role_id(name_en)`)
      .eq("party_id", partyId)
      .order("is_primary", { ascending: false })
      .order("full_name");

    if (error || !Array.isArray(data)) return { success: false, kind: 'failed', error: 'Contacts could not be loaded. Try again.' };

    const rows = (data ?? []).map((row: Record<string, unknown>) => ({
      ...(row as PartyContact),
      department_name: (row.party_contact_departments as { name_en?: string } | null)?.name_en ?? undefined,
      contact_role_name: (row.party_contact_roles as { name_en?: string } | null)?.name_en ?? undefined,
    }));

    return { success: true, data: rows };
  } catch {
    return { success: false, kind: 'failed', error: 'Contacts could not be loaded. Try again.' };
  }
}

export async function createPartyContact(input: CreatePartyContactInput, contract: WorkspaceSaveContract): Promise<ActionResult<{ id: number; contact_code: string; revision: string; replayed: boolean }>> {
  try {
    const parsed = createPartyContactSchema.strict().safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues.map(i => i.message).join("; ") };
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.parties.manage_contacts")) return { success: false, error: "Permission denied" };
    return await createNumberedParty("party_contacts", parsed.data, contract);
  } catch {
    return { success: false, error: "Creation could not start. Check your session and try again." };
  }
}

export async function updatePartyContact(input: UpdatePartyContactInput, contract?: WorkspaceSaveContract): Promise<ActionResult<PartySaveReceipt>> {
  const parsed = updatePartyContactSchema.strict().safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues.map(i => i.message).join("; ") };
  const { id, ...fields } = parsed.data;
  return savePartyChild("party_contacts", id, fields, contract);
}

/** Compatibility name; this operation archives and never deletes history. */
export async function deletePartyContact(id: number, contract?: WorkspaceSaveContract): Promise<ActionResult<PartySaveReceipt & {archived:boolean}>> {
  return setPartyChildArchived("party_contacts", id, true, contract);
}
