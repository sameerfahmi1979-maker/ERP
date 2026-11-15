"use server";

import { readCataloguePage } from "@/lib/master-data/catalogue-page";
import { literalContains } from "@/lib/reads/search";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { hasGlobalPermission } from "@/lib/rbac/scope";
import { saveCommonCatalogue } from "@/server/save-common-catalogue";
import type { WorkspaceSaveContract } from "@/lib/workspace/save-contract";
import type { WorkspaceSaveResult } from "@/server/workspace-save";
import { z } from "zod";

export type ActionResult<T = unknown> = { success: boolean; data?: T; error?: string };

export type ApprovalRoleRow = {
  id: number;
  workspace_revision?: number;
  role_code: string;
  role_name: string;
  level_number: number;
  scope: string;
  module_code: string | null;
  amount_limit: number | null;
  currency_code: string | null;
  can_approve: boolean;
  can_reject: boolean;
  can_delegate: boolean;
  escalation_role_id: number | null;
  owner_company_id: number | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  owner_company?: { id: number; legal_name_en: string } | null;
  escalation_role?: { id: number; role_name: string } | null;
};

const SCOPES = ['company','branch','department','site','module','global'] as const;

const createSchema = z.object({
  role_code: z.string().min(1).max(50),
  role_name: z.string().min(1).max(200),
  level_number: z.number().int().positive(),
  scope: z.enum(SCOPES).default('company'),
  module_code: z.string().max(50).optional().nullable(),
  amount_limit: z.number().positive().optional().nullable(),
  currency_code: z.string().max(10).default('AED').optional().nullable(),
  can_approve: z.boolean().default(true),
  can_reject: z.boolean().default(true),
  can_delegate: z.boolean().default(false),
  escalation_role_id: z.number().int().positive().optional().nullable(),
  owner_company_id: z.number().int().positive().optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  is_active: z.boolean().default(true),
});

const updateSchema = createSchema.partial().extend({ id: z.number().int().positive() });

type CreateInput = z.infer<typeof createSchema>;
type UpdateInput = z.infer<typeof updateSchema>;

function canView(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return hasPermission(ctx, "common_md.view") || hasPermission(ctx, "common_md.approval_roles.view");
}
function canManage(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return hasGlobalPermission(ctx, "common_md.manage") || hasGlobalPermission(ctx, "common_md.approval_roles.manage");
}

export async function listApprovalRoles(filters?: { owner_company_id?: number; scope?: string; is_active?: boolean; search?: string; page?: number }): Promise<ActionResult<ApprovalRoleRow[]> & { totalCount?: number }> {
  try {
    const ctx = await getAuthContext();
    if (!canView(ctx)) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    const query = (head = false) => {
      let q = supabase
      .from("approval_roles")
      .select("*, owner_company:owner_companies(id,legal_name_en), escalation_role:approval_roles!escalation_role_id(id,role_name)", { count: "exact", head })
      .is("deleted_at", null)
      .order("level_number");
    if (filters?.owner_company_id) q = q.eq("owner_company_id", filters.owner_company_id);
    if (filters?.scope) q = q.eq("scope", filters.scope);
    if (filters?.is_active !== undefined) q = q.eq("is_active", filters.is_active);
    if (filters?.search) q = q.or(`role_name.ilike.${literalContains(filters.search)},role_code.ilike.${literalContains(filters.search)}`);
    return q.order("id");
    };
    if ((filters?.search?.length ?? 0) > 200) throw new Error("Catalogue search is too long.");
    const { data, totalCount } = await readCataloguePage(query(), filters?.page ?? 1, () => query(true));
    return { success: true, data: data as unknown as ApprovalRoleRow[], totalCount };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getApprovalRoleById(id: number): Promise<ActionResult<ApprovalRoleRow>> {
  try {
    const ctx = await getAuthContext();
    if (!canView(ctx)) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("approval_roles")
      .select("*, owner_company:owner_companies(id,legal_name_en), escalation_role:approval_roles!escalation_role_id(id,role_name)")
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: "Approval role not found" };
    return { success: true, data: data as ApprovalRoleRow };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function createApprovalRole(input: CreateInput, contract?: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues.map(issue => issue.message).join(". ") };
  if (!canManage(await getAuthContext())) return { success: false, error: "Permission denied" };
  return saveCommonCatalogue("approval_roles", null, parsed.data, contract);
}

export async function updateApprovalRole(input: UpdateInput, contract?: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues.map(issue => issue.message).join(". ") };
  if (!canManage(await getAuthContext())) return { success: false, error: "Permission denied" };
  const { id, ...values } = parsed.data;
  const changes = Object.fromEntries(Object.entries(values).filter(([key]) => Object.hasOwn(input,key)));
  return saveCommonCatalogue("approval_roles", id, changes, contract);
}

export async function softDeleteApprovalRole(id: number, contract?: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
  if (!Number.isSafeInteger(id) || id <= 0) return { success: false, error: "Invalid catalogue record." };
  if (!canManage(await getAuthContext())) return { success: false, error: "Permission denied" };
  return saveCommonCatalogue("approval_roles", id, {}, contract, true);
}

export async function getApprovalRoleComboboxOptions(search?: string): Promise<ActionResult<{ value: string; label: string }[]>> {
  try {
    const ctx = await getAuthContext();
    if (!canView(ctx)) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    let q = supabase
      .from("approval_roles")
      .select("id, role_name, role_code, level_number")
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("level_number")
      .limit(50);
    if (search) q = q.ilike("role_name", `%${search}%`);
    const { data, error } = await q;
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []).map(r => ({ value: String(r.id), label: `L${r.level_number} — ${r.role_name} (${r.role_code})` })) };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
