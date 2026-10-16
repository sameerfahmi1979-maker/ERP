"use server";

import { authorizePartyChildRead } from "@/server/party-child-read-authority";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { setPartyChildArchived } from "@/server/actions/master-data/party-child-lifecycle";
import { createNumberedParty } from "@/server/numbered-party-create";
import { savePartyChild } from "@/server/party-child-save";
import type { PartySaveReceipt } from "@/lib/master-data/party-save-contract";
import type { WorkspaceSaveContract } from "@/lib/workspace/save-contract";
import {
  createPartyDocumentSchema,
  updatePartyDocumentSchema,
  type CreatePartyDocumentInput,
  type UpdatePartyDocumentInput,
} from "@/features/master-data/parties/party-schemas";
import type { PartyDocument, ActionResult } from "@/features/master-data/parties/party-types";


export async function getPartyDocuments(partyId: number): Promise<ActionResult<PartyDocument[]>> {
  try {
    const access = await authorizePartyChildRead(partyId);
    if (!access.success) return access;
    const supabase = access.client;
    const { data, error } = await supabase
      .from("party_documents")
      .select(`*, party_document_types!document_type_id(name_en), party_document_statuses!document_status_id(name_en)`)
      .eq("party_id", partyId)
      .order("created_at", { ascending: false });

    if (error || !Array.isArray(data)) return { success: false, kind: 'failed', error: 'Documents could not be loaded. Try again.' };

    const rows = (data ?? []).map((row: Record<string, unknown>) => ({
      ...(row as PartyDocument),
      document_type_name: (row.party_document_types as { name_en?: string } | null)?.name_en ?? undefined,
      document_status_name: (row.party_document_statuses as { name_en?: string } | null)?.name_en ?? undefined,
    }));

    return { success: true, data: rows };
  } catch {
    return { success: false, kind: 'failed', error: 'Documents could not be loaded. Try again.' };
  }
}

export async function createPartyDocument(input: CreatePartyDocumentInput, contract: WorkspaceSaveContract): Promise<ActionResult<{ id: number; document_code: string; revision: string; replayed: boolean }>> {
  try {
    const parsed = createPartyDocumentSchema.strict().safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues.map(i => i.message).join("; ") };
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.parties.manage_documents")) return { success: false, error: "Permission denied" };
    return await createNumberedParty("party_documents", parsed.data, contract);
  } catch {
    return { success: false, error: "Creation could not start. Check your session and try again." };
  }
}

export async function updatePartyDocument(input: UpdatePartyDocumentInput, contract?: WorkspaceSaveContract): Promise<ActionResult<PartySaveReceipt>> {
  const parsed = updatePartyDocumentSchema.strict().safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues.map(i => i.message).join("; ") };
  const { id, ...fields } = parsed.data;
  return savePartyChild("party_documents", id, fields, contract);
}

/** Compatibility name; this operation archives and never deletes history. */
export async function deletePartyDocument(id: number, contract?: WorkspaceSaveContract): Promise<ActionResult<PartySaveReceipt & {archived:boolean}>> {
  return setPartyChildArchived("party_documents", id, true, contract);
}
