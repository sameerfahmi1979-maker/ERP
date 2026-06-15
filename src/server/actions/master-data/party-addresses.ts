"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import { generateNextReference } from "@/server/actions/numbering";
import {
  createPartyAddressSchema,
  updatePartyAddressSchema,
  type CreatePartyAddressInput,
  type UpdatePartyAddressInput,
} from "@/features/master-data/parties/party-schemas";
import type { PartyAddress, ActionResult } from "@/features/master-data/parties/party-types";

const REVALIDATE_PATH = "/admin/master-data/parties";

export async function getPartyAddresses(partyId: number): Promise<ActionResult<PartyAddress[]>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("party_addresses")
      .select(`
        *,
        party_address_types!address_type_id(name_en),
        countries!country_id(name_en),
        emirates!emirate_id(name_en),
        cities!city_id(name_en)
      `)
      .eq("party_id", partyId)
      .order("is_primary", { ascending: false })
      .order("created_at");

    if (error) return { success: false, error: error.message };

    const rows = (data ?? []).map((row: Record<string, unknown>) => ({
      ...(row as PartyAddress),
      address_type_name: (row.party_address_types as { name_en?: string } | null)?.name_en ?? undefined,
      country_name: (row.countries as { name_en?: string } | null)?.name_en ?? undefined,
      emirate_name: (row.emirates as { name_en?: string } | null)?.name_en ?? undefined,
      city_name: (row.cities as { name_en?: string } | null)?.name_en ?? undefined,
    }));

    return { success: true, data: rows };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function createPartyAddress(input: CreatePartyAddressInput): Promise<ActionResult<{ id: number; address_code: string }>> {
  try {
    const parsed = createPartyAddressSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
    }

    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.parties.manage_addresses")) {
      return { success: false, error: "You do not have permission to manage addresses" };
    }

    const numberingResult = await generateNextReference({
      ruleCode: "MASTER_PARTY_ADDRESS",
      targetTableName: "party_addresses",
      generationReason: "Party address creation",
    });
    if (!numberingResult.success || !numberingResult.data?.generatedReferenceNumber) {
      return { success: false, error: "Failed to generate address code" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("party_addresses")
      .insert({
        ...parsed.data,
        address_code: numberingResult.data.generatedReferenceNumber,
        created_by: ctx.profile?.id ?? null,
        updated_by: ctx.profile?.id ?? null,
      })
      .select("id, address_code")
      .single();

    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code: "MASTER_DATA",
      entity_name: "party_addresses",
      entity_id: data.id,
      entity_reference: data.address_code,
      action: "create",
      new_values: parsed.data,
    });

    revalidatePath(REVALIDATE_PATH);
    return { success: true, data: { id: data.id, address_code: data.address_code } };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function updatePartyAddress(input: UpdatePartyAddressInput): Promise<ActionResult> {
  try {
    const parsed = updatePartyAddressSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
    }

    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.parties.manage_addresses")) {
      return { success: false, error: "You do not have permission to manage addresses" };
    }

    const { id, ...fields } = parsed.data;
    const supabase = await createClient();
    const { data: old } = await supabase.from("party_addresses").select("address_code").eq("id", id).single();

    const { error } = await supabase
      .from("party_addresses")
      .update({ ...fields, updated_by: ctx.profile?.id ?? null })
      .eq("id", id);

    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code: "MASTER_DATA",
      entity_name: "party_addresses",
      entity_id: id,
      entity_reference: old?.address_code ?? String(id),
      action: "update",
      new_values: fields,
    });

    revalidatePath(REVALIDATE_PATH);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function deletePartyAddress(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.parties.manage_addresses")) {
      return { success: false, error: "You do not have permission to manage addresses" };
    }

    const supabase = await createClient();
    const { data: old } = await supabase.from("party_addresses").select("address_code").eq("id", id).single();
    const { error } = await supabase.from("party_addresses").delete().eq("id", id);
    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code: "MASTER_DATA",
      entity_name: "party_addresses",
      entity_id: id,
      entity_reference: old?.address_code ?? String(id),
      action: "delete",
    });

    revalidatePath(REVALIDATE_PATH);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
