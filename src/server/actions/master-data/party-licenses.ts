"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import { generateNextReference } from "@/server/actions/numbering";
import {
  createPartyLicenseSchema,
  updatePartyLicenseSchema,
  type CreatePartyLicenseInput,
  type UpdatePartyLicenseInput,
} from "@/features/master-data/parties/party-schemas";
import type { PartyLicense, ActionResult } from "@/features/master-data/parties/party-types";

const REVALIDATE_PATH = "/admin/master-data/parties";

export async function getPartyLicenses(partyId: number): Promise<ActionResult<PartyLicense[]>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("party_licenses")
      .select(`*, party_license_types!license_type_id(name_en), party_license_statuses!license_status_id(name_en)`)
      .eq("party_id", partyId)
      .order("is_primary", { ascending: false })
      .order("created_at");

    if (error) return { success: false, error: error.message };

    const rows = (data ?? []).map((row: Record<string, unknown>) => ({
      ...(row as PartyLicense),
      license_type_name: (row.party_license_types as { name_en?: string } | null)?.name_en ?? undefined,
      license_status_name: (row.party_license_statuses as { name_en?: string } | null)?.name_en ?? undefined,
    }));

    return { success: true, data: rows };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function createPartyLicense(input: CreatePartyLicenseInput): Promise<ActionResult<{ id: number; license_code: string }>> {
  try {
    const parsed = createPartyLicenseSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
    }

    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.parties.manage_licenses")) {
      return { success: false, error: "You do not have permission to manage licenses" };
    }

    const numberingResult = await generateNextReference({
      ruleCode: "MASTER_PARTY_LICENSE",
      targetTableName: "party_licenses",
      generationReason: "Party license creation",
    });
    if (!numberingResult.success || !numberingResult.data?.generatedReferenceNumber) {
      return { success: false, error: "Failed to generate license code" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("party_licenses")
      .insert({
        ...parsed.data,
        license_code: numberingResult.data.generatedReferenceNumber,
        created_by: ctx.profile?.id ?? null,
        updated_by: ctx.profile?.id ?? null,
      })
      .select("id, license_code")
      .single();

    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code: "MASTER_DATA",
      entity_name: "party_licenses",
      entity_id: data.id,
      entity_reference: data.license_code,
      action: "create",
      new_values: parsed.data,
    });

    revalidatePath(REVALIDATE_PATH);
    return { success: true, data: { id: data.id, license_code: data.license_code } };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function updatePartyLicense(input: UpdatePartyLicenseInput): Promise<ActionResult> {
  try {
    const parsed = updatePartyLicenseSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
    }

    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.parties.manage_licenses")) {
      return { success: false, error: "You do not have permission to manage licenses" };
    }

    const { id, ...fields } = parsed.data;
    const supabase = await createClient();
    const { data: old } = await supabase.from("party_licenses").select("license_code").eq("id", id).single();

    const { error } = await supabase
      .from("party_licenses")
      .update({ ...fields, updated_by: ctx.profile?.id ?? null })
      .eq("id", id);

    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code: "MASTER_DATA",
      entity_name: "party_licenses",
      entity_id: id,
      entity_reference: old?.license_code ?? String(id),
      action: "update",
      new_values: fields,
    });

    revalidatePath(REVALIDATE_PATH);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function deletePartyLicense(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.parties.manage_licenses")) {
      return { success: false, error: "You do not have permission to manage licenses" };
    }

    const supabase = await createClient();
    const { data: old } = await supabase.from("party_licenses").select("license_code").eq("id", id).single();
    const { error } = await supabase.from("party_licenses").delete().eq("id", id);
    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code: "MASTER_DATA",
      entity_name: "party_licenses",
      entity_id: id,
      entity_reference: old?.license_code ?? String(id),
      action: "delete",
    });

    revalidatePath(REVALIDATE_PATH);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
