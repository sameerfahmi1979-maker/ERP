"use server";
import {saveWorkspaceRecord, type WorkspaceSaveResult} from "@/server/workspace-save";
import type {WorkspaceSaveContract} from "@/lib/workspace/save-contract";
import { workspaceValidationFailure } from "@/lib/workspace/field-errors";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import {setMasterArchived} from "@/server/master-lifecycle";
import { z } from "zod";
import {createDepartmentSchema,updateDepartmentSchema} from '@/lib/master-data/department-validation';
import {readAllPages} from '@/server/reads/all-pages';
import {literalContains} from '@/lib/reads/search';

export type ActionResult<T = unknown> = { success: boolean; data?: T; error?: string; kind?: 'forbidden'|'not_found'|'failed'|'invalid_input' };

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


type CreateDeptInput = z.infer<typeof createDepartmentSchema>;
type UpdateDeptInput = z.infer<typeof updateDepartmentSchema>;

function canView(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return hasPermission(ctx, "common_md.view") || hasPermission(ctx, "common_md.departments.view");
}
function canManage(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return hasPermission(ctx, "common_md.manage") || hasPermission(ctx, "common_md.departments.manage");
}

export async function listDepartments(filters?: {
  owner_company_id?: number;
  branch_id?: number;
  is_active?: boolean;
  search?: string;
}): Promise<ActionResult<DepartmentRow[]>> {
  try {
    const ctx = await getAuthContext();
    if (!canView(ctx)) return { success: false, kind:'forbidden', error: "Permission denied" };
    const supabase = await createClient();
    const data = await readAllPages<DepartmentRow>(async (from,to) => {
    let q = supabase
      .from("departments")
      .select("*, owner_company:owner_companies(id,legal_name_en,company_code), branch:branches(id,branch_name_en), parent_department:departments!parent_department_id(id,department_name_en)", {count:'exact'})
      .retry(false)
      .is("deleted_at", null)
      .order("department_name_en").order("id").range(from,to);
    if (filters?.owner_company_id) q = q.eq("owner_company_id", filters.owner_company_id);
    if (filters?.branch_id) q = q.eq("branch_id", filters.branch_id);
    if (filters?.is_active !== undefined) q = q.eq("is_active", filters.is_active);
    if (filters?.search) { const value=literalContains(filters.search); q=q.or(`department_code.ilike.${value},department_name_en.ilike.${value},department_name_ar.ilike.${value}`); }
    const {data,error,count}=await q;
    return {data:data as DepartmentRow[]|null,error,count};
    }, {identity:row=>row.id});
    return { success: true, data };
  } catch {
    return { success: false, kind:'failed', error: "Departments could not be loaded. Try again." };
  }
}

export async function getDepartmentById(id: number): Promise<ActionResult<DepartmentRow>> {
  if(!Number.isSafeInteger(id)||id<=0)return {success:false,kind:'invalid_input',error:'Invalid department identifier.'};
  try {
    const ctx = await getAuthContext();
    if (!canView(ctx)) return { success: false, kind:'forbidden', error: "Permission denied" };
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("departments")
      .select("*, owner_company:owner_companies(id,legal_name_en,company_code), branch:branches(id,branch_name_en), parent_department:departments!parent_department_id(id,department_name_en)")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) return { success: false, kind:'failed', error: "Department could not be loaded. Try again." };
    // Missing and outside row-level scope deliberately share one safe outcome.
    if (!data) return { success: false, kind:'not_found', error: "Department not found" };
    return { success: true, data: data as DepartmentRow };
  } catch {
    return { success: false, kind:'failed', error: "Department could not be loaded. Try again." };
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

export async function softDeleteDepartment(id: number,contract:WorkspaceSaveContract) {
  return setMasterArchived('departments',id,true,contract);
}

export async function restoreDepartment(id:number,contract:WorkspaceSaveContract) {
  return setMasterArchived('departments',id,false,contract);
}

export async function getDepartmentComboboxOptions(search?: string, owner_company_id?: number): Promise<ActionResult<{ value: string; label: string }[]>> {
  try {
    const ctx = await getAuthContext();
    if (!canView(ctx)) return { success: false, kind:'forbidden', error: "Permission denied" };
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
    if (error) return { success: false, kind:'failed', error: "Department choices could not be loaded. Try again." };
    return { success: true, data: (data ?? []).map(r => ({ value: String(r.id), label: `${r.department_name_en} (${r.department_code})` })) };
  } catch {
    return { success: false, kind:'failed', error: "Department choices could not be loaded. Try again." };
  }
}
