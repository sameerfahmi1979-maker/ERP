"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import { generateNextReference } from "@/server/actions/numbering";
import {
  createPartyContactSchema,
  updatePartyContactSchema,
  type CreatePartyContactInput,
  type UpdatePartyContactInput,
} from "@/features/master-data/parties/party-schemas";
import type { PartyContact, ActionResult } from "@/features/master-data/parties/party-types";

const REVALIDATE_PATH = "/admin/master-data/parties";

export async function getPartyContacts(partyId: number): Promise<ActionResult<PartyContact[]>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("party_contacts")
      .select(`*, party_contact_departments!department_id(name_en), party_contact_roles!contact_role_id(name_en)`)
      .eq("party_id", partyId)
      .order("is_primary", { ascending: false })
      .order("full_name");

    if (error) return { success: false, error: error.message };

    const rows = (data ?? []).map((row: Record<string, unknown>) => ({
      ...(row as PartyContact),
      department_name: (row.party_contact_departments as { name_en?: string } | null)?.name_en ?? undefined,
      contact_role_name: (row.party_contact_roles as { name_en?: string } | null)?.name_en ?? undefined,
    }));

    return { success: true, data: rows };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function createPartyContact(input: CreatePartyContactInput): Promise<ActionResult<{ id: number; contact_code: string }>> {
  try {
    const parsed = createPartyContactSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
    }

    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.parties.manage_contacts")) {
      return { success: false, error: "You do not have permission to manage contacts" };
    }

    const numberingResult = await generateNextReference({
      ruleCode: "MASTER_PARTY_CONTACT",
      targetTableName: "party_contacts",
      generationReason: "Party contact creation",
    });
    if (!numberingResult.success || !numberingResult.data?.generatedReferenceNumber) {
      return { success: false, error: "Failed to generate contact code" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("party_contacts")
      .insert({
        ...parsed.data,
        contact_code: numberingResult.data.generatedReferenceNumber,
        created_by: ctx.profile?.id ?? null,
        updated_by: ctx.profile?.id ?? null,
      })
      .select("id, contact_code")
      .single();

    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code: "MASTER_DATA",
      entity_name: "party_contacts",
      entity_id: data.id,
      entity_reference: data.contact_code,
      action: "create",
      new_values: parsed.data,
    });

    revalidatePath(REVALIDATE_PATH);
    return { success: true, data: { id: data.id, contact_code: data.contact_code } };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function updatePartyContact(input: UpdatePartyContactInput): Promise<ActionResult> {
  try {
    const parsed = updatePartyContactSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
    }

    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.parties.manage_contacts")) {
      return { success: false, error: "You do not have permission to manage contacts" };
    }

    const { id, ...fields } = parsed.data;
    const supabase = await createClient();
    const { data: old } = await supabase.from("party_contacts").select("contact_code").eq("id", id).single();

    const { error } = await supabase
      .from("party_contacts")
      .update({ ...fields, updated_by: ctx.profile?.id ?? null })
      .eq("id", id);

    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code: "MASTER_DATA",
      entity_name: "party_contacts",
      entity_id: id,
      entity_reference: old?.contact_code ?? String(id),
      action: "update",
      new_values: fields,
    });

    revalidatePath(REVALIDATE_PATH);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function deletePartyContact(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.parties.manage_contacts")) {
      return { success: false, error: "You do not have permission to manage contacts" };
    }

    const supabase = await createClient();
    const { data: old } = await supabase.from("party_contacts").select("contact_code").eq("id", id).single();
    const { error } = await supabase.from("party_contacts").delete().eq("id", id);
    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code: "MASTER_DATA",
      entity_name: "party_contacts",
      entity_id: id,
      entity_reference: old?.contact_code ?? String(id),
      action: "delete",
    });

    revalidatePath(REVALIDATE_PATH);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
