"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import { generateNextReference } from "@/server/actions/numbering";
import {
  createPartySchema,
  updatePartySchema,
  type CreatePartySchemaInput,
  type UpdatePartySchemaInput,
} from "@/features/master-data/parties/party-schemas";
import type {
  Party,
  PartyType,
  PartyNature,
  PartyStatus,
  PartyLicenseType,
  PartyLicenseStatus,
  PartyTaxStatus,
  PartyContactRole,
  PartyContactDepartment,
  PartyAddressType,
  PartyDocumentType,
  PartyDocumentStatus,
  PaymentMethod,
  DuplicateMatch,
  ActionResult,
} from "@/features/master-data/parties/party-types";

const REVALIDATE_PATH = "/admin/master-data/parties";

// ─── List & Fetch ────────────────────────────────────────────────────────────

export async function getParties(): Promise<ActionResult<Party[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.parties.view")) {
      return { success: false, error: "You do not have permission to view parties" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("parties")
      .select(`
        *,
        party_natures!party_nature_id(name_en),
        party_statuses!party_status_id(name_en),
        party_types!primary_party_type_id(type_name),
        countries!country_id(name_en),
        emirates!emirate_id(name_en),
        cities!city_id(name_en)
      `)
      .order("display_name");

    if (error) {
      console.error("getParties error", error);
      return { success: false, error: error.message };
    }

    const parties = (data ?? []).map((row: Record<string, unknown>) => ({
      ...(row as Party),
      party_nature_name: (row.party_natures as { name_en?: string } | null)?.name_en ?? null,
      party_status_name: (row.party_statuses as { name_en?: string } | null)?.name_en ?? null,
      primary_type_name: (row.party_types as { type_name?: string } | null)?.type_name ?? null,
      country_name: (row.countries as { name_en?: string } | null)?.name_en ?? null,
      emirate_name: (row.emirates as { name_en?: string } | null)?.name_en ?? null,
      city_name: (row.cities as { name_en?: string } | null)?.name_en ?? null,
    }));

    return { success: true, data: parties as Party[] };
  } catch (error) {
    console.error("getParties exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function getPartyById(id: number): Promise<ActionResult<Party>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.parties.view")) {
      return { success: false, error: "You do not have permission to view parties" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("parties")
      .select(`
        *,
        party_natures!party_nature_id(name_en),
        party_statuses!party_status_id(name_en),
        party_types!primary_party_type_id(type_name),
        countries!country_id(name_en),
        emirates!emirate_id(name_en),
        cities!city_id(name_en)
      `)
      .eq("id", id)
      .single();

    if (error) {
      console.error("getPartyById error", error);
      return { success: false, error: error.message };
    }

    const row = data as Record<string, unknown>;
    const party: Party = {
      ...(row as Party),
      party_nature_name: (row.party_natures as { name_en?: string } | null)?.name_en ?? null,
      party_status_name: (row.party_statuses as { name_en?: string } | null)?.name_en ?? null,
      primary_type_name: (row.party_types as { type_name?: string } | null)?.type_name ?? null,
      country_name: (row.countries as { name_en?: string } | null)?.name_en ?? null,
      emirate_name: (row.emirates as { name_en?: string } | null)?.name_en ?? null,
      city_name: (row.cities as { name_en?: string } | null)?.name_en ?? null,
    };

    return { success: true, data: party };
  } catch (error) {
    console.error("getPartyById exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// ─── Lookup Queries ──────────────────────────────────────────────────────────

export async function getPartyTypes(): Promise<ActionResult<PartyType[]>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("party_types")
      .select("*")
      .eq("is_active", true)
      .order("sort_order");
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as PartyType[] };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function getPartyNatures(): Promise<ActionResult<PartyNature[]>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("party_natures")
      .select("*")
      .eq("is_active", true)
      .order("sort_order");
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as PartyNature[] };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function getPartyStatuses(): Promise<ActionResult<PartyStatus[]>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("party_statuses")
      .select("*")
      .order("sort_order");
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as PartyStatus[] };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function getPartyLicenseTypes(): Promise<ActionResult<PartyLicenseType[]>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("party_license_types")
      .select("*")
      .eq("is_active", true)
      .order("sort_order");
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as PartyLicenseType[] };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function getPartyLicenseStatuses(): Promise<ActionResult<PartyLicenseStatus[]>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("party_license_statuses")
      .select("*")
      .order("sort_order");
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as PartyLicenseStatus[] };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function getPartyTaxStatuses(): Promise<ActionResult<PartyTaxStatus[]>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("party_tax_statuses")
      .select("*")
      .order("sort_order");
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as PartyTaxStatus[] };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function getPartyContactRoles(): Promise<ActionResult<PartyContactRole[]>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("party_contact_roles")
      .select("*")
      .order("sort_order");
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as PartyContactRole[] };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function getPartyContactDepartments(): Promise<ActionResult<PartyContactDepartment[]>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("party_contact_departments")
      .select("*")
      .order("sort_order");
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as PartyContactDepartment[] };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function getPartyAddressTypes(): Promise<ActionResult<PartyAddressType[]>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("party_address_types")
      .select("*")
      .order("sort_order");
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as PartyAddressType[] };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function getPartyDocumentTypes(): Promise<ActionResult<PartyDocumentType[]>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("party_document_types")
      .select("*")
      .eq("is_active", true)
      .order("sort_order");
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as PartyDocumentType[] };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function getPartyDocumentStatuses(): Promise<ActionResult<PartyDocumentStatus[]>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("party_document_statuses")
      .select("*")
      .order("sort_order");
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as PartyDocumentStatus[] };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function getPaymentMethods(): Promise<ActionResult<PaymentMethod[]>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("payment_methods")
      .select("*")
      .eq("is_active", true)
      .order("sort_order");
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as PaymentMethod[] };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ─── Duplicate Detection ──────────────────────────────────────────────────────

