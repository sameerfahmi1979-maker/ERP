"use server";

import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import {
  DMS_METADATA_DEFINITION_SELECT,
  filterMetadataDefinitionsByContext,
  mapMetadataDefinitionRow,
  type DmsMetadataDefinitionBase,
} from "@/lib/dms/metadata/metadata-definition-shared";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

export type DmsMetadataDefinitionRow = DmsMetadataDefinitionBase;

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
  documentTypeId: number,
  context: "all" | "intake" = "intake"
): Promise<ActionResult<DmsMetadataDefinitionRow[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.view") && !hasPermission(ctx, "dms.admin")) {
      return { success: false, error: "Permission denied" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("dms_metadata_definitions")
      .select(DMS_METADATA_DEFINITION_SELECT)
      .eq("document_type_id", documentTypeId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("sort_order");

    if (error) return { success: false, error: error.message };

    const mapped = (data ?? []).map((row) =>
      mapMetadataDefinitionRow(row as Record<string, unknown>)
    );
    const filtered = filterMetadataDefinitionsByContext(mapped, context === "intake" ? "intake" : "all");

    return { success: true, data: filtered };
  } catch (err) {
    logger.error("getMetadataDefinitionsForType error", err);
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
        definition:dms_metadata_definitions(${DMS_METADATA_DEFINITION_SELECT})
      `)
      .eq("document_id", documentId)
      .is("deleted_at", null)
      .order("definition_id");

    if (error) return { success: false, error: error.message };

    const rows = (data ?? []).map((row) => {
      const defRaw = (row as { definition: Record<string, unknown> | Record<string, unknown>[] | null }).definition;
      const defObj = Array.isArray(defRaw) ? defRaw[0] : defRaw;
      return {
        ...(row as Omit<DmsMetadataValueRow, "definition">),
        definition: defObj ? mapMetadataDefinitionRow(defObj) : null,
      };
    });

    return { success: true, data: rows as DmsMetadataValueRow[] };
  } catch (err) {
    logger.error("getDmsDocumentMetadataValues error", err);
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
    logger.error("saveDmsDocumentMetadataValues error", err);
    return { success: false, error: "Failed to save metadata values" };
  }
}
