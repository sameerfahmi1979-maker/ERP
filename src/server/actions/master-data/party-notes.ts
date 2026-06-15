"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import { generateNextReference } from "@/server/actions/numbering";
import { z } from "zod";
import type { ActionResult } from "@/features/master-data/parties/party-types";

const REVALIDATE_PATH = "/admin/master-data/parties";

export type PartyNote = {
  id: number;
  note_code: string;
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
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("party_notes")
      .select("*, party_note_types!note_type_id(name_en)")
      .eq("party_id", partyId)
      .order("created_at", { ascending: false });
    if (error) return { success: false, error: error.message };

    const rows = (data ?? []).map((row: Record<string, unknown>) => ({
      ...(row as PartyNote),
      note_type_name: (row.party_note_types as { name_en?: string } | null)?.name_en ?? null,
    }));
    return { success: true, data: rows };
  } catch (error) {
    return { success: false, error: String(error) };
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

const updateNoteSchema = createNoteSchema.extend({ id: z.number().int().positive() });

export async function createPartyNote(input: z.infer<typeof createNoteSchema>): Promise<ActionResult<{ id: number; note_code: string }>> {
  try {
    const parsed = createNoteSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };

    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.parties.edit")) return { success: false, error: "Permission denied" };

    const numberingResult = await generateNextReference({
      ruleCode: "MASTER_PARTY_NOTE",
      targetTableName: "party_notes",
      generationReason: "Party note creation",
    });
    if (!numberingResult.success || !numberingResult.data?.generatedReferenceNumber) {
      return { success: false, error: "Failed to generate note code" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("party_notes")
      .insert({ ...parsed.data, note_code: numberingResult.data.generatedReferenceNumber, created_by: ctx.profile?.id, updated_by: ctx.profile?.id })
      .select("id, note_code")
      .single();
    if (error) return { success: false, error: error.message };

    await logAudit({ module_code: "MASTER_DATA", entity_name: "party_notes", entity_id: data.id, entity_reference: data.note_code, action: "create", new_values: { ...parsed.data, note_code: data.note_code } });
    revalidatePath(REVALIDATE_PATH);
    return { success: true, data: { id: data.id, note_code: data.note_code } };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function updatePartyNote(input: z.infer<typeof updateNoteSchema>): Promise<ActionResult> {
  try {
    const parsed = updateNoteSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };

    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.parties.edit")) return { success: false, error: "Permission denied" };

    const { id, ...fields } = parsed.data;
    const supabase = await createClient();
    const { data: old } = await supabase.from("party_notes").select("note_code, created_by").eq("id", id).single();

    // Only creator or admin can edit a note
    if (old?.created_by && old.created_by !== ctx.profile?.id && !hasPermission(ctx, "system_admin")) {
      return { success: false, error: "Only the note author can edit this note" };
    }

    const { error } = await supabase.from("party_notes").update({ ...fields, updated_by: ctx.profile?.id }).eq("id", id);
    if (error) return { success: false, error: error.message };

    await logAudit({ module_code: "MASTER_DATA", entity_name: "party_notes", entity_id: id, entity_reference: old?.note_code ?? String(id), action: "update", new_values: fields });
    revalidatePath(REVALIDATE_PATH);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function deletePartyNote(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    const supabase = await createClient();
    const { data: old } = await supabase.from("party_notes").select("note_code, created_by").eq("id", id).single();

    if (old?.created_by && old.created_by !== ctx.profile?.id && !hasPermission(ctx, "system_admin")) {
      return { success: false, error: "Only the note author can delete this note" };
    }

    const { error } = await supabase.from("party_notes").delete().eq("id", id);
    if (error) return { success: false, error: error.message };

    await logAudit({ module_code: "MASTER_DATA", entity_name: "party_notes", entity_id: id, entity_reference: old?.note_code ?? String(id), action: "delete" });
    revalidatePath(REVALIDATE_PATH);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