export async function detectPartyDuplicates(params: {
  legal_name_en?: string | null;
  trade_name_en?: string | null;
  main_email?: string | null;
  main_mobile?: string | null;
  main_phone?: string | null;
  website?: string | null;
  exclude_party_id?: number | null;
}): Promise<ActionResult<DuplicateMatch[]>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("detect_possible_party_duplicates", {
      p_legal_name_en: params.legal_name_en ?? null,
      p_trade_name_en: params.trade_name_en ?? null,
      p_main_email: params.main_email ?? null,
      p_main_mobile: params.main_mobile ?? null,
      p_main_phone: params.main_phone ?? null,
      p_trn: null,
      p_license_number: null,
      p_iban: null,
      p_website: params.website ?? null,
      p_exclude_party_id: params.exclude_party_id ?? null,
    });

    if (error) {
      console.error("detectPartyDuplicates error", error);
      return { success: false, error: error.message };
    }

    return { success: true, data: (data ?? []) as DuplicateMatch[] };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ─── Create Party ─────────────────────────────────────────────────────────────

export async function createParty(
  input: CreatePartySchemaInput
): Promise<ActionResult<{ id: number; party_code: string }>> {
  try {
    const parsed = createPartySchema.safeParse(input);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      return { success: false, error: errors };
    }
    const validated = parsed.data;

    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.parties.create")) {
      return { success: false, error: "You do not have permission to create parties" };
    }

    // Generate party code
    const numberingResult = await generateNextReference({
      ruleCode: "MASTER_PARTY",
      documentTypeCode: "PARTY",
      targetTableName: "parties",
      generationReason: "Party creation",
    });
    if (!numberingResult.success || !numberingResult.data?.generatedReferenceNumber) {
      return { success: false, error: "Failed to generate party code" };
    }
    const party_code = numberingResult.data.generatedReferenceNumber;

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("parties")
      .insert({
        ...validated,
        party_code,
        created_by: ctx.profile?.id ?? null,
        updated_by: ctx.profile?.id ?? null,
      })
      .select("id, party_code")
      .single();

    if (error) {
      console.error("createParty error", error);
      return { success: false, error: error.message };
    }

    await logAudit({
      module_code: "MASTER_DATA",
      entity_name: "parties",
      entity_id: data.id,
      entity_reference: data.party_code,
      action: "create",
      new_values: { ...validated, party_code },
    });

    revalidatePath(REVALIDATE_PATH);
    return { success: true, data: { id: data.id, party_code: data.party_code } };
  } catch (error) {
    console.error("createParty exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// ─── Update Party ─────────────────────────────────────────────────────────────

export async function updateParty(
  input: UpdatePartySchemaInput
): Promise<ActionResult<{ id: number }>> {
  try {
    const parsed = updatePartySchema.safeParse(input);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      return { success: false, error: errors };
    }
    const { id, ...fields } = parsed.data;

    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.parties.edit")) {
      return { success: false, error: "You do not have permission to edit parties" };
    }

    const supabase = await createClient();

    // Fetch old for audit
    const { data: old } = await supabase.from("parties").select("*").eq("id", id).single();

    const { error } = await supabase
      .from("parties")
      .update({ ...fields, updated_by: ctx.profile?.id ?? null })
      .eq("id", id);

    if (error) {
      console.error("updateParty error", error);
      return { success: false, error: error.message };
    }

    await logAudit({
      module_code: "MASTER_DATA",
      entity_name: "parties",
      entity_id: id,
      entity_reference: old?.party_code ?? String(id),
      action: "update",
      old_values: old ?? null,
      new_values: fields,
    });

    revalidatePath(REVALIDATE_PATH);
    return { success: true, data: { id } };
  } catch (error) {
    console.error("updateParty exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// ─── Deactivate / Reactivate ──────────────────────────────────────────────────

export async function deactivateParty(
  id: number,
  reason?: string
): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.parties.deactivate")) {
      return { success: false, error: "You do not have permission to deactivate parties" };
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("parties")
      .update({
        is_active: false,
        deactivated_at: new Date().toISOString(),
        deactivated_by: ctx.profile?.id ?? null,
        deactivation_reason: reason ?? null,
        updated_by: ctx.profile?.id ?? null,
      })
      .eq("id", id);

    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code: "MASTER_DATA",
      entity_name: "parties",
      entity_id: id,
      entity_reference: String(id),
      action: "deactivate",
      new_values: { is_active: false, deactivation_reason: reason },
    });

    revalidatePath(REVALIDATE_PATH);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function reactivateParty(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.parties.deactivate")) {
      return { success: false, error: "You do not have permission to reactivate parties" };
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("parties")
      .update({
        is_active: true,
        deactivated_at: null,
        deactivated_by: null,
        deactivation_reason: null,
        updated_by: ctx.profile?.id ?? null,
      })
      .eq("id", id);

    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code: "MASTER_DATA",
      entity_name: "parties",
      entity_id: id,
      entity_reference: String(id),
      action: "reactivate",
      new_values: { is_active: true },
    });

    revalidatePath(REVALIDATE_PATH);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ─── Type Assignments ─────────────────────────────────────────────────────────

