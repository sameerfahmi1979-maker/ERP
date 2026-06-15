"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import { generateNextReference } from "@/server/actions/numbering";
import {
  createPartyTaxRegistrationSchema,
  updatePartyTaxRegistrationSchema,
  type CreatePartyTaxInput,
  type UpdatePartyTaxInput,
} from "@/features/master-data/parties/party-schemas";
import type { PartyTaxRegistration, ActionResult } from "@/features/master-data/parties/party-types";

const REVALIDATE_PATH = "/admin/master-data/parties";

export async function getPartyTaxRegistrations(partyId: number): Promise<ActionResult<PartyTaxRegistration[]>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("party_tax_registrations")
      .select(`*, tax_types!tax_type_id(name_en), party_tax_statuses!tax_status_id(name_en)`)
      .eq("party_id", partyId)
      .order("is_primary", { ascending: false })
      .order("created_at");

    if (error) return { success: false, error: error.message };

    const rows = (data ?? []).map((row: Record<string, unknown>) => ({
      ...(row as PartyTaxRegistration),
      tax_type_name: (row.tax_types as { name_en?: string } | null)?.name_en ?? undefined,
      tax_status_name: (row.party_tax_statuses as { name_en?: string } | null)?.name_en ?? undefined,
    }));

    return { success: true, data: rows };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function createPartyTaxRegistration(input: CreatePartyTaxInput): Promise<ActionResult<{ id: number; tax_registration_code: string }>> {
  try {
    const parsed = createPartyTaxRegistrationSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
    }

    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.parties.manage_tax")) {
      return { success: false, error: "You do not have permission to manage tax registrations" };
    }

    const numberingResult = await generateNextReference({
      ruleCode: "MASTER_PARTY_TAX",
      targetTableName: "party_tax_registrations",
      generationReason: "Party tax registration creation",
    });
    if (!numberingResult.success || !numberingResult.data?.generatedReferenceNumber) {
      return { success: false, error: "Failed to generate tax registration code" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("party_tax_registrations")
      .insert({
        ...parsed.data,
        tax_registration_code: numberingResult.data.generatedReferenceNumber,
        created_by: ctx.profile?.id ?? null,
        updated_by: ctx.profile?.id ?? null,
      })
      .select("id, tax_registration_code")
      .single();

    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code: "MASTER_DATA",
      entity_name: "party_tax_registrations",
      entity_id: data.id,
      entity_reference: data.tax_registration_code,
      action: "create",
      new_values: parsed.data,
    });

    revalidatePath(REVALIDATE_PATH);
    return { success: true, data: { id: data.id, tax_registration_code: data.tax_registration_code } };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function updatePartyTaxRegistration(input: UpdatePartyTaxInput): Promise<ActionResult> {
  try {
    const parsed = updatePartyTaxRegistrationSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
    }

    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.parties.manage_tax")) {
      return { success: false, error: "You do not have permission to manage tax registrations" };
    }

    const { id, ...fields } = parsed.data;
    const supabase = await createClient();
    const { data: old } = await supabase.from("party_tax_registrations").select("tax_registration_code").eq("id", id).single();

    const { error } = await supabase
      .from("party_tax_registrations")
      .update({ ...fields, updated_by: ctx.profile?.id ?? null })
      .eq("id", id);

    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code: "MASTER_DATA",
      entity_name: "party_tax_registrations",
      entity_id: id,
      entity_reference: old?.tax_registration_code ?? String(id),
      action: "update",
      new_values: fields,
    });

    revalidatePath(REVALIDATE_PATH);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function deletePartyTaxRegistration(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.parties.manage_tax")) {
      return { success: false, error: "You do not have permission to manage tax registrations" };
    }

    const supabase = await createClient();
    const { data: old } = await supabase.from("party_tax_registrations").select("tax_registration_code").eq("id", id).single();
    const { error } = await supabase.from("party_tax_registrations").delete().eq("id", id);
    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code: "MASTER_DATA",
      entity_name: "party_tax_registrations",
      entity_id: id,
      entity_reference: old?.tax_registration_code ?? String(id),
      action: "delete",
    });

    revalidatePath(REVALIDATE_PATH);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
