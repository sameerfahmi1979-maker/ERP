"use client";
import type {DmsTagSuggestionRow} from "@/server/actions/dms/ai-tags";
import {DmsLoadError} from "@/features/dms/dms-load-error";
import {readDmsSection} from "@/features/dms/documents/section-read";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {useDmsSectionQuery as useQuery} from "@/features/dms/documents/section-activity";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, X, Tag, Sparkles, Check, AlertCircle } from "lucide-react";
import { DmsAddTagsDialog } from "./dms-add-tags-dialog";
import type { DmsCatalogueTag } from "@/server/reads/dms-tag-catalogue";

import { queryKeys } from "@/lib/query/query-keys";
import { suggestDmsDocumentTags, applyDmsTagSuggestions, rejectDmsTagSuggestions, createAndApplyDmsTagSuggestion } from "@/server/actions/dms/ai-tags";

interface DmsDocumentTagsSectionProps {
  documentId: number | null;
  isViewing: boolean;
  changes: DmsTagChanges;
  onChange: (changes: DmsTagChanges) => void;
  onPickerOpenChange: (open: boolean) => void;
  isSaving: boolean;
}

export type DmsTagChanges = { added: DmsCatalogueTag[]; removed: number[] };

export function DmsDocumentTagsSection({ documentId, isViewing, changes, onChange, onPickerOpenChange, isSaving }: DmsDocumentTagsSectionProps) {
  const qc = useQueryClient();
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [applyingIds, setApplyingIds] = useState<number[]>([]);
  const [rejectingIds, setRejectingIds] = useState<number[]>([]);

  // WORKSPACE.PERF.1 UAT fix: interval-polled queries must use plain GET
  // fetches, NOT server actions — an in-flight server action reverts any
  // router.push made while it's pending (the "tab snaps back" bug family).
  const { data: docTags = [], isLoading: loadingDocTags, isError: docTagsError, refetch: retryDocTags } = useQuery({
    queryKey: queryKeys.dms.documentTags(documentId ?? 0),
    queryFn: async ({signal}) => {
      if(!documentId)return [];
      const r=await readDmsSection("getDmsDocumentTags",[documentId],signal);
      if(!r.success||!r.data)throw new Error("Document tags unavailable");
      return r.data;
    },
    enabled: !!documentId,
    staleTime: 30 * 1000,
    // The AI intake pipeline applies tags asynchronously (up to several minutes
    // after document creation). Workspace tabs keep this section mounted, so a
    // one-time fetch of 0 rows would otherwise display "0 tags" forever.
    // Poll while empty (max ~10 min), stop as soon as tags arrive.
    refetchInterval: (query) => {
      if (query.state.status === "error") return false;
      if ((query.state.data?.length ?? 0) > 0) return false;
      if (query.state.dataUpdateCount > 40) return false;
      return 15 * 1000;
    },
  });

  const { data: tagSuggestions = [], refetch: refetchSuggestions, isError: suggestionsError } = useQuery({
    queryKey: queryKeys.dms.documentTagSuggestions(documentId ?? 0),
    queryFn: async ({signal}) => {
      if(!documentId)return [];
      const r=await readDmsSection("getDmsTagSuggestions",[documentId],signal);
      if(!r.success||!r.data)throw new Error("Document tags unavailable");
      return r.data;
    },
    enabled: !!documentId,
    staleTime: 30 * 1000,
    // Same async-pipeline race as docTags above: suggestions are written by the
    // background AI worker after the section may already be mounted.
    refetchInterval: (query) => {
      if (query.state.status === "error") return false;
      if ((query.state.data?.length ?? 0) > 0) return false;
      if (query.state.dataUpdateCount > 40) return false;
      return 15 * 1000;
    },
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

  async function handleApplySuggestion(suggestion: DmsTagSuggestionRow) {
    if (!documentId) return;
    setApplyingIds((prev) => [...prev, suggestion.id]);
    try {
      // "New" suggestions (tagId = null) need tag creation first
      const r = suggestion.tagId === null
        ? await createAndApplyDmsTagSuggestion(documentId, suggestion.id)
        : await applyDmsTagSuggestions(documentId, [suggestion.id]);

      if (r.success) {
        toast.success(
          suggestion.tagId === null
            ? `Tag "${suggestion.suggestedTagName}" created and applied`
            : "Tag applied"
        );
        await refetchSuggestions();
        qc.invalidateQueries({ queryKey: queryKeys.dms.documentTags(documentId) });
      } else {
        toast.error(r.error ?? "Failed to apply suggestion");
      }
    } finally {
      setApplyingIds((prev) => prev.filter((id) => id !== suggestion.id));
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

  const savedTags = new Map(docTags.map(row => [row.tag_id, row.tag?.tag_name ?? "Unavailable tag"]));
  const visibleTags = new Map([...savedTags, ...changes.added.map(tag => [tag.id, tag.tag_name] as const)]);
  for (const id of changes.removed) visibleTags.delete(id);

  function handleAddTags(tags: DmsCatalogueTag[]) {
    const ids = new Set(tags.map(tag => tag.id));
    onChange({
      added: [...changes.added, ...tags.filter(tag => !savedTags.has(tag.id) && !visibleTags.has(tag.id))],
      removed: changes.removed.filter(id => !ids.has(id)),
    });
  }

  function handleRemoveTag(id: number) {
    onChange({
      added: changes.added.filter(tag => tag.id !== id),
      removed: savedTags.has(id) ? [...changes.removed, id] : changes.removed,
    });
  }

  if (!documentId) {
    return (
      <div className="text-sm text-muted-foreground py-6 text-center">
        Save the document first to assign tags.
      </div>
    );
  }

  if (loadingDocTags) {
    return (
      <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading tags...
      </div>
    );
  }

  if(docTagsError) return <DmsLoadError subject="document tags" retry={retryDocTags} />;

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Tags ({visibleTags.size})</h3>
          {!isViewing && <DmsAddTagsDialog assignedIds={new Set(visibleTags.keys())} onAdd={handleAddTags}
            onOpenChange={onPickerOpenChange} disabled={isSaving} />}
        </div>

        <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 rounded-md border border-border bg-muted/20">
          {visibleTags.size === 0 && (
            <span className="text-xs text-muted-foreground">No tags assigned</span>
          )}
          {Array.from(visibleTags, ([tagId, name]) => {
            return (
              <Badge
                key={tagId}
                variant="outline"
                className="text-xs gap-1 pr-1"
              >
                {name}
                {!isViewing && (
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tagId)}
                    aria-label={`Remove ${name}`}
                    disabled={isSaving}
                    className="hover:opacity-70 ml-0.5"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                )}
              </Badge>
            );
          })}
        </div>
        {!isViewing && (changes.added.length > 0 || changes.removed.length > 0) &&
          <p className="mt-2 text-xs text-muted-foreground">Tag changes will be applied when you save the document.</p>}
      </div>

      {!isViewing && (
        <>
          {/* AI Tag Suggestions */}
          <div className="border-t border-border pt-4 space-y-3">
            {suggestionsError && <DmsLoadError subject="tag suggestions" retry={refetchSuggestions} />}
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
                      <Button aria-label={s.tagId === null ? "Create tag and apply" : "Accept"}
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                        onClick={() => handleApplySuggestion(s)}
                        disabled={applyingIds.includes(s.id) || rejectingIds.includes(s.id)}
                        title={s.tagId === null ? "Create tag and apply" : "Accept"}
                      >
                        {applyingIds.includes(s.id) ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                      </Button>
                      <Button aria-label="Reject"
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
                  <div className="flex items-start gap-1.5 text-[10px] text-blue-700 dark:text-blue-400">
                    <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                    Suggestions marked &quot;New&quot; will create the tag in the library and apply it when you click ✓.
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
