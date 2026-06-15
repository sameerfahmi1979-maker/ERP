"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import { z } from "zod";
import { ALLOWED_FIELD_TYPES } from "@/features/dms/admin/dms-constants";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

export type DmsMetadataDefinitionRow = {
  id: number;
  document_type_id: number;
  field_code: string;
  field_label_en: string;
  field_label_ar: string | null;
  field_type: string;
  is_required: boolean;
  is_ai_extractable: boolean;
  ai_field_hint: string | null;
  options_json: Record<string, unknown> | null;
  validation_json: Record<string, unknown> | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  // joined
  document_type?: { type_code: string; name_en: string } | null;
};

export type DmsMetadataDefinitionFilters = {
  document_type_id?: number;
  field_type?: string;
  is_required?: boolean;
  is_ai_extractable?: boolean;
  is_active?: boolean;
};

const metadataDefinitionSchema = z.object({
  document_type_id: z.number().int().positive("Document type is required"),
  field_code: z
    .string()
    .min(1, "Field code is required")
    .max(100)
    .regex(/^[a-z0-9_]+$/, "Field code must be lowercase letters, numbers, and underscores only"),
  field_label_en: z.string().min(1, "English label is required").max(255),
  field_label_ar: z.string().max(255).nullable().optional(),
  field_type: z.enum(ALLOWED_FIELD_TYPES),
  is_required: z.boolean().default(false),
  is_ai_extractable: z.boolean().default(false),
  ai_field_hint: z.string().max(500).nullable().optional(),
  options_json: z.record(z.string(), z.unknown()).nullable().optional(),
  validation_json: z.record(z.string(), z.unknown()).nullable().optional(),
  sort_order: z.number().int().min(0).default(0),
  is_active: z.boolean().default(true),
});

export type CreateDmsMetadataDefinitionInput = z.infer<typeof metadataDefinitionSchema>;

function revalidateDmsMetadataPaths() {
  revalidatePath("/admin/dms");
  revalidatePath("/admin/dms/metadata-definitions");
}

