"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import { z } from "zod";

export type ActionResult<T = unknown> = { success: boolean; data?: T; error?: string };

export type DmsRequiredDocumentRuleRow = {
  id: number;
  rule_code: string;
  rule_name: string;
  entity_type: string;
  entity_subtype: string | null;
  document_type_id: number | null;
  is_required: boolean;
  requires_expiry_date: boolean;
  requires_issue_date: boolean;
  blocks_activation: boolean;
  reminder_days_before_expiry: number[] | null;
  owner_company_id: number | null;
  branch_id: number | null;
  department_id: number | null;
  effective_from: string | null;
  effective_to: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  document_type?: { id: number; type_code: string; name_en: string } | null;
  owner_company?: { id: number; legal_name_en: string } | null;
};

const createSchema = z.object({
  rule_code: z.string().min(1).max(50),
  rule_name: z.string().min(1).max(200),
  entity_type: z.string().min(1).max(100),
  entity_subtype: z.string().max(100).optional().nullable(),
  document_type_id: z.number().int().positive().optional().nullable(),
  is_required: z.boolean().default(true),
  requires_expiry_date: z.boolean().default(false),
  requires_issue_date: z.boolean().default(false),
  blocks_activation: z.boolean().default(false),
  reminder_days_before_expiry: z.array(z.number().int().positive()).optional().nullable(),
  owner_company_id: z.number().int().positive().optional().nullable(),
  branch_id: z.number().int().positive().optional().nullable(),
  department_id: z.number().int().positive().optional().nullable(),
  effective_from: z.string().optional().nullable(),
  effective_to: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  is_active: z.boolean().default(true),
});

const updateSchema = createSchema.partial().extend({ id: z.number().int().positive() });

type CreateInput = z.infer<typeof createSchema>;
type UpdateInput = z.infer<typeof updateSchema>;

function canView(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return hasPermission(ctx, "common_md.view") || hasPermission(ctx, "common_md.dms_required_documents.view");
}
function canManage(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return hasPermission(ctx, "common_md.manage") || hasPermission(ctx, "common_md.dms_required_documents.manage");
}

export async function listDmsRequiredDocumentRules(filters?: { entity_type?: string; owner_company_id?: number; is_active?: boolean; search?: string }): Promise<ActionResult<DmsRequiredDocumentRuleRow[]>> {
  try {
    const ctx = await getAuthContext();
    if (!canView(ctx)) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    let q = supabase
      .from("dms_required_document_rules")
      .select("*, document_type:dms_document_types(id,type_code,name_en), owner_company:owner_companies(id,legal_name_en)")
      .is("deleted_at", null)
      .order("entity_type")
      .order("rule_name");
    if (filters?.entity_type) q = q.eq("entity_type", filters.entity_type);
    if (filters?.owner_company_id) q = q.eq("owner_company_id", filters.owner_company_id);
    if (filters?.is_active !== undefined) q = q.eq("is_active", filters.is_active);
    if (filters?.search) q = q.ilike("rule_name", `%${filters.search}%`);
    const { data, error } = await q;
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as DmsRequiredDocumentRuleRow[] };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getDmsRequiredDocumentRuleById(id: number): Promise<ActionResult<DmsRequiredDocumentRuleRow>> {
  try {
    const ctx = await getAuthContext();
    if (!canView(ctx)) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("dms_required_document_rules")
      .select("*, document_type:dms_document_types(id,type_code,name_en), owner_company:owner_companies(id,legal_name_en)")
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: "Rule not found" };
    return { success: true, data: data as DmsRequiredDocumentRuleRow };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function createDmsRequiredDocumentRule(input: CreateInput): Promise<ActionResult<{ id: number }>> {
  try {
    const parsed = createSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues.map(i => i.message).join("; ") };
    const ctx = await getAuthContext();
    if (!canManage(ctx)) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("dms_required_document_rules")
      .insert({ ...parsed.data, created_by: ctx.profile?.id ?? null, updated_by: ctx.profile?.id ?? null })
      .select("id")
      .single();
    if (error) return { success: false, error: error.message };
    await logAudit({ module_code: "common_md", entity_name: "dms_required_document_rules", entity_id: data.id, entity_reference: parsed.data.rule_code, action: "create", new_values: parsed.data });
    revalidatePath("/admin/common-master-data/dms-required-documents");
    return { success: true, data: { id: data.id } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function updateDmsRequiredDocumentRule(input: UpdateInput): Promise<ActionResult> {
  try {
    const parsed = updateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues.map(i => i.message).join("; ") };
    const ctx = await getAuthContext();
    if (!canManage(ctx)) return { success: false, error: "Permission denied" };
    const { id, ...rest } = parsed.data;
    const supabase = await createClient();
    const { error } = await supabase
      .from("dms_required_document_rules")
      .update({ ...rest, updated_by: ctx.profile?.id ?? null, updated_at: new Date().toISOString() })
      .eq("id", id!)
      .is("deleted_at", null);
    if (error) return { success: false, error: error.message };
    await logAudit({ module_code: "common_md", entity_name: "dms_required_document_rules", entity_id: id!, entity_reference: String(id), action: "update", new_values: rest });
    revalidatePath("/admin/common-master-data/dms-required-documents");
    revalidatePath(`/admin/common-master-data/dms-required-documents/record/${id}`);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function softDeleteDmsRequiredDocumentRule(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!canManage(ctx)) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    const { error } = await supabase
      .from("dms_required_document_rules")
      .update({ deleted_at: new Date().toISOString(), is_active: false, updated_by: ctx.profile?.id ?? null })
      .eq("id", id);
    if (error) return { success: false, error: error.message };
    await logAudit({ module_code: "common_md", entity_name: "dms_required_document_rules", entity_id: id, entity_reference: String(id), action: "delete" });
    revalidatePath("/admin/common-master-data/dms-required-documents");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
