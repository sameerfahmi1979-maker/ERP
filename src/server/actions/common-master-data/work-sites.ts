"use server";

import { readCataloguePage } from "@/lib/master-data/catalogue-page";
import { literalContains } from "@/lib/reads/search";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { hasRole } from "@/lib/rbac/scope";
import { revalidatePath } from "next/cache";
import { operationsRealDate } from "@/lib/reads/hr-operations-schema";
import type { WorkspaceSaveContract } from "@/lib/workspace/save-contract";
import type { WorkspaceSaveResult } from "@/server/workspace-save";
import type { Json } from "@/types/database";
import { z } from "zod";

export type ActionResult<T = unknown> = { success: boolean; data?: T; error?: string };

export type WorkSiteRow = {
  id: number;
  workspace_revision?: number;
  site_code: string;
  site_name: string;
  site_type: string;
  owner_company_id: number;
  available_to_all_organizations?: boolean;
  branch_id: number | null;
  party_id: number | null;
  country_id: number | null;
  emirate_id: number | null;
  city_id: number | null;
  area_zone_id: number | null;
  address_line_1: string | null;
  address_line_2: string | null;
  po_box: string | null;
  makani_number: string | null;
  latitude: number | null;
  longitude: number | null;
  site_contact_name: string | null;
  site_contact_phone: string | null;
  site_contact_email: string | null;
  is_restricted_area: boolean;
  cicpa_required: boolean;
  adnoc_required: boolean;
  work_calendar_id: number | null;
  access_notes: string | null;
  status: string;
  opening_date: string | null;
  closing_date: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  owner_company?: { id: number; legal_name_en: string } | null;
  branch?: { id: number; branch_name_en: string } | null;
};

const SITE_TYPES = ['office','yard','workshop','camp','warehouse','project_site','client_site','weighbridge','fuel_point','storage_area','other'] as const;
const SITE_STATUSES = ['active','inactive','closed','decommissioned'] as const;

const createSchema = z.object({
  site_code: z.string().min(1).max(20),
  site_name: z.string().min(1).max(200),
  site_type: z.enum(SITE_TYPES),
  owner_company_id: z.number().int().positive(),
  available_to_all_organizations: z.boolean().optional(),
  branch_id: z.number().int().positive().optional().nullable(),
  party_id: z.number().int().positive().optional().nullable(),
  country_id: z.number().int().positive().optional().nullable(),
  emirate_id: z.number().int().positive().optional().nullable(),
  city_id: z.number().int().positive().optional().nullable(),
  area_zone_id: z.number().int().positive().optional().nullable(),
  address_line_1: z.string().max(500).optional().nullable(),
  address_line_2: z.string().max(500).optional().nullable(),
  po_box: z.string().max(50).optional().nullable(),
  makani_number: z.string().max(50).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  site_contact_name: z.string().max(200).optional().nullable(),
  site_contact_phone: z.string().max(50).optional().nullable(),
  site_contact_email: z.string().email().optional().nullable(),
  is_restricted_area: z.boolean().default(false),
  cicpa_required: z.boolean().default(false),
  adnoc_required: z.boolean().default(false),
  work_calendar_id: z.number().int().positive().optional().nullable(),
  access_notes: z.string().max(2000).optional().nullable(),
  status: z.enum(SITE_STATUSES).default('active'),
  opening_date: z.string().refine(operationsRealDate).optional().nullable(),
  closing_date: z.string().refine(operationsRealDate).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
});

const updateSchema = createSchema.partial().extend({
  id: z.number().int().positive(),
  is_restricted_area: z.boolean().optional(),
  cicpa_required: z.boolean().optional(),
  adnoc_required: z.boolean().optional(),
  status: z.enum(SITE_STATUSES).optional(),
});
const saveReceiptSchema = z.object({
  id: z.number().int().positive(), revision: z.string().regex(/^[1-9]\d*$/), replayed: z.boolean(),
  changed: z.boolean().optional(),
  owner_company_id: z.number().int().positive(), branch_id: z.number().int().positive().nullable(), available_to_all_organizations: z.boolean(),
});
const contractSchema = z.object({ operationId: z.uuid(), revision: z.string().regex(/^[1-9]\d*$/).max(19).nullable() });

type CreateInput = z.infer<typeof createSchema>;
type UpdateInput = z.infer<typeof updateSchema>;

function canView(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return hasPermission(ctx, "common_md.view") || hasPermission(ctx, "common_md.work_sites.view");
}
function canManage(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return hasPermission(ctx, "common_md.manage") || hasPermission(ctx, "common_md.work_sites.manage");
}

