"use server";

import {
  createPartySchema,
  updatePartySchema,
  type CreatePartySchemaInput,
  type UpdatePartySchemaInput,
} from "@/features/master-data/parties/party-schemas";
import type {
  ActionResult,
  DuplicateMatch,
  Party,
  PartyAddressType,
  PartyContactDepartment,
  PartyContactRole,
  PartyDocumentStatus,
  PartyDocumentType,
  PartyLicenseStatus,
  PartyLicenseType,
  PartyNature,
  PartyStatus,
  PartyTaxStatus,
  PartyType,
  PaymentMethod,
} from "@/features/master-data/parties/party-types";
import { logger } from "@/lib/logger";
import { getAuthContext, hasPermission, hasGlobalPermission } from "@/lib/rbac/check";
import { createClient } from "@/lib/supabase/server";
import { createNumberedParty } from "@/server/numbered-party-create";
import { savePartyRecord, changePartyState } from "@/server/party-save";
import { partyTypeState, type PartyTypeState, type PartySaveReceipt } from "@/lib/master-data/party-save-contract";
import { attachPartyReferenceLabels } from "@/server/party-reference-labels";
import type { WorkspaceSaveContract } from "@/lib/workspace/save-contract";

// ─── List & Fetch ────────────────────────────────────────────────────────────

export async function getParties(): Promise<ActionResult<Party[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasGlobalPermission(ctx, "master_data.parties.view") && !hasGlobalPermission(ctx, "master_data.party_master.view")) {
      return { success: false, kind: 'forbidden', error: "You do not have permission to view parties" };
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
        cities!city_id(name_en),
        areas_zones!area_zone_id(name_en),
        parent_party:erp_party_parent(display_name)
      `)
      .order("display_name");

    if (error || !Array.isArray(data)) {
      logger.warn("Party list read failed.", {code:error?.code});
      return { success: false, kind: 'failed', error: "Parties could not be loaded. Try again." };
    }

    const parties = (data ?? []).map((row: Record<string, unknown>) => ({
      ...(row as Party),
      party_nature_name: (row.party_natures as { name_en?: string } | null)?.name_en ?? null,
      party_status_name: (row.party_statuses as { name_en?: string } | null)?.name_en ?? null,
      primary_type_name: (row.party_types as { type_name?: string } | null)?.type_name ?? null,
      country_name: (row.countries as { name_en?: string } | null)?.name_en ?? null,
      emirate_name: (row.emirates as { name_en?: string } | null)?.name_en ?? null,
      city_name: (row.cities as { name_en?: string } | null)?.name_en ?? null,
      area_zone_name: (row.areas_zones as { name_en?: string } | null)?.name_en ?? null,
      parent_party_name: (row.parent_party as { display_name?: string } | null)?.display_name ?? null,
    }));

    return { success: true, data: await attachPartyReferenceLabels('parties', parties as Party[]) };
  } catch {
    logger.warn("Party list read could not complete.");
    return { success: false, kind: 'failed', error: "Parties could not be loaded. Try again." };
  }
}

export async function getPartyById(id: number): Promise<ActionResult<Party>> {
  try {
    const ctx = await getAuthContext();
    if (!hasGlobalPermission(ctx, "master_data.parties.view") && !hasGlobalPermission(ctx, "master_data.party_master.view")) {
      return { success: false, kind: 'forbidden', error: "You do not have permission to view parties" };
    }

    if (!Number.isSafeInteger(id) || id < 1) return {success:false,kind:'not_found',error:'Party not found.'};

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
        cities!city_id(name_en),
        areas_zones!area_zone_id(name_en),
        parent_party:erp_party_parent(display_name)
      `)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      logger.warn("Party detail read failed.", {code:error.code});
      return { success: false, kind: 'failed', error: "This party could not be loaded. Try again." };
    }
    if (!data) return {success:false,kind:'not_found',error:'Party not found.'};

    const row = data as Record<string, unknown>;
    const party: Party = {
      ...(row as Party),
      party_nature_name: (row.party_natures as { name_en?: string } | null)?.name_en ?? null,
      party_status_name: (row.party_statuses as { name_en?: string } | null)?.name_en ?? null,
      primary_type_name: (row.party_types as { type_name?: string } | null)?.type_name ?? null,
      country_name: (row.countries as { name_en?: string } | null)?.name_en ?? null,
      emirate_name: (row.emirates as { name_en?: string } | null)?.name_en ?? null,
      city_name: (row.cities as { name_en?: string } | null)?.name_en ?? null,
      area_zone_name: (row.areas_zones as { name_en?: string } | null)?.name_en ?? null,
      parent_party_name: (row.parent_party as { display_name?: string } | null)?.display_name ?? null,
    };

    return { success: true, data: (await attachPartyReferenceLabels('parties', [party]))[0] };
  } catch {
    logger.warn("Party detail read could not complete.");
    return { success: false, kind: 'failed', error: "This party could not be loaded. Try again." };
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
      logger.error("detectPartyDuplicates error", error);
      return { success: false, error: error.message };
    }

    return { success: true, data: (data ?? []) as DuplicateMatch[] };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ─── Create Party ─────────────────────────────────────────────────────────────

