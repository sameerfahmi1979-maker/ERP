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

export type DmsTagRow = {
  id: number;
  tag_code: string | null;
  tag_name: string;
  color_hex: string | null;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  // computed
  document_count?: number;
};

const tagSchema = z.object({
  tag_code: z
    .string()
    .max(50)
    .regex(/^[A-Z0-9_]+$/, "Tag code must be uppercase letters, numbers, and underscores only")
    .nullable()
    .optional(),
  tag_name: z.string().min(1, "Tag name is required").max(255),
  color_hex: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Color must be a valid hex color (e.g. #FF5733)")
    .nullable()
    .optional(),
  is_active: z.boolean().default(true),
});

export type CreateDmsTagInput = z.infer<typeof tagSchema>;

function revalidateDmsTagPaths() {
  revalidatePath("/admin/dms");
  revalidatePath("/admin/dms/tags");
}

export async function getDmsTags(): Promise<ActionResult<DmsTagRow[]>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("dms_tags")
      .select("*")
      .is("deleted_at", null)
      .order("tag_name", { ascending: true });
    if (error) return { success: false, error: error.message };

    // Get document counts per tag
    const tagIds = (data ?? []).map((t) => t.id);
    let docCounts: Record<number, number> = {};
    if (tagIds.length > 0) {
      const { data: countData } = await supabase
        .from("dms_document_tags")
        .select("tag_id")
        .in("tag_id", tagIds);
      if (countData) {
        countData.forEach((r) => {
          docCounts[r.tag_id] = (docCounts[r.tag_id] ?? 0) + 1;
        });
      }
    }

    const rows = (data ?? []).map((t) => ({ ...t, document_count: docCounts[t.id] ?? 0 })) as DmsTagRow[];
    return { success: true, data: rows };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function getDmsTag(id: number): Promise<ActionResult<DmsTagRow>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("dms_tags")
      .select("*")
      .eq("id", id)
      .single();
    if (error) return { success: false, error: error.message };
    return { success: true, data: data as DmsTagRow };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function createDmsTag(input: CreateDmsTagInput): Promise<ActionResult<{ id: number }>> {
  try {
    const parsed = tagSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
    }
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.manage_tags")) {
      return { success: false, error: "Permission denied" };
    }
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("dms_tags")
      .insert({
        ...parsed.data,
        tag_code: parsed.data.tag_code?.toUpperCase() ?? null,
        is_system: false,
        created_by: ctx.profile?.id ?? null,
        updated_by: ctx.profile?.id ?? null,
      })
      .select("id")
      .single();
    if (error) return { success: false, error: error.message };
    await logAudit({
      module_code: "DMS",
      entity_name: "dms_tags",
      entity_id: data.id,
      entity_reference: parsed.data.tag_name,
      action: "DMS_TAG_CREATED",
      new_values: parsed.data,
    });
    revalidateDmsTagPaths();
    return { success: true, data: { id: data.id } };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function updateDmsTag(id: number, input: Partial<CreateDmsTagInput>): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.manage_tags")) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    const { data: existing } = await supabase.from("dms_tags").select("tag_name").eq("id", id).single();
    const { error } = await supabase
      .from("dms_tags")
      .update({ ...input, updated_by: ctx.profile?.id ?? null })
      .eq("id", id);
    if (error) return { success: false, error: error.message };
    await logAudit({ module_code: "DMS", entity_name: "dms_tags", entity_id: id, entity_reference: existing?.tag_name ?? String(id), action: "DMS_TAG_UPDATED", new_values: input });
    revalidateDmsTagPaths();
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function activateDmsTag(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.manage_tags")) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    const { data: existing } = await supabase.from("dms_tags").select("tag_name").eq("id", id).single();
    const { error } = await supabase.from("dms_tags").update({ is_active: true, updated_by: ctx.profile?.id ?? null }).eq("id", id);
    if (error) return { success: false, error: error.message };
    await logAudit({ module_code: "DMS", entity_name: "dms_tags", entity_id: id, entity_reference: existing?.tag_name ?? String(id), action: "DMS_TAG_ACTIVATED" });
    revalidateDmsTagPaths();
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function deactivateDmsTag(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.manage_tags")) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    const { data: existing } = await supabase.from("dms_tags").select("tag_name").eq("id", id).single();
    const { error } = await supabase.from("dms_tags").update({ is_active: false, updated_by: ctx.profile?.id ?? null }).eq("id", id);
    if (error) return { success: false, error: error.message };
    await logAudit({ module_code: "DMS", entity_name: "dms_tags", entity_id: id, entity_reference: existing?.tag_name ?? String(id), action: "DMS_TAG_DEACTIVATED" });
    revalidateDmsTagPaths();
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function deleteDmsTag(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.admin")) return { success: false, error: "Permission denied — requires dms.admin" };
    const supabase = await createClient();
    const { data: existing } = await supabase.from("dms_tags").select("tag_name, is_system").eq("id", id).single();
    if (existing?.is_system) return { success: false, error: "System tags cannot be deleted" };
    const { count } = await supabase.from("dms_document_tags").select("id", { count: "exact", head: true }).eq("tag_id", id);
    if ((count ?? 0) > 0) return { success: false, error: "Tag is in use — deactivate instead" };
    const { error } = await supabase.from("dms_tags").update({ deleted_at: new Date().toISOString(), updated_by: ctx.profile?.id ?? null }).eq("id", id);
    if (error) return { success: false, error: error.message };
    await logAudit({ module_code: "DMS", entity_name: "dms_tags", entity_id: id, entity_reference: existing?.tag_name ?? String(id), action: "DMS_TAG_DELETED" });
    revalidateDmsTagPaths();
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
