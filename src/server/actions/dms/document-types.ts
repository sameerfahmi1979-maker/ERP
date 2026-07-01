"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import { z } from "zod";
import {
  ALLOWED_CONFIDENTIALITY,
  ALLOWED_ENTITY_TYPES,
} from "@/features/dms/admin/dms-constants";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

export type DmsDocumentTypeRow = {
  id: number;
  type_code: string;
  name_en: string;
  name_ar: string | null;
  description: string | null;
  category_id: number | null;
  requires_expiry_tracking: boolean;
  is_renewable: boolean;
  default_confidentiality: string;
  requires_approval: boolean;
  default_retention_days: number | null;
  allowed_entity_types: string[];
  ai_extraction_schema: Record<string, unknown> | null;
  is_system: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  // joined
  category?: { category_code: string; name_en: string } | null;
  metadata_defs?: { id: number }[];
};

export type DmsDocumentTypeFilters = {
  category_id?: number;
  is_system?: boolean;
  is_active?: boolean;
  requires_expiry?: boolean;
  search?: string;
};

const documentTypeSchema = z.object({
  type_code: z
    .string()
    .min(1, "Code is required")
    .max(50)
    .regex(/^[A-Z0-9_]+$/, "Code must be uppercase letters, numbers, and underscores only"),
  name_en: z.string().min(1, "English name is required").max(255),
  name_ar: z.string().max(255).nullable().optional(),
  description: z.string().nullable().optional(),
  category_id: z.number().int().positive().nullable().optional(),
  requires_expiry_tracking: z.boolean().default(false),
  is_renewable: z.boolean().default(true),
  default_confidentiality: z.enum(ALLOWED_CONFIDENTIALITY).default("internal"),
  requires_approval: z.boolean().default(false),
  default_retention_days: z.number().int().positive().nullable().optional(),
  allowed_entity_types: z.array(z.enum(ALLOWED_ENTITY_TYPES)).default([]),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().min(0).default(0),
});

export type CreateDmsDocumentTypeInput = z.infer<typeof documentTypeSchema>;

function revalidateDmsDocumentTypePaths() {
  revalidatePath("/admin/dms");
  revalidatePath("/admin/dms/document-types");
  revalidatePath("/admin/dms/metadata-definitions");
}

