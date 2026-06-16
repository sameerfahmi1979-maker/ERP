"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import { z } from "zod";

export type ActionResult<T = unknown> = { success: boolean; data?: T; error?: string };

export type WorkSiteRow = {
  id: number;
  site_code: string;
  site_name: string;
  site_type: string;
  owner_company_id: number;
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
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  site_contact_name: z.string().max(200).optional().nullable(),
  site_contact_phone: z.string().max(50).optional().nullable(),
  site_contact_email: z.string().email().optional().nullable(),
  is_restricted_area: z.boolean().default(false),
  cicpa_required: z.boolean().default(false),
  adnoc_required: z.boolean().default(false),
  work_calendar_id: z.number().int().positive().optional().nullable(),
  access_notes: z.string().max(2000).optional().nullable(),
  status: z.enum(SITE_STATUSES).default('active'),
  opening_date: z.string().optional().nullable(),
  closing_date: z.string().optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
});

const updateSchema = createSchema.partial().extend({ id: z.number().int().positive() });

type CreateInput = z.infer<typeof createSchema>;
type UpdateInput = z.infer<typeof updateSchema>;

function canView(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return hasPermission(ctx, "common_md.view") || hasPermission(ctx, "common_md.work_sites.view");
}
function canManage(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return hasPermission(ctx, "common_md.manage") || hasPermission(ctx, "common_md.work_sites.manage");
}

export async function listWorkSites(filters?: { owner_company_id?: number; branch_id?: number; site_type?: string; status?: string; search?: string }): Promise<ActionResult<WorkSiteRow[]>> {
  try {
    const ctx = await getAuthContext();
    if (!canView(ctx)) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    let q = supabase
      .from("work_sites")
      .select("*, owner_company:owner_companies(id,legal_name_en), branch:branches(id,branch_name_en)")
      .is("deleted_at", null)
      .order("site_name");
    if (filters?.owner_company_id) q = q.eq("owner_company_id", filters.owner_company_id);
    if (filters?.branch_id) q = q.eq("branch_id", filters.branch_id);
    if (filters?.site_type) q = q.eq("site_type", filters.site_type);
    if (filters?.status) q = q.eq("status", filters.status);
    if (filters?.search) q = q.ilike("site_name", `%${filters.search}%`);
    const { data, error } = await q;
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as WorkSiteRow[] };
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

export async function createWorkSite(input: CreateInput): Promise<ActionResult<{ id: number }>> {
  try {
    const parsed = createSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues.map(i => i.message).join("; ") };
    const ctx = await getAuthContext();
    if (!canManage(ctx)) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("work_sites")
      .insert({ ...parsed.data, created_by: ctx.profile?.id ?? null, updated_by: ctx.profile?.id ?? null })
      .select("id")
      .single();
    if (error) return { success: false, error: error.message };
    await logAudit({ module_code: "common_md", entity_name: "work_sites", entity_id: data.id, entity_reference: parsed.data.site_code, action: "create", new_values: parsed.data });
    revalidatePath("/admin/common-master-data/work-sites");
    return { success: true, data: { id: data.id } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function updateWorkSite(input: UpdateInput): Promise<ActionResult> {
  try {
    const parsed = updateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues.map(i => i.message).join("; ") };
    const ctx = await getAuthContext();
    if (!canManage(ctx)) return { success: false, error: "Permission denied" };
    const { id, ...rest } = parsed.data;
    const supabase = await createClient();
    const { error } = await supabase
      .from("work_sites")
      .update({ ...rest, updated_by: ctx.profile?.id ?? null, updated_at: new Date().toISOString() })
      .eq("id", id!)
      .is("deleted_at", null);
    if (error) return { success: false, error: error.message };
    await logAudit({ module_code: "common_md", entity_name: "work_sites", entity_id: id!, entity_reference: String(id), action: "update", new_values: rest });
    revalidatePath("/admin/common-master-data/work-sites");
    revalidatePath(`/admin/common-master-data/work-sites/record/${id}`);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function softDeleteWorkSite(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!canManage(ctx)) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    const { error } = await supabase
      .from("work_sites")
      .update({ deleted_at: new Date().toISOString(), status: "closed", updated_by: ctx.profile?.id ?? null })
      .eq("id", id);
    if (error) return { success: false, error: error.message };
    await logAudit({ module_code: "common_md", entity_name: "work_sites", entity_id: id, entity_reference: String(id), action: "delete" });
    revalidatePath("/admin/common-master-data/work-sites");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
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
