"use server";

import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import { z } from "zod";
import { DMS_ENTITY_TYPES } from "@/features/dms/documents/dms-document-constants";
import {
  formatDmsLinkEntityFallback,
  resolveDmsLinkEntityDisplayNames,
} from "@/lib/dms/resolve-link-entity-display-name";
import {
  searchDmsLinkEntityOptionsForType,
  type DmsLinkEntityOption,
} from "@/lib/dms/search-link-entity-options";
import { getDmsEntityTypeLabel } from "@/lib/dms/dms-entity-types";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

export type DmsDocumentLinkRow = {
  id: number;
  document_id: number;
  entity_type: string;
  entity_id: number;
  entity_type_label: string;
  entity_display_name: string;
  link_role: string | null;
  is_primary: boolean;
  notes: string | null;
  linked_at: string;
  created_at: string;
};

const addLinkSchema = z.object({
  entity_type: z.enum(DMS_ENTITY_TYPES),
  entity_id: z.number().int().positive("Entity ID must be a positive number"),
  link_role: z.string().max(100).nullable().optional(),
  is_primary: z.boolean().default(false),
  notes: z.string().max(500).nullable().optional(),
});

export type AddDmsDocumentLinkInput = z.infer<typeof addLinkSchema>;

export type UpdateDmsDocumentLinkInput = AddDmsDocumentLinkInput;

export async function searchDmsLinkEntityOptions(
  entityType: string,
  search?: string,
  limit = 50
): Promise<ActionResult<DmsLinkEntityOption[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.view") && !hasPermission(ctx, "dms.admin")) {
      return { success: false, error: "Permission denied" };
    }

    if (!DMS_ENTITY_TYPES.includes(entityType as (typeof DMS_ENTITY_TYPES)[number])) {
      return { success: false, error: "Invalid entity type" };
    }

    const supabase = await createClient();
    const options = await searchDmsLinkEntityOptionsForType(
      supabase,
      entityType,
      search,
      limit
    );
    return { success: true, data: options };
  } catch (err) {
    logger.error("searchDmsLinkEntityOptions error", err);
    return { success: false, error: "Failed to search entities" };
  }
}

export async function getDmsDocumentLinks(
  documentId: number
): Promise<ActionResult<DmsDocumentLinkRow[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.view") && !hasPermission(ctx, "dms.admin")) {
      return { success: false, error: "Permission denied" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("dms_document_links")
      .select("id, document_id, entity_type, entity_id, link_role, is_primary, notes, linked_at, created_at")
      .eq("document_id", documentId)
      .is("deleted_at", null)
      .order("linked_at");

    if (error) return { success: false, error: error.message };

    const rows = (data ?? []) as Omit<
      DmsDocumentLinkRow,
      "entity_type_label" | "entity_display_name"
    >[];
    const displayNameMap = await resolveDmsLinkEntityDisplayNames(
      supabase,
      rows.map((r) => ({ entity_type: r.entity_type, entity_id: r.entity_id }))
    );

    const enriched: DmsDocumentLinkRow[] = rows.map((row) => {
      const key = `${row.entity_type}:${row.entity_id}`;
      return {
        ...row,
        entity_type_label: getDmsEntityTypeLabel(row.entity_type),
        entity_display_name:
          displayNameMap.get(key) ??
          formatDmsLinkEntityFallback(row.entity_type, row.entity_id),
      };
    });

    return { success: true, data: enriched };
  } catch (err) {
    logger.error("getDmsDocumentLinks error", err);
    return { success: false, error: "Failed to load links" };
  }
}

