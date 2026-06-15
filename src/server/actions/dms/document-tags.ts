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

export type DmsDocumentTagRow = {
  document_id: number;
  tag_id: number;
  created_at: string;
  tag?: {
    id: number;
    tag_code: string;
    tag_name: string;
    color_hex: string | null;
  } | null;
};

export async function getDmsDocumentTags(
  documentId: number
): Promise<ActionResult<DmsDocumentTagRow[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.view") && !hasPermission(ctx, "dms.admin")) {
      return { success: false, error: "Permission denied" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("dms_document_tags")
      .select("document_id, tag_id, created_at, tag:dms_tags(id, tag_code, tag_name, color_hex)")
      .eq("document_id", documentId);

    if (error) return { success: false, error: error.message };

    return { success: true, data: (data ?? []) as unknown as DmsDocumentTagRow[] };
  } catch (err) {
    console.error("getDmsDocumentTags error", err);
    return { success: false, error: "Failed to load tags" };
  }
}

export async function saveDmsDocumentTags(
  documentId: number,
  tagIds: number[]
): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (
      !hasPermission(ctx, "dms.documents.edit") &&
      !hasPermission(ctx, "dms.documents.manage_tags") &&
      !hasPermission(ctx, "dms.admin")
    ) {
      return { success: false, error: "Permission denied" };
    }

    const supabase = await createClient();

    // Remove all existing tags, then insert new set
    const { error: delError } = await supabase
      .from("dms_document_tags")
      .delete()
      .eq("document_id", documentId);

    if (delError) return { success: false, error: delError.message };

    if (tagIds.length > 0) {
      const inserts = tagIds.map((tag_id) => ({
        document_id: documentId,
        tag_id,
        created_by: ctx.profile?.id ?? null,
      }));

      const { error: insError } = await supabase.from("dms_document_tags").insert(inserts);
      if (insError) return { success: false, error: insError.message };
    }

    await supabase.from("dms_document_events").insert({
      document_id: documentId,
      event_type: "tags_updated",
      description: `Tags updated: ${tagIds.length} tag(s) assigned`,
      performed_by: ctx.profile?.id ?? null,
    });

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_document_tags",
      entity_id: documentId,
      entity_reference: String(documentId),
      action: "update",
      new_values: { tag_ids: tagIds },
    });

    revalidatePath(`/dms/documents/record/${documentId}`);

    return { success: true };
  } catch (err) {
    console.error("saveDmsDocumentTags error", err);
    return { success: false, error: "Failed to save tags" };
  }
}

export async function addDmsDocumentTag(
  documentId: number,
  tagId: number
): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (
      !hasPermission(ctx, "dms.documents.edit") &&
      !hasPermission(ctx, "dms.documents.manage_tags") &&
      !hasPermission(ctx, "dms.admin")
    ) {
      return { success: false, error: "Permission denied" };
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("dms_document_tags")
      .insert({ document_id: documentId, tag_id: tagId, created_by: ctx.profile?.id ?? null });

    if (error) return { success: false, error: error.message };

    revalidatePath(`/dms/documents/record/${documentId}`);

    return { success: true };
  } catch (err) {
    console.error("addDmsDocumentTag error", err);
    return { success: false, error: "Failed to add tag" };
  }
}

export async function removeDmsDocumentTag(
  documentId: number,
  tagId: number
): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (
      !hasPermission(ctx, "dms.documents.edit") &&
      !hasPermission(ctx, "dms.documents.manage_tags") &&
      !hasPermission(ctx, "dms.admin")
    ) {
      return { success: false, error: "Permission denied" };
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("dms_document_tags")
      .delete()
      .eq("document_id", documentId)
      .eq("tag_id", tagId);

    if (error) return { success: false, error: error.message };

    revalidatePath(`/dms/documents/record/${documentId}`);

    return { success: true };
  } catch (err) {
    console.error("removeDmsDocumentTag error", err);
    return { success: false, error: "Failed to remove tag" };
  }
}
