"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import { z } from "zod";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

export type DmsCategoryRow = {
  id: number;
  category_code: string;
  name_en: string;
  name_ar: string | null;
  description: string | null;
  icon: string | null;
  sort_order: number;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

const categorySchema = z.object({
  category_code: z
    .string()
    .min(1, "Code is required")
    .max(50)
    .regex(/^[A-Z0-9_]+$/, "Code must be uppercase letters, numbers, and underscores only"),
  name_en: z.string().min(1, "English name is required").max(255),
  name_ar: z.string().max(255).nullable().optional(),
  description: z.string().nullable().optional(),
  icon: z.string().max(100).nullable().optional(),
  sort_order: z.number().int().min(0).default(0),
  is_active: z.boolean().default(true),
});

export type CreateDmsCategoryInput = z.infer<typeof categorySchema>;

function revalidateDmsCategories() {
  revalidatePath("/admin/dms");
  revalidatePath("/admin/dms/categories");
}

export async function getDmsCategories(): Promise<ActionResult<DmsCategoryRow[]>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("dms_document_categories")
      .select("*")
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("name_en", { ascending: true });
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as DmsCategoryRow[] };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function getDmsCategory(id: number): Promise<ActionResult<DmsCategoryRow>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("dms_document_categories")
      .select("*")
      .eq("id", id)
      .single();
    if (error) return { success: false, error: error.message };
    return { success: true, data: data as DmsCategoryRow };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function createDmsCategory(
  input: CreateDmsCategoryInput
): Promise<ActionResult<{ id: number }>> {
  try {
    const parsed = categorySchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
    }
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.manage_types")) {
      return { success: false, error: "Permission denied" };
    }
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("dms_document_categories")
      .insert({
        ...parsed.data,
        is_system: false,
        created_by: ctx.profile?.id ?? null,
        updated_by: ctx.profile?.id ?? null,
      })
      .select("id")
      .single();
    if (error) return { success: false, error: error.message };
    await logAudit({
      module_code: "DMS",
      entity_name: "dms_document_categories",
      entity_id: data.id,
      entity_reference: parsed.data.category_code,
      action: "DMS_CATEGORY_CREATED",
      new_values: parsed.data,
    });
    revalidateDmsCategories();
    return { success: true, data: { id: data.id } };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function updateDmsCategory(
  id: number,
  input: Partial<CreateDmsCategoryInput>
): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.manage_types")) {
      return { success: false, error: "Permission denied" };
    }
    const supabase = await createClient();
    const { data: existing } = await supabase
      .from("dms_document_categories")
      .select("category_code")
      .eq("id", id)
      .single();
    const { error } = await supabase
      .from("dms_document_categories")
      .update({ ...input, updated_by: ctx.profile?.id ?? null })
      .eq("id", id);
    if (error) return { success: false, error: error.message };
    await logAudit({
      module_code: "DMS",
      entity_name: "dms_document_categories",
      entity_id: id,
      entity_reference: existing?.category_code ?? String(id),
      action: "DMS_CATEGORY_UPDATED",
      new_values: input,
    });
    revalidateDmsCategories();
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function activateDmsCategory(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.manage_types")) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    const { data: existing } = await supabase.from("dms_document_categories").select("category_code").eq("id", id).single();
    const { error } = await supabase.from("dms_document_categories").update({ is_active: true, updated_by: ctx.profile?.id ?? null }).eq("id", id);
    if (error) return { success: false, error: error.message };
    await logAudit({ module_code: "DMS", entity_name: "dms_document_categories", entity_id: id, entity_reference: existing?.category_code ?? String(id), action: "DMS_CATEGORY_ACTIVATED" });
    revalidateDmsCategories();
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function deactivateDmsCategory(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.manage_types")) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    const { data: existing } = await supabase.from("dms_document_categories").select("category_code").eq("id", id).single();
    const { error } = await supabase.from("dms_document_categories").update({ is_active: false, updated_by: ctx.profile?.id ?? null }).eq("id", id);
    if (error) return { success: false, error: error.message };
    await logAudit({ module_code: "DMS", entity_name: "dms_document_categories", entity_id: id, entity_reference: existing?.category_code ?? String(id), action: "DMS_CATEGORY_DEACTIVATED" });
    revalidateDmsCategories();
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function deleteDmsCategory(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.admin")) return { success: false, error: "Permission denied — requires dms.admin" };
    const supabase = await createClient();
    const { data: existing } = await supabase
      .from("dms_document_categories")
      .select("category_code, is_system")
      .eq("id", id)
      .single();
    if (existing?.is_system) return { success: false, error: "System categories cannot be deleted" };
    const { count } = await supabase
      .from("dms_document_types")
      .select("id", { count: "exact", head: true })
      .eq("category_id", id)
      .is("deleted_at", null);
    if ((count ?? 0) > 0) return { success: false, error: "Category has active document types — deactivate instead" };
    const { error } = await supabase
      .from("dms_document_categories")
      .update({ deleted_at: new Date().toISOString(), updated_by: ctx.profile?.id ?? null })
      .eq("id", id);
    if (error) return { success: false, error: error.message };
    await logAudit({ module_code: "DMS", entity_name: "dms_document_categories", entity_id: id, entity_reference: existing?.category_code ?? String(id), action: "DMS_CATEGORY_DELETED" });
    revalidateDmsCategories();
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