export async function getPartyTypeAssignments(partyId: number): Promise<ActionResult<import("@/features/master-data/parties/party-types").PartyTypeAssignment[]>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("party_type_assignments")
      .select(`*, party_types!party_type_id(type_code, type_name)`)
      .eq("party_id", partyId)
      .eq("is_active", true)
      .order("is_primary", { ascending: false });

    if (error) return { success: false, error: error.message };

    const rows = (data ?? []).map((row: Record<string, unknown>) => ({
      ...(row as import("@/features/master-data/parties/party-types").PartyTypeAssignment),
      type_code: (row.party_types as { type_code?: string } | null)?.type_code ?? undefined,
      type_name: (row.party_types as { type_name?: string } | null)?.type_name ?? undefined,
    }));

    return { success: true, data: rows };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ─── Party Select (filtered) ──────────────────────────────────────────────────

export type PartySelectOption = {
  id: number;
  party_code: string;
  display_name: string;
  legal_name_en: string;
  primary_type_name: string | null;
  is_active: boolean;
};

export async function getPartySelectOptions(params: {
  typeCode?: string | null;
  typeCodes?: string[] | null;
  excludePartyId?: number | null;
  includeInactive?: boolean;
  search?: string | null;
}): Promise<ActionResult<PartySelectOption[]>> {
  try {
    const supabase = await createClient();
    let query = supabase
      .from("parties")
      .select(`id, party_code, display_name, legal_name_en, party_types!primary_party_type_id(type_name)`)
      .order("display_name")
      .limit(200);

    if (!params.includeInactive) query = query.eq("is_active", true);
    if (params.excludePartyId) query = query.neq("id", params.excludePartyId);
    if (params.search) {
      query = query.or(`display_name.ilike.%${params.search}%,party_code.ilike.%${params.search}%,legal_name_en.ilike.%${params.search}%`);
    }

    // Type filter: if typeCodes provided, filter by parties that have those type assignments
    if (params.typeCodes && params.typeCodes.length > 0) {
      const { data: typeIds } = await supabase
        .from("party_types")
        .select("id")
        .in("type_code", params.typeCodes)
        .eq("is_active", true);
      if (typeIds && typeIds.length > 0) {
        const ids = typeIds.map((t: { id: number }) => t.id);
        const { data: assignedPartyIds } = await supabase
          .from("party_type_assignments")
          .select("party_id")
          .in("party_type_id", ids)
          .eq("is_active", true);
        const partyIds = [...new Set((assignedPartyIds ?? []).map((a: { party_id: number }) => a.party_id))];
        if (partyIds.length === 0) return { success: true, data: [] };
        query = query.in("id", partyIds);
      }
    } else if (params.typeCode) {
      const { data: typeRow } = await supabase.from("party_types").select("id").eq("type_code", params.typeCode).eq("is_active", true).single();
      if (typeRow) {
        const { data: assignedPartyIds } = await supabase
          .from("party_type_assignments")
          .select("party_id")
          .eq("party_type_id", typeRow.id)
          .eq("is_active", true);
        const partyIds = [...new Set((assignedPartyIds ?? []).map((a: { party_id: number }) => a.party_id))];
        if (partyIds.length === 0) return { success: true, data: [] };
        query = query.in("id", partyIds);
      }
    }

    const { data, error } = await query;
    if (error) return { success: false, error: error.message };

    const rows = (data ?? []).map((row: Record<string, unknown>) => ({
      id: row.id as number,
      party_code: row.party_code as string,
      display_name: row.display_name as string,
      legal_name_en: row.legal_name_en as string,
      primary_type_name: (row.party_types as { type_name?: string } | null)?.type_name ?? null,
      is_active: true,
    }));

    return { success: true, data: rows };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ─── Audit Logs ───────────────────────────────────────────────────────────────

export type PartyAuditLogRow = {
  id: number;
  actor_user_profile_id: number | null;
  entity_name: string;
  entity_id: number | null;
  entity_reference: string | null;
  action: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
  module_code: string | null;
};

export async function getPartyAuditLogs(partyId: number): Promise<ActionResult<PartyAuditLogRow[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.parties.view_audit") && !hasPermission(ctx, "master_data.parties.view")) {
      return { success: false, error: "You do not have permission to view audit logs" };
    }

    const supabase = await createClient();
    const entityNames = [
      "parties", "party_type_assignments", "party_licenses", "party_tax_registrations",
      "party_finance_profiles", "party_contacts", "party_addresses", "party_bank_details",
      "party_documents", "party_service_category_assignments", "party_notes",
    ];

    const { data, error } = await supabase
      .from("audit_logs")
      .select("id, actor_user_profile_id, entity_name, entity_id, entity_reference, action, old_values, new_values, created_at, module_code")
      .eq("entity_name", "parties")
      .eq("entity_id", partyId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as PartyAuditLogRow[] };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ─── IBAN Duplicate Check ─────────────────────────────────────────────────────

export async function checkDuplicateIban(iban: string, excludeBankDetailId?: number | null): Promise<ActionResult<{ isDuplicate: boolean; existingParties: { party_code: string; display_name: string }[] }>> {
  try {
    const supabase = await createClient();
    let query = supabase
      .from("party_bank_details")
      .select("id, party_id, parties!party_id(party_code, display_name)")
      .eq("iban", iban.trim())
      .eq("is_active", true);

    if (excludeBankDetailId) query = query.neq("id", excludeBankDetailId);

    const { data, error } = await query;
    if (error) return { success: false, error: error.message };

    const rows = (data ?? []).map((row: Record<string, unknown>) => ({
      party_code: (row.parties as { party_code?: string } | null)?.party_code ?? "Unknown",
      display_name: (row.parties as { display_name?: string } | null)?.display_name ?? "Unknown",
    }));

    return { success: true, data: { isDuplicate: rows.length > 0, existingParties: rows } };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ─── Filtered Parties (for filtered routes) ───────────────────────────────────

export async function getPartiesByTypeCode(typeCode: string): Promise<ActionResult<Party[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.parties.view")) {
      return { success: false, error: "You do not have permission to view parties" };
    }

    const supabase = await createClient();
    const { data: typeRow } = await supabase.from("party_types").select("id").eq("type_code", typeCode).single();
    if (!typeRow) return { success: true, data: [] };

    const { data: assignments } = await supabase
      .from("party_type_assignments")
      .select("party_id")
      .eq("party_type_id", typeRow.id)
      .eq("is_active", true);

    const partyIds = (assignments ?? []).map((a: { party_id: number }) => a.party_id);
    if (partyIds.length === 0) return { success: true, data: [] };

    const { data, error } = await supabase
      .from("parties")
      .select(`*, party_natures!party_nature_id(name_en), party_statuses!party_status_id(name_en), party_types!primary_party_type_id(type_name), countries!country_id(name_en), emirates!emirate_id(name_en), cities!city_id(name_en)`)
      .in("id", partyIds)
      .order("display_name");

    if (error) return { success: false, error: error.message };

    const parties = (data ?? []).map((row: Record<string, unknown>) => ({
      ...(row as Party),
      party_nature_name: (row.party_natures as { name_en?: string } | null)?.name_en ?? null,
      party_status_name: (row.party_statuses as { name_en?: string } | null)?.name_en ?? null,
      primary_type_name: (row.party_types as { type_name?: string } | null)?.type_name ?? null,
      country_name: (row.countries as { name_en?: string } | null)?.name_en ?? null,
      emirate_name: (row.emirates as { name_en?: string } | null)?.name_en ?? null,
      city_name: (row.cities as { name_en?: string } | null)?.name_en ?? null,
    }));

    return { success: true, data: parties as Party[] };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function savePartyTypeAssignments(
  partyId: number,
  selectedTypeIds: number[],
  primaryTypeId: number | null
): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.parties.manage_types")) {
      return { success: false, error: "You do not have permission to manage party types" };
    }

    const supabase = await createClient();

    // Soft-delete existing assignments for this party
    await supabase
      .from("party_type_assignments")
      .update({ is_active: false, updated_by: ctx.profile?.id ?? null })
      .eq("party_id", partyId);

    if (selectedTypeIds.length === 0) {
      revalidatePath(REVALIDATE_PATH);
      return { success: true };
    }

    // Insert new assignments
    const rows = selectedTypeIds.map((typeId) => ({
      party_id: partyId,
      party_type_id: typeId,
      is_primary: typeId === primaryTypeId,
      is_active: true,
      assigned_date: new Date().toISOString().split("T")[0],
      assigned_by: ctx.profile?.id ?? null,
      created_by: ctx.profile?.id ?? null,
      updated_by: ctx.profile?.id ?? null,
    }));

    const { error } = await supabase.from("party_type_assignments").insert(rows);
    if (error) return { success: false, error: error.message };

    // Update primary type on parties table
    if (primaryTypeId) {
      await supabase
        .from("parties")
        .update({ primary_party_type_id: primaryTypeId, updated_by: ctx.profile?.id ?? null })
        .eq("id", partyId);
    }

    revalidatePath(REVALIDATE_PATH);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
