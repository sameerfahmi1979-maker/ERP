"use server";

import { createClient } from "@/lib/supabase/server";
import { authorizePartyChildRead } from "@/server/party-child-read-authority";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { setPartyChildArchived } from "@/server/actions/master-data/party-child-lifecycle";
import { createNumberedParty } from "@/server/numbered-party-create";
import { savePartyChild } from "@/server/party-child-save";
import type { PartySaveReceipt } from "@/lib/master-data/party-save-contract";
import type { WorkspaceSaveContract } from "@/lib/workspace/save-contract";
import { z } from "zod";
import type { ActionResult } from "@/features/master-data/parties/party-types";


export type PartyNote = {
  archived_at?: string | null;
  id: number;
  note_code: string;
  workspace_revision?: number;
  party_id: number;
  note_type_id: number | null;
  note_title: string | null;
  note_body: string;
  is_private: boolean;
  follow_up_date: string | null;
  created_at: string;
  created_by: number | null;
  updated_at: string;
  updated_by: number | null;
  // Joined
  note_type_name?: string | null;
};

export type PartyNoteType = {
  id: number;
  note_type_code: string;
  name_en: string;
  is_active: boolean;
  sort_order: number;
};

export async function getPartyNoteTypes(): Promise<ActionResult<PartyNoteType[]>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("party_note_types").select("*").eq("is_active", true).order("sort_order");
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as PartyNoteType[] };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function getPartyNotes(partyId: number): Promise<ActionResult<PartyNote[]>> {
  try {
    const access = await authorizePartyChildRead(partyId);
    if (!access.success) return access;
    const supabase = access.client;
    const { data, error } = await supabase
      .from("party_notes")
      .select("*, party_note_types!note_type_id(name_en)")
      .eq("party_id", partyId)
      .order("created_at", { ascending: false });
    if (error || !Array.isArray(data)) return { success: false, kind: 'failed', error: 'Notes could not be loaded. Try again.' };

    const rows = (data ?? []).map((row: Record<string, unknown>) => ({
      ...(row as PartyNote),
      note_type_name: (row.party_note_types as { name_en?: string } | null)?.name_en ?? null,
    }));
    return { success: true, data: rows };
  } catch {
    return { success: false, kind: 'failed', error: 'Notes could not be loaded. Try again.' };
  }
}

const createNoteSchema = z.object({
  party_id: z.number().int().positive(),
  note_type_id: z.number().int().positive().nullable().optional(),
  note_title: z.string().nullable().optional(),
  note_body: z.string().min(1, "Note body is required"),
  is_private: z.boolean().default(false),
  follow_up_date: z.string().nullable().optional(),
});

const updateNoteSchema = createNoteSchema.extend({ id: z.number().int().positive(), is_private: z.boolean().optional() });

export async function createPartyNote(input: z.infer<typeof createNoteSchema>, contract: WorkspaceSaveContract): Promise<ActionResult<{ id: number; note_code: string; revision: string; replayed: boolean }>> {
  try {
    const parsed = createNoteSchema.strict().safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues.map(i => i.message).join("; ") };
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.parties.edit")) return { success: false, error: "Permission denied" };
    return await createNumberedParty("party_notes", parsed.data, contract);
  } catch {
    return { success: false, error: "Creation could not start. Check your session and try again." };
  }
}

export async function updatePartyNote(input: z.infer<typeof updateNoteSchema>, contract?: WorkspaceSaveContract): Promise<ActionResult<PartySaveReceipt>> {
  const parsed = updateNoteSchema.strict().safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues.map(i => i.message).join("; ") };
  const { id, ...fields } = parsed.data;
  return savePartyChild("party_notes", id, fields, contract);
}

/** Compatibility name; this operation archives and never deletes history. */
export async function deletePartyNote(id: number, contract?: WorkspaceSaveContract): Promise<ActionResult<PartySaveReceipt & {archived:boolean}>> {
  return setPartyChildArchived("party_notes", id, true, contract);
}
