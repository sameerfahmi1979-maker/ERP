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

export type DmsDocumentCommentRow = {
  id: number;
  document_id: number;
  comment_text: string;
  created_by: number | null;
  created_at: string;
  updated_by: number | null;
  updated_at: string;
  deleted_at: string | null;
  author?: { display_name: string } | null;
};

const commentSchema = z.object({
  comment_text: z.string().min(1, "Comment cannot be empty").max(2000),
});

export async function getDmsDocumentComments(
  documentId: number
): Promise<ActionResult<DmsDocumentCommentRow[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.view") && !hasPermission(ctx, "dms.admin")) {
      return { success: false, error: "Permission denied" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("dms_document_comments")
      .select("id, document_id, comment_text, created_by, created_at, updated_by, updated_at, deleted_at, author:user_profiles!created_by(display_name)")
      .eq("document_id", documentId)
      .is("deleted_at", null)
      .order("created_at");

    if (error) return { success: false, error: error.message };

    return { success: true, data: (data ?? []) as unknown as DmsDocumentCommentRow[] };
  } catch (err) {
    console.error("getDmsDocumentComments error", err);
    return { success: false, error: "Failed to load comments" };
  }
}

export async function addDmsDocumentComment(
  documentId: number,
  commentText: string
): Promise<ActionResult<{ id: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.view") && !hasPermission(ctx, "dms.admin")) {
      return { success: false, error: "Permission denied" };
    }

    const parsed = commentSchema.safeParse({ comment_text: commentText });
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("dms_document_comments")
      .insert({
        document_id: documentId,
        comment_text: parsed.data.comment_text,
        created_by: ctx.profile?.id ?? null,
        updated_by: ctx.profile?.id ?? null,
      })
      .select("id")
      .single();

    if (error) return { success: false, error: error.message };

    await supabase.from("dms_document_events").insert({
      document_id: documentId,
      event_type: "comment_added",
      description: "Comment added",
      performed_by: ctx.profile?.id ?? null,
    });

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_document_comments",
      entity_id: documentId,
      entity_reference: String(documentId),
      action: "create",
    });

    revalidatePath(`/dms/documents/record/${documentId}`);

    return { success: true, data: { id: data.id } };
  } catch (err) {
    console.error("addDmsDocumentComment error", err);
    return { success: false, error: "Failed to add comment" };
  }
}

export async function updateDmsDocumentComment(
  commentId: number,
  commentText: string,
  documentId: number
): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.view") && !hasPermission(ctx, "dms.admin")) {
      return { success: false, error: "Permission denied" };
    }

    const parsed = commentSchema.safeParse({ comment_text: commentText });
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("dms_document_comments")
      .update({
        comment_text: parsed.data.comment_text,
        updated_by: ctx.profile?.id ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", commentId)
      .eq("created_by", ctx.profile?.id ?? -1)
      .is("deleted_at", null);

    if (error) return { success: false, error: error.message };

    await supabase.from("dms_document_events").insert({
      document_id: documentId,
      event_type: "comment_updated",
      description: "Comment updated",
      performed_by: ctx.profile?.id ?? null,
    });

    await logAudit({ module_code: "DMS", entity_name: "dms_document_comments", entity_id: commentId, entity_reference: String(commentId), action: "update" });

    revalidatePath(`/dms/documents/record/${documentId}`);

    return { success: true };
  } catch (err) {
    console.error("updateDmsDocumentComment error", err);
    return { success: false, error: "Failed to update comment" };
  }
}

export async function deleteDmsDocumentComment(
  commentId: number,
  documentId: number
): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.view") && !hasPermission(ctx, "dms.admin")) {
      return { success: false, error: "Permission denied" };
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("dms_document_comments")
      .update({
        deleted_at: new Date().toISOString(),
        updated_by: ctx.profile?.id ?? null,
      })
      .eq("id", commentId)
      .eq("created_by", ctx.profile?.id ?? -1)
      .is("deleted_at", null);

    if (error) return { success: false, error: error.message };

    await supabase.from("dms_document_events").insert({
      document_id: documentId,
      event_type: "comment_deleted",
      description: "Comment deleted",
      performed_by: ctx.profile?.id ?? null,
    });

    await logAudit({ module_code: "DMS", entity_name: "dms_document_comments", entity_id: commentId, entity_reference: String(commentId), action: "delete" });

    revalidatePath(`/dms/documents/record/${documentId}`);

    return { success: true };
  } catch (err) {
    console.error("deleteDmsDocumentComment error", err);
    return { success: false, error: "Failed to delete comment" };
  }
}
