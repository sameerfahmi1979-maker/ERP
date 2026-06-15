"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import { generateNextReference } from "@/server/actions/numbering";
import {
  createPartyBankDetailSchema,
  updatePartyBankDetailSchema,
  type CreatePartyBankDetailInput,
  type UpdatePartyBankDetailInput,
} from "@/features/master-data/parties/party-schemas";
import type { PartyBankDetail, ActionResult } from "@/features/master-data/parties/party-types";

const REVALIDATE_PATH = "/admin/master-data/parties";

export async function getPartyBankDetails(partyId: number): Promise<ActionResult<PartyBankDetail[]>> {
  try {
    const ctx = await getAuthContext();
    // Requires view_bank_details or manage_bank_details permission
    if (
      !hasPermission(ctx, "master_data.parties.view_bank_details") &&
      !hasPermission(ctx, "master_data.parties.manage_bank_details")
    ) {
      return { success: false, error: "You do not have permission to view bank details" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("party_bank_details")
      .select(`*, banks!bank_id(name_en), currencies!currency_id(currency_code), countries!country_id(name_en)`)
      .eq("party_id", partyId)
      .order("is_primary", { ascending: false })
      .order("created_at");

    if (error) return { success: false, error: error.message };

    const rows = (data ?? []).map((row: Record<string, unknown>) => ({
      ...(row as PartyBankDetail),
      bank_name: (row.banks as { name_en?: string } | null)?.name_en ?? undefined,
      currency_code: (row.currencies as { currency_code?: string } | null)?.currency_code ?? undefined,
      country_name: (row.countries as { name_en?: string } | null)?.name_en ?? undefined,
    }));

    return { success: true, data: rows };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function createPartyBankDetail(input: CreatePartyBankDetailInput): Promise<ActionResult<{ id: number; bank_detail_code: string }>> {
  try {
    const parsed = createPartyBankDetailSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
    }

    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.parties.manage_bank_details")) {
      return { success: false, error: "You do not have permission to manage bank details" };
    }

    const numberingResult = await generateNextReference({
      ruleCode: "MASTER_PARTY_BANK",
      targetTableName: "party_bank_details",
      generationReason: "Party bank detail creation",
    });
    if (!numberingResult.success || !numberingResult.data?.generatedReferenceNumber) {
      return { success: false, error: "Failed to generate bank detail code" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("party_bank_details")
      .insert({
        ...parsed.data,
        bank_detail_code: numberingResult.data.generatedReferenceNumber,
        created_by: ctx.profile?.id ?? null,
        updated_by: ctx.profile?.id ?? null,
      })
      .select("id, bank_detail_code")
      .single();

    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code: "MASTER_DATA",
      entity_name: "party_bank_details",
      entity_id: data.id,
      entity_reference: data.bank_detail_code,
      action: "create",
      new_values: { ...parsed.data, iban: "[REDACTED]", account_number: "[REDACTED]" },
    });

    revalidatePath(REVALIDATE_PATH);
    return { success: true, data: { id: data.id, bank_detail_code: data.bank_detail_code } };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function updatePartyBankDetail(input: UpdatePartyBankDetailInput): Promise<ActionResult> {
  try {
    const parsed = updatePartyBankDetailSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
    }

    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.parties.manage_bank_details")) {
      return { success: false, error: "You do not have permission to manage bank details" };
    }

    const { id, ...fields } = parsed.data;
    const supabase = await createClient();
    const { data: old } = await supabase.from("party_bank_details").select("bank_detail_code").eq("id", id).single();

    const { error } = await supabase
      .from("party_bank_details")
      .update({ ...fields, updated_by: ctx.profile?.id ?? null })
      .eq("id", id);

    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code: "MASTER_DATA",
      entity_name: "party_bank_details",
      entity_id: id,
      entity_reference: old?.bank_detail_code ?? String(id),
      action: "update",
      new_values: { ...fields, iban: "[REDACTED]", account_number: "[REDACTED]" },
    });

    revalidatePath(REVALIDATE_PATH);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function verifyPartyBankDetail(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.parties.verify_bank_details")) {
      return { success: false, error: "You do not have permission to verify bank details" };
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("party_bank_details")
      .update({
        is_verified: true,
        verified_by: ctx.profile?.id ?? null,
        verified_at: new Date().toISOString(),
        updated_by: ctx.profile?.id ?? null,
      })
      .eq("id", id);

    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code: "MASTER_DATA",
      entity_name: "party_bank_details",
      entity_id: id,
      entity_reference: String(id),
      action: "verify",
      new_values: { is_verified: true },
    });

    revalidatePath(REVALIDATE_PATH);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function deletePartyBankDetail(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.parties.manage_bank_details")) {
      return { success: false, error: "You do not have permission to manage bank details" };
    }

    const supabase = await createClient();
    const { data: old } = await supabase.from("party_bank_details").select("bank_detail_code").eq("id", id).single();
    const { error } = await supabase.from("party_bank_details").delete().eq("id", id);
    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code: "MASTER_DATA",
      entity_name: "party_bank_details",
      entity_id: id,
      entity_reference: old?.bank_detail_code ?? String(id),
      action: "delete",
    });

    revalidatePath(REVALIDATE_PATH);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
