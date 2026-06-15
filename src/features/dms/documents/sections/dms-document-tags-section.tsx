"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, X, Tag, Sparkles, Check, AlertCircle } from "lucide-react";
import { getDmsDocumentTags, saveDmsDocumentTags } from "@/server/actions/dms/document-tags";
import { getDmsTags } from "@/server/actions/dms/tags";
import { queryKeys } from "@/lib/query/query-keys";
import {
  suggestDmsDocumentTags,
  getDmsTagSuggestions,
  applyDmsTagSuggestions,
  rejectDmsTagSuggestions,
  type DmsTagSuggestionRow,
} from "@/server/actions/dms/ai-tags";

interface DmsDocumentTagsSectionProps {
  documentId: number | null;
  isViewing: boolean;
}

export function DmsDocumentTagsSection({ documentId, isViewing }: DmsDocumentTagsSectionProps) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [pendingTagIds, setPendingTagIds] = useState<number[] | null>(null);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [applyingIds, setApplyingIds] = useState<number[]>([]);
  const [rejectingIds, setRejectingIds] = useState<number[]>([]);

  const { data: docTags = [], isLoading: loadingDocTags } = useQuery({
    queryKey: queryKeys.dms.documentTags(documentId ?? 0),
    queryFn: async () => {
      if (!documentId) return [];
      const r = await getDmsDocumentTags(documentId);
      return r.data ?? [];
    },
    enabled: !!documentId,
    staleTime: 30 * 1000,
  });

  const { data: allTags = [], isLoading: loadingAllTags } = useQuery({
    queryKey: queryKeys.dms.tags(),
    queryFn: async () => {
      const r = await getDmsTags();
      return r.data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: tagSuggestions = [], refetch: refetchSuggestions } = useQuery({
    queryKey: queryKeys.dms.documentTagSuggestions(documentId ?? 0),
    queryFn: async () => {
      if (!documentId) return [];
      const r = await getDmsTagSuggestions(documentId);
      return r.data ?? [];
    },
    enabled: !!documentId,
    staleTime: 30 * 1000,
  });

  const pendingSuggestions = tagSuggestions.filter((s) => s.status === "pending");

  async function handleSuggestTags() {
    if (!documentId) return;
    setSuggestLoading(true);
    try {
      const r = await suggestDmsDocumentTags(documentId);
      if (r.success) {
        await refetchSuggestions();
        toast.success(
          r.data?.length
            ? `${r.data.length} AI tag suggestions generated`
            : "No new suggestions"
        );
      } else {
        toast.error(r.error ?? "Failed to generate suggestions");
      }
    } finally {
      setSuggestLoading(false);
    }
  }

  async function handleApplySuggestion(suggestionId: number) {
    if (!documentId) return;
    setApplyingIds((prev) => [...prev, suggestionId]);
    try {
      const r = await applyDmsTagSuggestions(documentId, [suggestionId]);
      if (r.success) {
        toast.success("Tag applied");
        await refetchSuggestions();
        qc.invalidateQueries({ queryKey: queryKeys.dms.documentTags(documentId) });
      } else {
        toast.error(r.error ?? "Failed to apply suggestion");
      }
    } finally {
      setApplyingIds((prev) => prev.filter((id) => id !== suggestionId));
    }
  }

  async function handleRejectSuggestion(suggestionId: number) {
    if (!documentId) return;
    setRejectingIds((prev) => [...prev, suggestionId]);
    try {
      const r = await rejectDmsTagSuggestions(documentId, [suggestionId]);
      if (r.success) {
        toast.success("Suggestion rejected");
        await refetchSuggestions();
      } else {
        toast.error(r.error ?? "Failed to reject suggestion");
      }
    } finally {
      setRejectingIds((prev) => prev.filter((id) => id !== suggestionId));
    }
  }

  const currentTagIds = pendingTagIds ?? docTags.map((t) => t.tag_id);

  async function handleToggleTag(tagId: number) {
    const newIds = currentTagIds.includes(tagId)
      ? currentTagIds.filter((id) => id !== tagId)
      : [...currentTagIds, tagId];
    setPendingTagIds(newIds);
  }

  async function handleSaveTags() {
    if (!documentId || pendingTagIds === null) return;
    setSaving(true);
    try {
      const result = await saveDmsDocumentTags(documentId, pendingTagIds);
      if (result.success) {
        toast.success("Tags saved");
        setPendingTagIds(null);
        qc.invalidateQueries({ queryKey: queryKeys.dms.documentTags(documentId) });
      } else {
        toast.error(result.error ?? "Failed to save tags");
      }
    } finally {
      setSaving(false);
    }
  }

  if (!documentId) {
    return (
      <div className="text-sm text-muted-foreground py-6 text-center">
        Save the document first to assign tags.
      </div>
    );
  }

  if (loadingDocTags || loadingAllTags) {
    return (
      <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading tags...
      </div>
    );
  }

  const activeTags = allTags.filter((t) => t.is_active && !t.deleted_at);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-muted-foreground mb-2">
          Currently assigned: {currentTagIds.length} tag{currentTagIds.length !== 1 ? "s" : ""}
        </p>

        <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 rounded-md border border-border bg-muted/20">
          {currentTagIds.length === 0 && (
            <span className="text-xs text-muted-foreground">No tags assigned</span>
          )}
          {currentTagIds.map((tagId) => {
            const tag = activeTags.find((t) => t.id === tagId);
            if (!tag) return null;
            return (
              <Badge
                key={tagId}
                variant="outline"
                className="text-xs gap-1 pr-1"
                style={tag.color_hex ? { borderColor: tag.color_hex, color: tag.color_hex } : undefined}
              >
                {tag.tag_name}
                {!isViewing && (
                  <button
                    type="button"
                    onClick={() => handleToggleTag(tagId)}
                    className="hover:opacity-70 ml-0.5"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                )}
              </Badge>
            );
          })}
        </div>
      </div>

      {!isViewing && (
        <>
          <div>
            <p className="text-xs font-medium mb-2">Available Tags</p>
            <div className="flex flex-wrap gap-1.5">
              {activeTags.map((tag) => {
                const isSelected = currentTagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => handleToggleTag(tag.id)}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition-all"
                    style={
                      isSelected && tag.color_hex
                        ? { backgroundColor: tag.color_hex + "20", borderColor: tag.color_hex, color: tag.color_hex }
                        : tag.color_hex
                        ? { borderColor: tag.color_hex + "60", color: "inherit" }
                        : undefined
                    }
                  >
                    <Tag className="h-2.5 w-2.5" />
                    {tag.tag_name}
                    {isSelected && <X className="h-2.5 w-2.5 ml-0.5" />}
                  </button>
                );
              })}
            </div>
          </div>

          {pendingTagIds !== null && (
            <div className="flex items-center gap-2 pt-2 border-t border-border">
              <Button size="sm" onClick={handleSaveTags} disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Save Tags
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPendingTagIds(null)} disabled={saving}>
                Cancel
              </Button>
            </div>
          )}

          {/* AI Tag Suggestions */}
          <div className="border-t border-border pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-purple-500" />
                <span className="text-xs font-medium">AI Tag Suggestions</span>
                {pendingSuggestions.length > 0 && (
                  <Badge variant="outline" className="text-[9px] px-1 py-0 text-purple-600 border-purple-300">
                    {pendingSuggestions.length} pending
                  </Badge>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleSuggestTags}
                disabled={suggestLoading}
                className="h-7 text-xs gap-1"
              >
                {suggestLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3 text-purple-500" />
                )}
                Suggest Tags
              </Button>
            </div>

            {pendingSuggestions.length > 0 && (
              <div className="space-y-1.5">
                {pendingSuggestions.map((s: DmsTagSuggestionRow) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-2.5 py-1.5"
                  >
                    <Tag className="h-3 w-3 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium">{s.suggestedTagName}</span>
                      {s.reason && (
                        <p className="text-[10px] text-muted-foreground truncate">{s.reason}</p>
                      )}
                    </div>
                    {s.confidence !== null && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">
                        {Math.round(s.confidence * 100)}%
                      </Badge>
                    )}
                    {s.tagId === null && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 text-amber-600 border-amber-300 shrink-0">
                        New
                      </Badge>
                    )}
                    <div className="flex gap-1 shrink-0">
                      {s.tagId !== null && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                          onClick={() => handleApplySuggestion(s.id)}
                          disabled={applyingIds.includes(s.id) || rejectingIds.includes(s.id)}
                          title="Accept"
                        >
                          {applyingIds.includes(s.id) ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Check className="h-3 w-3" />
                          )}
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleRejectSuggestion(s.id)}
                        disabled={applyingIds.includes(s.id) || rejectingIds.includes(s.id)}
                        title="Reject"
                      >
                        {rejectingIds.includes(s.id) ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <X className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
                {pendingSuggestions.some((s: DmsTagSuggestionRow) => s.tagId === null) && (
                  <div className="flex items-start gap-1.5 text-[10px] text-amber-700 dark:text-amber-400">
                    <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                    Suggestions marked "New" are not yet in the tag library and cannot be auto-applied.
                    A DMS admin can create them first.
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
