"use server";
import { traceRequest } from "@/lib/performance/request";
import {saveWorkspaceRecord, type WorkspaceSaveResult} from "@/server/workspace-save";
import type {WorkspaceSaveContract} from "@/lib/workspace/save-contract";
import { workspaceValidationFailure } from "@/lib/workspace/field-errors";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import { z } from "zod";

export type ActionResult<T = unknown> = { success: boolean; data?: T; error?: string };

export type DepartmentRow = {
  id: number;
  department_code: string;
  department_name_en: string;
  department_name_ar: string | null;
  owner_company_id: number;
  branch_id: number | null;
  parent_department_id: number | null;
  cost_center_id: number | null;
  department_head_user_id: number | null;
  description: string | null;
  is_active: boolean;
  effective_from: string | null;
  effective_to: string | null;
  created_at: string;
  updated_at: string;
  workspace_revision: number;
  deleted_at: string | null;
  owner_company?: { id: number; legal_name_en: string; company_code: string } | null;
  branch?: { id: number; branch_name_en: string } | null;
  parent_department?: { id: number; department_name_en: string } | null;
};

const createDepartmentSchema = z.object({
  department_code: z.string().min(1).max(20),
  department_name_en: z.string().min(1).max(200),
  department_name_ar: z.string().max(200).optional().nullable(),
  owner_company_id: z.number().int().positive(),
  branch_id: z.number().int().positive().optional().nullable(),
  parent_department_id: z.number().int().positive().optional().nullable(),
  cost_center_id: z.number().int().positive().optional().nullable(),
  department_head_user_id: z.number().int().positive().optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
  is_active: z.boolean().default(true),
  effective_from: z.string().optional().nullable(),
  effective_to: z.string().optional().nullable(),
});

const updateDepartmentSchema = createDepartmentSchema.partial().extend({ id: z.number().int().positive() });

type CreateDeptInput = z.infer<typeof createDepartmentSchema>;
type UpdateDeptInput = z.infer<typeof updateDepartmentSchema>;

function canView(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return hasPermission(ctx, "common_md.view") || hasPermission(ctx, "common_md.departments.view");
}
function canManage(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return hasPermission(ctx, "common_md.manage") || hasPermission(ctx, "common_md.departments.manage");
}

export async function listDepartments(filters?: Parameters<typeof listDepartmentsImpl>[0]) {
  return traceRequest("departments.list", () => listDepartmentsImpl(filters));
}

async function listDepartmentsImpl(filters?: {
  owner_company_id?: number;
  branch_id?: number;
  is_active?: boolean;
  search?: string;
}): Promise<ActionResult<DepartmentRow[]>> {
  try {
    const ctx = await getAuthContext();
    if (!canView(ctx)) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    let q = supabase
      .from("departments")
      .select("*, owner_company:owner_companies(id,legal_name_en,company_code), branch:branches(id,branch_name_en), parent_department:departments!parent_department_id(id,department_name_en)")
      .is("deleted_at", null)
      .order("department_name_en");
    if (filters?.owner_company_id) q = q.eq("owner_company_id", filters.owner_company_id);
    if (filters?.branch_id) q = q.eq("branch_id", filters.branch_id);
    if (filters?.is_active !== undefined) q = q.eq("is_active", filters.is_active);
    if (filters?.search) q = q.ilike("department_name_en", `%${filters.search}%`);
    const { data, error } = await q;
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as DepartmentRow[] };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getDepartmentById(id: number): Promise<ActionResult<DepartmentRow>> {
  try {
    const ctx = await getAuthContext();
    if (!canView(ctx)) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("departments")
      .select("*, owner_company:owner_companies(id,legal_name_en,company_code), branch:branches(id,branch_name_en), parent_department:departments!parent_department_id(id,department_name_en)")
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: "Department not found" };
    return { success: true, data: data as DepartmentRow };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function createDepartment(input: CreateDeptInput, contract: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
  const parsed = createDepartmentSchema.safeParse(input);
  if (!parsed.success) return workspaceValidationFailure(parsed.error.issues);
  const ctx=await getAuthContext();
  if (!canManage(ctx)) return {success:false,error:"Permission denied"};
  const result=await saveWorkspaceRecord("departments",null,parsed.data,contract);
  if(result.success) revalidatePath("/admin/common-master-data/departments");
  return result;
}

export async function updateDepartment(input: UpdateDeptInput, contract: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
  const parsed=updateDepartmentSchema.safeParse(input);
  if(!parsed.success) return workspaceValidationFailure(parsed.error.issues);
  const ctx=await getAuthContext();
  if(!canManage(ctx)) return {success:false,error:"Permission denied"};
  const {id,...payload}=parsed.data;
  const result=await saveWorkspaceRecord("departments",id,payload,contract);
  if(result.success) revalidatePath("/admin/common-master-data/departments");
  return result;
}

export async function softDeleteDepartment(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!canManage(ctx)) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    const { error } = await supabase
      .from("departments")
      .update({ deleted_at: new Date().toISOString(), is_active: false, updated_by: ctx.profile?.id ?? null })
      .eq("id", id);
    if (error) return { success: false, error: error.message };
    await logAudit({ module_code: "common_md", entity_name: "departments", entity_id: id, entity_reference: String(id), action: "delete" });
    revalidatePath("/admin/common-master-data/departments");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getDepartmentComboboxOptions(search?: string, owner_company_id?: number): Promise<ActionResult<{ value: string; label: string }[]>> {
  return traceRequest("departments.lookup", () => departmentComboboxImpl(search, owner_company_id));
}

async function departmentComboboxImpl(search?: string, owner_company_id?: number): Promise<ActionResult<{ value: string; label: string }[]>> {
  try {
    const ctx = await getAuthContext();
    if (!canView(ctx)) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    let q = supabase
      .from("departments")
      .select("id, department_name_en, department_code")
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("department_name_en")
      .limit(50);
    if (search) q = q.ilike("department_name_en", `%${search}%`);
    if (owner_company_id) q = q.eq("owner_company_id", owner_company_id);
    const { data, error } = await q;
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []).map(r => ({ value: String(r.id), label: `${r.department_name_en} (${r.department_code})` })) };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
