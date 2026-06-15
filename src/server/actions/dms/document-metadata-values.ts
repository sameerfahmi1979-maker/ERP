"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

export type DmsMetadataDefinitionRow = {
  id: number;
  field_code: string;
  label_en: string;
  label_ar: string | null;
  field_type: string;
  is_required: boolean;
  is_ai_extractable: boolean;
  ai_field_hint: string | null;
  sort_order: number;
  options_json: unknown;
  validation_json: unknown;
  document_type_id: number;
};

export type DmsMetadataValueInput = {
  definition_id: number;
  value_text?: string | null;
  value_number?: number | null;
  value_date?: string | null;
  value_datetime?: string | null;
  value_boolean?: boolean | null;
  value_json?: unknown;
};

export type DmsMetadataValueRow = {
  id: number;
  document_id: number;
  definition_id: number;
  value_text: string | null;
  value_number: number | null;
  value_date: string | null;
  value_datetime: string | null;
  value_boolean: boolean | null;
  value_json: unknown;
  definition?: DmsMetadataDefinitionRow | null;
};

// ── getMetadataDefinitionsForType ─────────────────────────────────────────────

export async function getMetadataDefinitionsForType(
  documentTypeId: number
): Promise<ActionResult<DmsMetadataDefinitionRow[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.view") && !hasPermission(ctx, "dms.admin")) {
      return { success: false, error: "Permission denied" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("dms_metadata_definitions")
      .select("id, field_code, label_en, label_ar, field_type, is_required, is_ai_extractable, ai_field_hint, sort_order, options_json, validation_json, document_type_id")
      .eq("document_type_id", documentTypeId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("sort_order");

    if (error) return { success: false, error: error.message };

    return { success: true, data: (data ?? []) as DmsMetadataDefinitionRow[] };
  } catch (err) {
    console.error("getMetadataDefinitionsForType error", err);
    return { success: false, error: "Failed to load metadata definitions" };
  }
}

// ── getDmsDocumentMetadataValues ──────────────────────────────────────────────

export async function getDmsDocumentMetadataValues(
  documentId: number
): Promise<ActionResult<DmsMetadataValueRow[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.view") && !hasPermission(ctx, "dms.admin")) {
      return { success: false, error: "Permission denied" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("dms_document_metadata_values")
      .select(`
        id, document_id, definition_id, value_text, value_number, value_date, value_datetime, value_boolean, value_json,
        definition:dms_metadata_definitions(id, field_code, label_en, label_ar, field_type, is_required, is_ai_extractable, ai_field_hint, sort_order, options_json, validation_json, document_type_id)
      `)
      .eq("document_id", documentId)
      .is("deleted_at", null)
      .order("definition_id");

    if (error) return { success: false, error: error.message };

    return { success: true, data: (data ?? []) as unknown as DmsMetadataValueRow[] };
  } catch (err) {
    console.error("getDmsDocumentMetadataValues error", err);
    return { success: false, error: "Failed to load metadata values" };
  }
}

// ── saveDmsDocumentMetadataValues ─────────────────────────────────────────────

export async function saveDmsDocumentMetadataValues(
  documentId: number,
  values: DmsMetadataValueInput[]
): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.edit") && !hasPermission(ctx, "dms.admin")) {
      return { success: false, error: "Permission denied" };
    }

    const supabase = await createClient();

    const upserts = values.map((v) => ({
      document_id: documentId,
      definition_id: v.definition_id,
      value_text: v.value_text ?? null,
      value_number: v.value_number ?? null,
      value_date: v.value_date ?? null,
      value_datetime: v.value_datetime ?? null,
      value_boolean: v.value_boolean ?? null,
      value_json: v.value_json ?? null,
      updated_by: ctx.profile?.id ?? null,
      updated_at: new Date().toISOString(),
    }));

    if (upserts.length > 0) {
      const { error } = await supabase
        .from("dms_document_metadata_values")
        .upsert(upserts, { onConflict: "document_id,definition_id" });

      if (error) return { success: false, error: error.message };
    }

    // Insert event
    await supabase.from("dms_document_events").insert({
      document_id: documentId,
      event_type: "metadata_updated",
      description: `${values.length} metadata field(s) saved`,
      performed_by: ctx.profile?.id ?? null,
    });

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_document_metadata_values",
      entity_id: documentId,
      entity_reference: String(documentId),
      action: "update",
      new_values: { count: values.length },
    });

    revalidatePath(`/dms/documents/record/${documentId}`);

    return { success: true };
  } catch (err) {
    console.error("saveDmsDocumentMetadataValues error", err);
    return { success: false, error: "Failed to save metadata values" };
  }
}