export async function listWorkSites(filters?: { owner_company_id?: number; branch_id?: number; site_type?: string; status?: string; search?: string; page?: number }): Promise<ActionResult<WorkSiteRow[]> & { totalCount?: number }> {
  try {
    const ctx = await getAuthContext();
    if (!canView(ctx)) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    const query = (head = false) => {
      let q = supabase
      .from("work_sites")
      .select("*", { count: "exact", head })
      .is("deleted_at", null)
      .order("site_name");
    if (filters?.owner_company_id) q = q.eq("owner_company_id", filters.owner_company_id);
    if (filters?.branch_id) q = q.eq("branch_id", filters.branch_id);
    if (filters?.site_type) q = q.eq("site_type", filters.site_type);
    if (filters?.status) q = q.eq("status", filters.status);
    if (filters?.search) q = q.or(`site_name.ilike.${literalContains(filters.search)},site_code.ilike.${literalContains(filters.search)}`);
    return q.order("id");
    };
    if ((filters?.search?.length ?? 0) > 200) throw new Error("Catalogue search is too long.");
    const { data, totalCount } = await readCataloguePage(query(), filters?.page ?? 1, () => query(true));
    const companies = [...new Set(data.map(row => row.owner_company_id))];
    const labels = companies.length ? await supabase.from("owner_companies").select("id,legal_name_en").in("id", companies) : { data: [], error: null };
    if (labels.error) throw new Error("Work site company labels could not be loaded.");
    const labelsById = new Map((labels.data ?? []).map(row => [row.id, row]));
    return { success: true, data: data.map(row => ({ ...row, owner_company: labelsById.get(row.owner_company_id) ?? null })) as WorkSiteRow[], totalCount };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getWorkSiteById(id: number): Promise<ActionResult<WorkSiteRow>> {
  try {
    const ctx = await getAuthContext();
    if (!canView(ctx)) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("work_sites")
      .select("*, owner_company:owner_companies(id,legal_name_en), branch:branches(id,branch_name_en)")
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: "Work site not found" };
    return { success: true, data: data as WorkSiteRow };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function saveWorkSite(id: number | null, input: Partial<CreateInput>, contract: WorkspaceSaveContract | undefined, archive = false): Promise<WorkspaceSaveResult> {
  const parsedContract = contractSchema.safeParse(contract);
  if (!parsedContract.success || (id === null) !== (parsedContract.data.revision === null)) {
    return { success: false, error: "Reopen the work site to obtain its current revision." };
  }
  if (input.opening_date && input.closing_date && input.opening_date > input.closing_date) {
    return { success: false, error: "Closing date must be on or after opening date." };
  }
  try {
    const ctx = await getAuthContext();
    if (!canManage(ctx)) return { success: false, error: "Permission denied" };
    if (input.available_to_all_organizations !== undefined && !hasRole(ctx, "system_admin")) {
      return { success: false, error: "Only a System Administrator can change organization availability." };
    }
    const db = await createClient();
    const { data, error } = await db.rpc("phase3_save_work_site", {
      p_id: id, p_revision: parsedContract.data.revision, p_operation: parsedContract.data.operationId,
      p_data: input as Json, p_archive: archive,
    });
    if (error) {
      if (["P0409", "40001"].includes(error.code)) return { success: false, error: "This work site changed after you opened it. Reopen it and compare your draft before saving." };
      if (error.code === "42501") return { success: false, error: "This work site is unavailable or you no longer have permission to edit it." };
      if (error.code.startsWith("22") || error.code.startsWith("23")) return { success: false, error: "The work site could not be saved. Check the dates, coordinates and required values." };
    }
    const receipt = saveReceiptSchema.safeParse(data);
    if (error || !receipt.success || (id !== null && receipt.data.id !== id) ||
      (receipt.data.changed === false && (id === null || archive || receipt.data.revision !== parsedContract.data.revision)) ||
      (input.owner_company_id !== undefined && input.owner_company_id !== receipt.data.owner_company_id) ||
      (input.branch_id !== undefined && input.branch_id !== receipt.data.branch_id) ||
      (input.available_to_all_organizations !== undefined && input.available_to_all_organizations !== receipt.data.available_to_all_organizations)) {
      return { success: false, uncertain: true, error: "Save unconfirmed. Retry with the same values to recover its result." };
    }
    if (receipt.data.changed === false) return { success: true, data: receipt.data };
    revalidatePath("/admin/common-master-data/work-sites");
    revalidatePath(`/admin/common-master-data/work-sites/record/${receipt.data.id}`);
    return { success: true, data: receipt.data };
  } catch {
    return { success: false, uncertain: true, error: "Save unconfirmed. Retry with the same values to recover its result." };
  }
}

export async function createWorkSite(input: CreateInput, contract?: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues.map(issue => issue.message).join(". ") };
  return saveWorkSite(null, parsed.data, contract);
}

export async function updateWorkSite(input: UpdateInput, contract?: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues.map(issue => issue.message).join(". ") };
  const { id, ...values } = parsed.data;
  return saveWorkSite(id, values, contract);
}

export async function softDeleteWorkSite(id: number, contract?: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
  if (!Number.isSafeInteger(id) || id <= 0) return { success: false, error: "Invalid work site." };
  return saveWorkSite(id, {}, contract, true);
}

export async function getWorkSiteComboboxOptions(search?: string, owner_company_id?: number): Promise<ActionResult<{ value: string; label: string }[]>> {
  try {
    const ctx = await getAuthContext();
    if (!canView(ctx)) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    let q = supabase
      .from("work_sites")
      .select("id, site_name, site_code, site_type")
      .is("deleted_at", null)
      .eq("status", "active")
      .order("site_name")
      .limit(50);
    if (search) q = q.ilike("site_name", `%${search}%`);
    if (owner_company_id) q = q.eq("owner_company_id", owner_company_id);
    const { data, error } = await q;
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []).map(r => ({ value: String(r.id), label: `${r.site_name} (${r.site_code})` })) };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