export async function getDmsMetadataDefinitions(
  filters?: DmsMetadataDefinitionFilters
): Promise<ActionResult<DmsMetadataDefinitionRow[]>> {
  try {
    const supabase = await createClient();
    let query = supabase
      .from("dms_metadata_definitions")
      .select("*, document_type:dms_document_types(type_code, name_en)")
      .is("deleted_at", null);

    if (filters?.document_type_id !== undefined) query = query.eq("document_type_id", filters.document_type_id);
    if (filters?.field_type !== undefined) query = query.eq("field_type", filters.field_type);
    if (filters?.is_required !== undefined) query = query.eq("is_required", filters.is_required);
    if (filters?.is_ai_extractable !== undefined) query = query.eq("is_ai_extractable", filters.is_ai_extractable);
    if (filters?.is_active !== undefined) query = query.eq("is_active", filters.is_active);

    const { data, error } = await query
      .order("document_type_id", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("field_label_en", { ascending: true });
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as DmsMetadataDefinitionRow[] };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function getDmsMetadataDefinition(id: number): Promise<ActionResult<DmsMetadataDefinitionRow>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("dms_metadata_definitions")
      .select("*, document_type:dms_document_types(type_code, name_en)")
      .eq("id", id)
      .single();
    if (error) return { success: false, error: error.message };
    return { success: true, data: data as DmsMetadataDefinitionRow };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function createDmsMetadataDefinition(
  input: CreateDmsMetadataDefinitionInput
): Promise<ActionResult<{ id: number }>> {
  try {
    const parsed = metadataDefinitionSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
    }
    // Validate options_json for select/multi_select
    if ((parsed.data.field_type === "select" || parsed.data.field_type === "multi_select") && !parsed.data.options_json) {
      return { success: false, error: "options_json is required for select and multi_select field types" };
    }
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.manage_types")) {
      return { success: false, error: "Permission denied" };
    }
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("dms_metadata_definitions")
      .insert({
        ...parsed.data,
        created_by: ctx.profile?.id ?? null,
        updated_by: ctx.profile?.id ?? null,
      })
      .select("id")
      .single();
    if (error) return { success: false, error: error.message };
    await logAudit({
      module_code: "DMS",
      entity_name: "dms_metadata_definitions",
      entity_id: data.id,
      entity_reference: `${parsed.data.document_type_id}:${parsed.data.field_code}`,
      action: "DMS_METADATA_FIELD_CREATED",
      new_values: { ...parsed.data },
    });
    revalidateDmsMetadataPaths();
    return { success: true, data: { id: data.id } };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function updateDmsMetadataDefinition(
  id: number,
  input: Partial<CreateDmsMetadataDefinitionInput>
): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.manage_types")) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    const { data: existing } = await supabase.from("dms_metadata_definitions").select("field_code, document_type_id").eq("id", id).single();
    const { error } = await supabase
      .from("dms_metadata_definitions")
      .update({ ...input, updated_by: ctx.profile?.id ?? null })
      .eq("id", id);
    if (error) return { success: false, error: error.message };
    await logAudit({ module_code: "DMS", entity_name: "dms_metadata_definitions", entity_id: id, entity_reference: existing?.field_code ?? String(id), action: "DMS_METADATA_FIELD_UPDATED", new_values: input });
    revalidateDmsMetadataPaths();
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function activateDmsMetadataDefinition(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.manage_types")) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    const { data: existing } = await supabase.from("dms_metadata_definitions").select("field_code").eq("id", id).single();
    const { error } = await supabase.from("dms_metadata_definitions").update({ is_active: true, updated_by: ctx.profile?.id ?? null }).eq("id", id);
    if (error) return { success: false, error: error.message };
    await logAudit({ module_code: "DMS", entity_name: "dms_metadata_definitions", entity_id: id, entity_reference: existing?.field_code ?? String(id), action: "DMS_METADATA_FIELD_ACTIVATED" });
    revalidateDmsMetadataPaths();
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function deactivateDmsMetadataDefinition(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.manage_types")) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    const { data: existing } = await supabase.from("dms_metadata_definitions").select("field_code").eq("id", id).single();
    const { error } = await supabase.from("dms_metadata_definitions").update({ is_active: false, updated_by: ctx.profile?.id ?? null }).eq("id", id);
    if (error) return { success: false, error: error.message };
    await logAudit({ module_code: "DMS", entity_name: "dms_metadata_definitions", entity_id: id, entity_reference: existing?.field_code ?? String(id), action: "DMS_METADATA_FIELD_DEACTIVATED" });
    revalidateDmsMetadataPaths();
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function deleteDmsMetadataDefinition(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.admin")) return { success: false, error: "Permission denied — requires dms.admin" };
    const supabase = await createClient();
    const { data: existing } = await supabase.from("dms_metadata_definitions").select("field_code, document_type_id").eq("id", id).single();
    const { count } = await supabase
      .from("dms_document_metadata_values")
      .select("id", { count: "exact", head: true })
      .eq("metadata_definition_id", id);
    if ((count ?? 0) > 0) return { success: false, error: "Metadata field has existing values — deactivate instead" };
    const { error } = await supabase.from("dms_metadata_definitions").update({ deleted_at: new Date().toISOString(), updated_by: ctx.profile?.id ?? null }).eq("id", id);
    if (error) return { success: false, error: error.message };
    await logAudit({ module_code: "DMS", entity_name: "dms_metadata_definitions", entity_id: id, entity_reference: existing?.field_code ?? String(id), action: "DMS_METADATA_FIELD_DELETED" });
    revalidateDmsMetadataPaths();
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function reorderDmsMetadataDefinitions(
  documentTypeId: number,
  orderedIds: number[]
): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.manage_types")) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    const updates = orderedIds.map((id, index) =>
      supabase.from("dms_metadata_definitions").update({ sort_order: index, updated_by: ctx.profile?.id ?? null }).eq("id", id).eq("document_type_id", documentTypeId)
    );
    await Promise.all(updates);
    await logAudit({ module_code: "DMS", entity_name: "dms_metadata_definitions", entity_id: documentTypeId, entity_reference: `type:${documentTypeId}`, action: "DMS_METADATA_FIELD_REORDERED", new_values: { ordered_ids: orderedIds } });
    revalidateDmsMetadataPaths();
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
