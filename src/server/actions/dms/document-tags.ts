"use server";
import {readAllPages} from "@/server/reads/all-pages";

import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import { checkDocumentConfidentialityAccess } from "@/lib/dms/document-access";
import { z } from "zod";

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

const tagId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const tagChangesSchema = z.object({ documentId: tagId, add: z.array(tagId).max(1000), remove: z.array(tagId).max(1000) }).strict();

/** Apply only the reviewed tag changes. Replaying the same changes is safe
 * after a lost response and does not replace other assignments. */
export async function applyDmsDocumentTagChanges(input: unknown): Promise<ActionResult<DmsDocumentTagRow[]>> {
  const parsed = tagChangesSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid tag selection." };
  const { documentId } = parsed.data;
  const add = [...new Set(parsed.data.add)];
  const remove = [...new Set(parsed.data.remove)];
  if (remove.some(id => add.includes(id))) return { success: false, error: "The tag selection contains conflicting changes." };

  try {
    const context = await getAuthContext();
    const client = await createClient();
    const permissions = ["dms.documents.edit", "dms.documents.manage_tags", "dms.admin"]
      .filter(permission => hasPermission(context, permission));
    const access = await Promise.all(permissions.map(permission => checkDocumentConfidentialityAccess(client, documentId, context, permission)));
    if (!access.some(result => result.allowed)) return { success: false, error: "Permission denied" };

    // Verify all additions before making any write. Keep URL lists bounded.
    for (let offset = 0; offset < add.length; offset += 100) {
      const ids = add.slice(offset, offset + 100);
      const { data, error } = await client.from("dms_tags").select("id").in("id", ids).eq("is_active", true).is("deleted_at", null);
      if (error) return { success: false, error: "The selected tags could not be checked. Try saving again." };
      if (data?.length !== ids.length) return { success: false, error: "A selected tag is no longer available. Review the Tags section and try again." };
    }

    let changed = false;
    if (add.length > 0) {
      const { data, error } = await client.from("dms_document_tags").upsert(
        add.map(id => ({ document_id: documentId, tag_id: id, created_by: context.profile?.id ?? null })),
        { onConflict: "document_id,tag_id", ignoreDuplicates: true },
      ).select("tag_id");
      if (error) return { success: false, error: "Tag additions could not be saved. Try saving again." };
      changed = !!data?.length;
    }
    for (let offset = 0; offset < remove.length; offset += 100) {
      const ids = remove.slice(offset, offset + 100);
      const { data, error } = await client.from("dms_document_tags").delete().eq("document_id", documentId).in("tag_id", ids).select("tag_id");
      if (error) return { success: false, error: "Tag removals could not be confirmed. Try saving again." };
      changed ||= !!data?.length;
      const remaining = await client.from("dms_document_tags").select("tag_id").eq("document_id", documentId).in("tag_id", ids).limit(1);
      if (remaining.error || remaining.data?.length !== 0) return { success: false, error: "Tag removals could not be confirmed. Try saving again." };
    }

    if (changed) {
      await logAudit({
        module_code: "DMS", entity_name: "dms_document_tags", entity_id: documentId,
        entity_reference: String(documentId), action: "update", new_values: { added_tag_ids: add, removed_tag_ids: remove },
      });
      await client.from("dms_document_events").insert({
        document_id: documentId, event_type: "tags_updated", description: "Document tag changes saved",
        performed_by: context.profile?.id ?? null,
      });
    }
    revalidatePath(`/dms/documents/record/${documentId}`);
    const saved = await getDmsDocumentTags(documentId);
    const savedIds = new Set(saved.data?.map(row => row.tag_id));
    if (!saved.success || add.some(id => !savedIds.has(id)) || remove.some(id => savedIds.has(id))) {
      return { success: false, error: "Tag changes could not be confirmed. Try saving again." };
    }
    return saved;
  } catch (error) {
    logger.error("applyDmsDocumentTagChanges failed", error);
    return { success: false, error: "Tag changes could not be confirmed. Try saving again." };
  }
}

export async function getDmsDocumentTags(
  documentId: number
): Promise<ActionResult<DmsDocumentTagRow[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.view") && !hasPermission(ctx, "dms.admin")) {
      return { success: false, error: "Permission denied" };
    }

    const supabase = await createClient();
    const data=await readAllPages(async(from,to)=>await supabase
      .from("dms_document_tags")
      .select("document_id, tag_id, created_at, tag:dms_tags(id, tag_code, tag_name, color_hex)",{count:"exact"})
      .eq("document_id", documentId).order("tag_id").range(from,to),{identity:row=>row.tag_id,maxRows:10000});

    return { success: true, data: (data ?? []) as unknown as DmsDocumentTagRow[] };
  } catch (err) {
    logger.error("getDmsDocumentTags error", err);
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
    logger.error("saveDmsDocumentTags error", err);
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
    logger.error("addDmsDocumentTag error", err);
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
    logger.error("removeDmsDocumentTag error", err);
    return { success: false, error: "Failed to remove tag" };
  }
}
