"use server";

import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import { z } from "zod";
import { DMS_ENTITY_TYPES } from "@/features/dms/documents/dms-document-constants";

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

    return { success: true, data: (data ?? []) as DmsDocumentLinkRow[] };
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