export async function createParty(   input: CreatePartySchemaInput, contract: WorkspaceSaveContract): Promise<ActionResult<{ id: number; party_code: string; revision: string; replayed: boolean }>> {
  try {
    const parsed = createPartySchema.strict().safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues.map(i => i.message).join("; ") };
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.parties.create")) return { success: false, error: "Permission denied" };
    if ((parsed.data.initial_type_code || parsed.data.primary_party_type_id != null) && !hasGlobalPermission(ctx, "master_data.parties.manage_types")) {
      return { success: false, error: "Assigning an initial party type requires party-type management permission." };
    }
    return await createNumberedParty("parties", parsed.data, contract);
  } catch {
    return { success: false, error: "Creation could not start. Check your session and try again." };
  }
}

// ─── Update Party ─────────────────────────────────────────────────────────────

export async function updateParty(
  input: UpdatePartySchemaInput,
  contract?: WorkspaceSaveContract
): Promise<ActionResult<PartySaveReceipt>> {
  try {
    const parsed = updatePartySchema.strict().safeParse(input);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      return { success: false, error: errors };
    }
    const { id, ...fields } = parsed.data;

    return await savePartyRecord(id, fields, contract);
  } catch {
    return { success: false, error: "The save could not start. Check the fields and your session." };
  }
}

// ─── Deactivate / Reactivate ──────────────────────────────────────────────────

export async function deactivateParty(
  id: number,
  reason?: string,
  contract?: WorkspaceSaveContract
): Promise<ActionResult<PartySaveReceipt>> {
  return changePartyState(id,'active',{is_active:false,reason:reason??null},contract);
}

export async function reactivateParty(id: number, contract?: WorkspaceSaveContract): Promise<ActionResult<PartySaveReceipt>> {
  return changePartyState(id,'active',{is_active:true,reason:null},contract);
}

// ─── Type Assignments ─────────────────────────────────────────────────────────

export async function getPartyTypeState(partyId:number):Promise<ActionResult<PartyTypeState>>{
  if(!Number.isSafeInteger(partyId)||partyId<1)return {success:false,error:'Invalid party.'};
  try{
    const ctx=await getAuthContext();
    if(!hasGlobalPermission(ctx,'master_data.parties.view'))return {success:false,error:'You do not have permission to view these party assignments.'};
    const client=await createClient();const {data,error}=await client.rpc('get_party_type_state',{p_id:partyId});
    if(error)return {success:false,error:'Party types could not be loaded. Retry before editing.'};
    if(data===null)return {success:false,error:'Party not found or unavailable.'};
    const parsed=partyTypeState.safeParse(data);
    if(!parsed.success||parsed.data.id!==partyId)return {success:false,error:'Party type information is incomplete. Reopen this record.'};
    return {success:true,data:parsed.data};
  }catch{return {success:false,error:'Party types could not be loaded. Check your session and retry.'};}
}

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
    if (!hasGlobalPermission(ctx, "master_data.parties.view") && !hasGlobalPermission(ctx, "master_data.party_master.view")) {
      return { success: false, kind: 'forbidden', error: "You do not have permission to view parties" };
    }

    const supabase = await createClient();
    const { data: typeRow, error: typeError } = await supabase.from("party_types").select("id").eq("type_code", typeCode).maybeSingle();
    if (typeError) return {success:false,kind:'failed',error:'The party type could not be loaded. Try again.'};
    if (!typeRow) return {success:false,kind:'not_found',error:'This party type is not configured or available.'};

    const { data: assignments, error: assignmentError } = await supabase
      .from("party_type_assignments")
      .select("party_id")
      .eq("party_type_id", typeRow.id)
      .eq("is_active", true);

    if (assignmentError || !Array.isArray(assignments)) return {success:false,kind:'failed',error:'Party assignments could not be loaded. Try again.'};

    const partyIds = (assignments ?? []).map((a: { party_id: number }) => a.party_id);
    if (partyIds.length === 0) return { success: true, data: [] };

    const { data, error } = await supabase
      .from("parties")
      .select(`*, party_natures!party_nature_id(name_en), party_statuses!party_status_id(name_en), party_types!primary_party_type_id(type_name), countries!country_id(name_en), emirates!emirate_id(name_en), cities!city_id(name_en), areas_zones!area_zone_id(name_en), parent_party:erp_party_parent(display_name)`)
      .in("id", partyIds)
      .order("display_name");

    if (error || !Array.isArray(data)) return {success:false,kind:'failed',error:'Parties could not be loaded. Try again.'};

    const parties = (data ?? []).map((row: Record<string, unknown>) => ({
      ...(row as Party),
      party_nature_name: (row.party_natures as { name_en?: string } | null)?.name_en ?? null,
      party_status_name: (row.party_statuses as { name_en?: string } | null)?.name_en ?? null,
      primary_type_name: (row.party_types as { type_name?: string } | null)?.type_name ?? null,
      country_name: (row.countries as { name_en?: string } | null)?.name_en ?? null,
      emirate_name: (row.emirates as { name_en?: string } | null)?.name_en ?? null,
      city_name: (row.cities as { name_en?: string } | null)?.name_en ?? null,
      area_zone_name: (row.areas_zones as { name_en?: string } | null)?.name_en ?? null,
      parent_party_name: (row.parent_party as { display_name?: string } | null)?.display_name ?? null,
    }));

    return { success: true, data: await attachPartyReferenceLabels('parties', parties as Party[]) };
  } catch {
    return { success: false, kind:'failed', error: 'Parties could not be loaded. Try again.' };
  }
}

export async function savePartyTypeAssignments(
  partyId: number,
  selectedTypeIds: number[],
  primaryTypeId: number | null,
  contract?: WorkspaceSaveContract
): Promise<ActionResult<PartySaveReceipt>> {
  return changePartyState(partyId,'types',{selected:selectedTypeIds,primary:primaryTypeId},contract);
}
