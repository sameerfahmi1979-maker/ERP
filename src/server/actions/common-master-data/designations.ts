"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import { z } from "zod";

export type ActionResult<T = unknown> = { success: boolean; data?: T; error?: string };

export type DesignationRow = {
  id: number;
  designation_code: string;
  designation_name_en: string;
  designation_name_ar: string | null;
  owner_company_id: number | null;
  department_id: number | null;
  job_level: string | null;
  management_level: string | null;
  is_supervisor: boolean;
  is_authorized_signatory: boolean;
  has_approval_authority: boolean;
  is_safety_critical: boolean;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  owner_company?: { id: number; legal_name_en: string } | null;
  department?: { id: number; department_name_en: string } | null;
};

const MGMT_LEVELS = ['staff','supervisor','manager','senior_manager','director','executive','c_level'] as const;

const createSchema = z.object({
  designation_code: z.string().min(1).max(20),
  designation_name_en: z.string().min(1).max(200),
  designation_name_ar: z.string().max(200).optional().nullable(),
  owner_company_id: z.number().int().positive().optional().nullable(),
  department_id: z.number().int().positive().optional().nullable(),
  job_level: z.string().max(100).optional().nullable(),
  management_level: z.enum(MGMT_LEVELS).optional().nullable(),
  is_supervisor: z.boolean().default(false),
  is_authorized_signatory: z.boolean().default(false),
  has_approval_authority: z.boolean().default(false),
  is_safety_critical: z.boolean().default(false),
  description: z.string().max(1000).optional().nullable(),
  is_active: z.boolean().default(true),
});

const updateSchema = createSchema.partial().extend({ id: z.number().int().positive() });

type CreateInput = z.infer<typeof createSchema>;
type UpdateInput = z.infer<typeof updateSchema>;

function canView(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return hasPermission(ctx, "common_md.view") || hasPermission(ctx, "common_md.designations.view");
}
function canManage(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return hasPermission(ctx, "common_md.manage") || hasPermission(ctx, "common_md.designations.manage");
}

export async function listDesignations(filters?: { owner_company_id?: number; department_id?: number; is_active?: boolean; search?: string }): Promise<ActionResult<DesignationRow[]>> {
  try {
    const ctx = await getAuthContext();
    if (!canView(ctx)) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    let q = supabase
      .from("designations")
      .select("*, owner_company:owner_companies(id,legal_name_en), department:departments(id,department_name_en)")
      .is("deleted_at", null)
      .order("designation_name_en");
    if (filters?.owner_company_id) q = q.eq("owner_company_id", filters.owner_company_id);
    if (filters?.department_id) q = q.eq("department_id", filters.department_id);
    if (filters?.is_active !== undefined) q = q.eq("is_active", filters.is_active);
    if (filters?.search) q = q.ilike("designation_name_en", `%${filters.search}%`);
    const { data, error } = await q;
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as DesignationRow[] };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getDesignationById(id: number): Promise<ActionResult<DesignationRow>> {
  try {
    const ctx = await getAuthContext();
    if (!canView(ctx)) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("designations")
      .select("*, owner_company:owner_companies(id,legal_name_en), department:departments(id,department_name_en)")
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: "Designation not found" };
    return { success: true, data: data as DesignationRow };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function createDesignation(input: CreateInput): Promise<ActionResult<{ id: number }>> {
  try {
    const parsed = createSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues.map(i => i.message).join("; ") };
    const ctx = await getAuthContext();
    if (!canManage(ctx)) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("designations")
      .insert({ ...parsed.data, created_by: ctx.profile?.id ?? null, updated_by: ctx.profile?.id ?? null })
      .select("id")
      .single();
    if (error) return { success: false, error: error.message };
    await logAudit({ module_code: "common_md", entity_name: "designations", entity_id: data.id, entity_reference: parsed.data.designation_code, action: "create", new_values: parsed.data });
    revalidatePath("/admin/common-master-data/designations");
    return { success: true, data: { id: data.id } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function updateDesignation(input: UpdateInput): Promise<ActionResult> {
  try {
    const parsed = updateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues.map(i => i.message).join("; ") };
    const ctx = await getAuthContext();
    if (!canManage(ctx)) return { success: false, error: "Permission denied" };
    const { id, ...rest } = parsed.data;
    const supabase = await createClient();
    const { error } = await supabase
      .from("designations")
      .update({ ...rest, updated_by: ctx.profile?.id ?? null, updated_at: new Date().toISOString() })
      .eq("id", id!)
      .is("deleted_at", null);
    if (error) return { success: false, error: error.message };
    await logAudit({ module_code: "common_md", entity_name: "designations", entity_id: id!, entity_reference: String(id), action: "update", new_values: rest });
    revalidatePath("/admin/common-master-data/designations");
    revalidatePath(`/admin/common-master-data/designations/record/${id}`);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function softDeleteDesignation(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!canManage(ctx)) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    const { error } = await supabase
      .from("designations")
      .update({ deleted_at: new Date().toISOString(), is_active: false, updated_by: ctx.profile?.id ?? null })
      .eq("id", id);
    if (error) return { success: false, error: error.message };
    await logAudit({ module_code: "common_md", entity_name: "designations", entity_id: id, entity_reference: String(id), action: "delete" });
    revalidatePath("/admin/common-master-data/designations");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getDesignationComboboxOptions(search?: string, owner_company_id?: number): Promise<ActionResult<{ value: string; label: string }[]>> {
  try {
    const ctx = await getAuthContext();
    if (!canView(ctx)) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    let q = supabase
      .from("designations")
      .select("id, designation_name_en, designation_code")
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("designation_name_en")
      .limit(50);
    if (search) q = q.ilike("designation_name_en", `%${search}%`);
    if (owner_company_id) q = q.eq("owner_company_id", owner_company_id);
    const { data, error } = await q;
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []).map(r => ({ value: String(r.id), label: `${r.designation_name_en} (${r.designation_code})` })) };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