export async function addDmsDocumentLink(
  documentId: number,
  input: AddDmsDocumentLinkInput
): Promise<ActionResult<{ id: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.edit") && !hasPermission(ctx, "dms.admin")) {
      return { success: false, error: "Permission denied" };
    }

    const parsed = addLinkSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("dms_document_links")
      .insert({
        document_id: documentId,
        entity_type: parsed.data.entity_type,
        entity_id: parsed.data.entity_id,
        link_role: parsed.data.link_role ?? null,
        is_primary: parsed.data.is_primary,
        notes: parsed.data.notes ?? null,
        linked_by: ctx.profile?.id ?? null,
      })
      .select("id")
      .single();

    if (error) return { success: false, error: error.message };

    await supabase.from("dms_document_events").insert({
      document_id: documentId,
      event_type: "link_added",
      description: `Link added: ${parsed.data.entity_type} #${parsed.data.entity_id}`,
      performed_by: ctx.profile?.id ?? null,
    });

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_document_links",
      entity_id: documentId,
      entity_reference: String(documentId),
      action: "create",
      new_values: { entity_type: parsed.data.entity_type, entity_id: parsed.data.entity_id },
    });

    revalidatePath(`/dms/documents/record/${documentId}`);

    return { success: true, data: { id: data.id } };
  } catch (err) {
    logger.error("addDmsDocumentLink error", err);
    return { success: false, error: "Failed to add link" };
  }
}

export async function updateDmsDocumentLink(
  linkId: number,
  documentId: number,
  input: UpdateDmsDocumentLinkInput
): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.edit") && !hasPermission(ctx, "dms.admin")) {
      return { success: false, error: "Permission denied" };
    }

    const parsed = addLinkSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
    }

    const supabase = await createClient();

    const { data: existing, error: fetchError } = await supabase
      .from("dms_document_links")
      .select("id, document_id, entity_type, entity_id")
      .eq("id", linkId)
      .eq("document_id", documentId)
      .is("deleted_at", null)
      .maybeSingle();

    if (fetchError) return { success: false, error: fetchError.message };
    if (!existing) return { success: false, error: "Link not found" };

    const { error } = await supabase
      .from("dms_document_links")
      .update({
        entity_type: parsed.data.entity_type,
        entity_id: parsed.data.entity_id,
        link_role: parsed.data.link_role ?? null,
        is_primary: parsed.data.is_primary,
        notes: parsed.data.notes ?? null,
      })
      .eq("id", linkId)
      .is("deleted_at", null);

    if (error) {
      if (error.code === "23505") {
        return { success: false, error: "This entity is already linked to the document" };
      }
      return { success: false, error: error.message };
    }

    await supabase.from("dms_document_events").insert({
      document_id: documentId,
      event_type: "link_updated",
      description: `Link updated: ${parsed.data.entity_type} #${parsed.data.entity_id}`,
      performed_by: ctx.profile?.id ?? null,
    });

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_document_links",
      entity_id: linkId,
      entity_reference: String(linkId),
      action: "update",
      old_values: {
        entity_type: existing.entity_type,
        entity_id: existing.entity_id,
      },
      new_values: {
        entity_type: parsed.data.entity_type,
        entity_id: parsed.data.entity_id,
        link_role: parsed.data.link_role ?? null,
        is_primary: parsed.data.is_primary,
      },
    });

    revalidatePath(`/dms/documents/record/${documentId}`);

    return { success: true };
  } catch (err) {
    logger.error("updateDmsDocumentLink error", err);
    return { success: false, error: "Failed to update link" };
  }
}

export async function removeDmsDocumentLink(
  linkId: number,
  documentId: number
): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.edit") && !hasPermission(ctx, "dms.admin")) {
      return { success: false, error: "Permission denied" };
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("dms_document_links")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", linkId)
      .is("deleted_at", null);

    if (error) return { success: false, error: error.message };

    await supabase.from("dms_document_events").insert({
      document_id: documentId,
      event_type: "link_removed",
      description: `Link #${linkId} removed`,
      performed_by: ctx.profile?.id ?? null,
    });

    await logAudit({ module_code: "DMS", entity_name: "dms_document_links", entity_id: linkId, entity_reference: String(linkId), action: "delete" });

    revalidatePath(`/dms/documents/record/${documentId}`);

    return { success: true };
  } catch (err) {
    logger.error("removeDmsDocumentLink error", err);
    return { success: false, error: "Failed to remove link" };
  }
}