export async function getDmsDocumentTypes(
  filters?: DmsDocumentTypeFilters
): Promise<ActionResult<DmsDocumentTypeRow[]>> {
  try {
    const supabase = await createClient();
    let query = supabase
      .from("dms_document_types")
      .select("*, category:dms_document_categories(category_code, name_en), metadata_defs:dms_metadata_definitions(id)")
      .is("deleted_at", null);

    if (filters?.category_id !== undefined) query = query.eq("category_id", filters.category_id);
    if (filters?.is_system !== undefined) query = query.eq("is_system", filters.is_system);
    if (filters?.is_active !== undefined) query = query.eq("is_active", filters.is_active);
    if (filters?.requires_expiry !== undefined) query = query.eq("requires_expiry_tracking", filters.requires_expiry);
    if (filters?.search) {
      query = query.or(`type_code.ilike.%${filters.search}%,name_en.ilike.%${filters.search}%`);
    }

    const { data, error } = await query
      .order("sort_order", { ascending: true })
      .order("name_en", { ascending: true });
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as DmsDocumentTypeRow[] };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function getDmsDocumentType(id: number): Promise<ActionResult<DmsDocumentTypeRow>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("dms_document_types")
      .select("*, category:dms_document_categories(category_code, name_en)")
      .eq("id", id)
      .single();
    if (error) return { success: false, error: error.message };
    return { success: true, data: data as DmsDocumentTypeRow };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function getDmsDocumentTypeUsage(id: number): Promise<ActionResult<{ document_count: number }>> {
  try {
    const supabase = await createClient();
    const { count, error } = await supabase
      .from("dms_documents")
      .select("id", { count: "exact", head: true })
      .eq("document_type_id", id)
      .is("deleted_at", null);
    if (error) return { success: false, error: error.message };
    return { success: true, data: { document_count: count ?? 0 } };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function createDmsDocumentType(
  input: CreateDmsDocumentTypeInput
): Promise<ActionResult<{ id: number }>> {
  try {
    const parsed = documentTypeSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
    }
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.manage_types")) {
      return { success: false, error: "Permission denied" };
    }
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("dms_document_types")
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
      entity_name: "dms_document_types",
      entity_id: data.id,
      entity_reference: parsed.data.type_code,
      action: "DMS_DOCUMENT_TYPE_CREATED",
      new_values: { ...parsed.data, allowed_entity_types: parsed.data.allowed_entity_types },
    });
    revalidateDmsDocumentTypePaths();
    return { success: true, data: { id: data.id } };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function updateDmsDocumentType(
  id: number,
  input: Partial<CreateDmsDocumentTypeInput>
): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.manage_types")) {
      return { success: false, error: "Permission denied" };
    }
    const supabase = await createClient();
    const { data: existing } = await supabase
      .from("dms_document_types")
      .select("type_code, is_system")
      .eq("id", id)
      .single();
    if (existing?.is_system && input.type_code && input.type_code !== existing.type_code) {
      return { success: false, error: "Cannot change the code of a system document type" };
    }
    const { error } = await supabase
      .from("dms_document_types")
      .update({ ...input, updated_by: ctx.profile?.id ?? null })
      .eq("id", id);
    if (error) return { success: false, error: error.message };
    await logAudit({
      module_code: "DMS",
      entity_name: "dms_document_types",
      entity_id: id,
      entity_reference: existing?.type_code ?? String(id),
      action: "DMS_DOCUMENT_TYPE_UPDATED",
      new_values: input,
    });
    revalidateDmsDocumentTypePaths();
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function activateDmsDocumentType(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.manage_types")) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    const { data: existing } = await supabase.from("dms_document_types").select("type_code").eq("id", id).single();
    const { error } = await supabase.from("dms_document_types").update({ is_active: true, updated_by: ctx.profile?.id ?? null }).eq("id", id);
    if (error) return { success: false, error: error.message };
    await logAudit({ module_code: "DMS", entity_name: "dms_document_types", entity_id: id, entity_reference: existing?.type_code ?? String(id), action: "DMS_DOCUMENT_TYPE_ACTIVATED" });
    revalidateDmsDocumentTypePaths();
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function deactivateDmsDocumentType(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.manage_types")) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    const { data: existing } = await supabase.from("dms_document_types").select("type_code").eq("id", id).single();
    const { error } = await supabase.from("dms_document_types").update({ is_active: false, updated_by: ctx.profile?.id ?? null }).eq("id", id);
    if (error) return { success: false, error: error.message };
    await logAudit({ module_code: "DMS", entity_name: "dms_document_types", entity_id: id, entity_reference: existing?.type_code ?? String(id), action: "DMS_DOCUMENT_TYPE_DEACTIVATED" });
    revalidateDmsDocumentTypePaths();
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function duplicateDmsDocumentType(id: number): Promise<ActionResult<{ id: number; type_code: string }>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.manage_types")) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    const { data: source } = await supabase.from("dms_document_types").select("*").eq("id", id).single();
    if (!source) return { success: false, error: "Document type not found" };

    const newCode = `${source.type_code}_COPY_${Date.now().toString().slice(-6)}`;
    const { data, error } = await supabase
      .from("dms_document_types")
      .insert({
        type_code: newCode,
        name_en: `${source.name_en} (Copy)`,
        name_ar: source.name_ar ? `${source.name_ar} (نسخة)` : null,
        description: source.description,
        category_id: source.category_id,
        requires_expiry_tracking: source.requires_expiry_tracking,
        is_renewable: source.is_renewable,
        default_confidentiality: source.default_confidentiality,
        requires_approval: source.requires_approval,
        default_retention_days: source.default_retention_days,
        allowed_entity_types: source.allowed_entity_types,
        is_system: false,
        is_active: true,
        sort_order: source.sort_order,
        created_by: ctx.profile?.id ?? null,
        updated_by: ctx.profile?.id ?? null,
      })
      .select("id")
      .single();
    if (error) return { success: false, error: error.message };
    await logAudit({ module_code: "DMS", entity_name: "dms_document_types", entity_id: data.id, entity_reference: newCode, action: "DMS_DOCUMENT_TYPE_DUPLICATED", new_values: { source_id: id, source_code: source.type_code } });
    revalidateDmsDocumentTypePaths();
    return { success: true, data: { id: data.id, type_code: newCode } };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function deleteDmsDocumentType(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.admin")) return { success: false, error: "Permission denied — requires dms.admin" };
    const supabase = await createClient();
    const { data: existing } = await supabase.from("dms_document_types").select("type_code, is_system").eq("id", id).single();
    if (existing?.is_system) return { success: false, error: "System document types cannot be deleted" };
    const { count: docCount } = await supabase.from("dms_documents").select("id", { count: "exact", head: true }).eq("document_type_id", id).is("deleted_at", null);
    if ((docCount ?? 0) > 0) return { success: false, error: "Document type has existing documents — deactivate instead" };
    const { error } = await supabase.from("dms_document_types").update({ deleted_at: new Date().toISOString(), updated_by: ctx.profile?.id ?? null }).eq("id", id);
    if (error) return { success: false, error: error.message };
    await logAudit({ module_code: "DMS", entity_name: "dms_document_types", entity_id: id, entity_reference: existing?.type_code ?? String(id), action: "DMS_DOCUMENT_TYPE_DELETED" });
    revalidateDmsDocumentTypePaths();
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
