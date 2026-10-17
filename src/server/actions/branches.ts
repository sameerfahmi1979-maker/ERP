"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import {saveAdministrationRecord} from '@/server/administration-save';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';
import type {WorkspaceSaveResult} from '@/server/workspace-save';
import {
  createBranchSchema,
  updateBranchSchema,
  type CreateBranchInput,
  type UpdateBranchInput,
} from "@/features/branches/branch-schema";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: 'invalid' | 'denied' | 'not_found' | 'unavailable';
};

export async function getBranchById(id: number): Promise<ActionResult<import("@/types/domain").BranchWithCompany>> {
  if (!Number.isSafeInteger(id) || id < 1) return {success:false,errorCode:'invalid',error:'Invalid branch reference.'};
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "branches.view")) {
      return { success: false, errorCode:'denied', error: "You do not have permission to view branches" };
    }
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("branches")
      .select("*, owner_company:owner_companies(id, legal_name_en, company_code, status)")
      .eq("id", id)
      .maybeSingle();
    if (error) return {success:false,errorCode:'unavailable',error:'The branch could not be loaded. Please retry.'};
    if (!data) return { success: false, errorCode:'not_found', error: "Branch not found" };
    if (data.id !== id) return {success:false,errorCode:'unavailable',error:'The branch response could not be verified. Please retry.'};
    return { success: true, data: data as import("@/types/domain").BranchWithCompany };
  } catch {
    return { success: false, errorCode:'unavailable', error:'The branch could not be loaded. Please retry.' };
  }
}

/** Atomic record/audit/receipt save; branding remains a separate reported step. */
export async function createBranch(input: CreateBranchInput, contract?: WorkspaceSaveContract): Promise<WorkspaceSaveResult & {warning?:string}> {
  const parsed=createBranchSchema.safeParse(input);
  if(!parsed.success)return {success:false,error:parsed.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; ')};
  const saved=await saveAdministrationRecord('branches',null,parsed.data,contract);

  return saved;
}

export async function updateBranch(input: UpdateBranchInput, contract?: WorkspaceSaveContract): Promise<WorkspaceSaveResult & {warning?:string}> {
  const parsed=updateBranchSchema.safeParse(input);
  if(!parsed.success)return {success:false,error:parsed.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; ')};
  const {id,...data}=parsed.data;
  const saved=await saveAdministrationRecord('branches',id,data,contract);

  return saved;
}

/** Compatibility name: retire without deleting referenced records or history. */
export async function deleteBranch(id: number, contract?: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
  return saveAdministrationRecord('branches',id,{status:'inactive'},contract);
}

/** Revision-safe, replayable lifecycle change with atomic audit. */
export async function updateBranchStatus(id: number, status: 'active'|'inactive'|'suspended', contract?: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
  if(!['active','inactive','suspended'].includes(status))return {success:false,error:'Choose a valid record status.'};
  return saveAdministrationRecord('branches',id,{status},contract);
}
