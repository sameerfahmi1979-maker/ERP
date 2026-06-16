"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import { z } from "zod";

export type ActionResult<T = unknown> = { success: boolean; data?: T; error?: string };

export type OwnerCompanySignatoryRow = {
  id: number;
  company_id: number;
  user_id: number | null;
  full_name: string;
  designation: string | null;
  signature_scope: string | null;
  is_primary: boolean;
  is_active: boolean;
  effective_from: string | null;
  effective_to: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

const createSchema = z.object({
  company_id: z.number().int().positive(),
  user_id: z.number().int().positive().optional().nullable(),
  full_name: z.string().min(1).max(200),
  designation: z.string().max(200).optional().nullable(),
  signature_scope: z.string().max(500).optional().nullable(),
  is_primary: z.boolean().default(false),
  is_active: z.boolean().default(true),
  effective_from: z.string().optional().nullable(),
  effective_to: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

const updateSchema = createSchema.partial().extend({ id: z.number().int().positive() });

type CreateInput = z.infer<typeof createSchema>;
type UpdateInput = z.infer<typeof updateSchema>;

function canView(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return hasPermission(ctx, "common_md.view") || hasPermission(ctx, "common_md.organizations.view") || hasPermission(ctx, "organizations.view");
}
function canManage(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return hasPermission(ctx, "common_md.manage") || hasPermission(ctx, "common_md.organizations.manage") || hasPermission(ctx, "organizations.manage");
}

export async function listCompanySignatories(company_id: number): Promise<ActionResult<OwnerCompanySignatoryRow[]>> {
  try {
    const ctx = await getAuthContext();
    if (!canView(ctx)) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("owner_company_signatories")
      .select("*")
      .eq("company_id", company_id)
      .is("deleted_at", null)
      .order("is_primary", { ascending: false })
      .order("full_name");
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as OwnerCompanySignatoryRow[] };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function createCompanySignatory(input: CreateInput): Promise<ActionResult<{ id: number }>> {
  try {
    const parsed = createSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues.map(i => i.message).join("; ") };
    const ctx = await getAuthContext();
    if (!canManage(ctx)) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("owner_company_signatories")
      .insert({ ...parsed.data, created_by: ctx.profile?.id ?? null, updated_by: ctx.profile?.id ?? null })
      .select("id")
      .single();
    if (error) return { success: false, error: error.message };
    await logAudit({ module_code: "common_md", entity_name: "owner_company_signatories", entity_id: data.id, entity_reference: parsed.data.full_name ?? String(data.id), action: "create", new_values: parsed.data, owner_company_id: parsed.data.company_id });
    revalidatePath(`/admin/organizations/record/${parsed.data.company_id}`);
    return { success: true, data: { id: data.id } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function updateCompanySignatory(input: UpdateInput): Promise<ActionResult> {
  try {
    const parsed = updateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues.map(i => i.message).join("; ") };
    const ctx = await getAuthContext();
    if (!canManage(ctx)) return { success: false, error: "Permission denied" };
    const { id, ...rest } = parsed.data;
    const supabase = await createClient();
    const { error } = await supabase
      .from("owner_company_signatories")
      .update({ ...rest, updated_by: ctx.profile?.id ?? null, updated_at: new Date().toISOString() })
      .eq("id", id!)
      .is("deleted_at", null);
    if (error) return { success: false, error: error.message };
    await logAudit({ module_code: "common_md", entity_name: "owner_company_signatories", entity_id: id!, entity_reference: String(id), action: "update", new_values: rest });
    if (rest.company_id) revalidatePath(`/admin/organizations/record/${rest.company_id}`);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function softDeleteCompanySignatory(id: number, company_id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!canManage(ctx)) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    const { error } = await supabase
      .from("owner_company_signatories")
      .update({ deleted_at: new Date().toISOString(), is_active: false, updated_by: ctx.profile?.id ?? null })
      .eq("id", id);
    if (error) return { success: false, error: error.message };
    await logAudit({ module_code: "common_md", entity_name: "owner_company_signatories", entity_id: id, entity_reference: String(id), action: "delete" });
    revalidatePath(`/admin/organizations/record/${company_id}`);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
