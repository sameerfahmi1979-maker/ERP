"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { Loader2, Send, Trash2, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getDmsDocumentComments, addDmsDocumentComment, deleteDmsDocumentComment } from "@/server/actions/dms/document-comments";
import { queryKeys } from "@/lib/query/query-keys";

interface DmsDocumentCommentsSectionProps {
  documentId: number | null;
  currentUserId?: number | null;
}

export function DmsDocumentCommentsSection({ documentId, currentUserId }: DmsDocumentCommentsSectionProps) {
  const qc = useQueryClient();
  const [newComment, setNewComment] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: comments = [], isLoading } = useQuery({
    queryKey: queryKeys.dms.documentComments(documentId ?? 0),
    queryFn: async () => {
      if (!documentId) return [];
      const r = await getDmsDocumentComments(documentId);
      return r.data ?? [];
    },
    enabled: !!documentId,
    staleTime: 15 * 1000,
  });

  async function handleAddComment() {
    if (!documentId || !newComment.trim()) return;
    setSaving(true);
    try {
      const result = await addDmsDocumentComment(documentId, newComment.trim());
      if (result.success) {
        setNewComment("");
        qc.invalidateQueries({ queryKey: queryKeys.dms.documentComments(documentId) });
      } else {
        toast.error(result.error ?? "Failed to add comment");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(commentId: number) {
    if (!documentId) return;
    const result = await deleteDmsDocumentComment(commentId, documentId);
    if (result.success) {
      qc.invalidateQueries({ queryKey: queryKeys.dms.documentComments(documentId) });
    } else {
      toast.error(result.error ?? "Failed to delete comment");
    }
  }

  if (!documentId) {
    return (
      <div className="text-sm text-muted-foreground py-6 text-center">
        Save the document first to add comments.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading comments...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {comments.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
          <MessageSquare className="h-6 w-6 opacity-40" />
          <p className="text-sm">No comments yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {comments.map((c) => (
            <div key={c.id} className="flex gap-3 group">
              <div className="flex-1 rounded-md border border-border p-3 bg-muted/10">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <p className="text-[11px] font-medium">
                      {(c.author as { display_name?: string } | null)?.display_name ?? `User #${c.created_by}`}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {format(parseISO(c.created_at), "dd MMM yyyy HH:mm")}
                      {c.updated_at !== c.created_at && " · edited"}
                    </p>
                  </div>
                  {c.created_by === currentUserId && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-5 w-5 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive transition-opacity"
                      onClick={() => handleDelete(c.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                <p className="text-sm mt-2 whitespace-pre-wrap">{c.comment_text}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2 pt-2 border-t border-border">
        <Textarea
          placeholder="Add a comment..."
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          rows={2}
          className="text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.ctrlKey) handleAddComment();
          }}
        />
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">Ctrl+Enter to submit</span>
          <Button size="sm" onClick={handleAddComment} disabled={saving || !newComment.trim()} className="gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Comment
          </Button>
        </div>
      </div>
    </div>
  );
}
