"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { Plus, Trash2, Loader2, Link2, Sparkles, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getDmsDocumentLinks, addDmsDocumentLink, removeDmsDocumentLink } from "@/server/actions/dms/document-links";
import { queryKeys } from "@/lib/query/query-keys";
import { DMS_ENTITY_TYPES, DMS_ENTITY_TYPE_LABELS } from "../dms-document-constants";
import {
  suggestDmsDocumentLinks,
  getDmsLinkSuggestions,
  applyDmsLinkSuggestions,
  rejectDmsLinkSuggestions,
  type DmsLinkSuggestionRow,
} from "@/server/actions/dms/ai-links";

interface DmsDocumentLinksSectionProps {
  documentId: number | null;
  isViewing: boolean;
}

export function DmsDocumentLinksSection({ documentId, isViewing }: DmsDocumentLinksSectionProps) {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [entityType, setEntityType] = useState<string>(DMS_ENTITY_TYPES[0]);
  const [entityId, setEntityId] = useState("");
  const [linkRole, setLinkRole] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [applyingIds, setApplyingIds] = useState<number[]>([]);
  const [rejectingIds, setRejectingIds] = useState<number[]>([]);

  const { data: links = [], isLoading } = useQuery({
    queryKey: queryKeys.dms.documentLinks(documentId ?? 0),
    queryFn: async () => {
      if (!documentId) return [];
      const r = await getDmsDocumentLinks(documentId);
      return r.data ?? [];
    },
    enabled: !!documentId,
    staleTime: 30 * 1000,
  });

  const { data: linkSuggestions = [], refetch: refetchLinkSuggestions } = useQuery({
    queryKey: queryKeys.dms.documentLinkSuggestions(documentId ?? 0),
    queryFn: async () => {
      if (!documentId) return [];
      const r = await getDmsLinkSuggestions(documentId);
      return r.data ?? [];
    },
    enabled: !!documentId,
    staleTime: 30 * 1000,
  });

  const pendingLinkSuggestions = linkSuggestions.filter((s) => s.status === "pending");

  async function handleSuggestLinks() {
    if (!documentId) return;
    setSuggestLoading(true);
    try {
      const r = await suggestDmsDocumentLinks(documentId);
      if (r.success) {
        await refetchLinkSuggestions();
        toast.success(
          r.data?.length
            ? `${r.data.length} AI link suggestions generated`
            : "No new suggestions"
        );
      } else {
        toast.error(r.error ?? "Failed to generate suggestions");
      }
    } finally {
      setSuggestLoading(false);
    }
  }

  async function handleApplyLinkSuggestion(suggestionId: number) {
    if (!documentId) return;
    setApplyingIds((prev) => [...prev, suggestionId]);
    try {
      const r = await applyDmsLinkSuggestions(documentId, [suggestionId]);
      if (r.success) {
        toast.success("Link applied");
        await refetchLinkSuggestions();
        qc.invalidateQueries({ queryKey: queryKeys.dms.documentLinks(documentId) });
      } else {
        toast.error(r.error ?? "Failed to apply suggestion");
      }
    } finally {
      setApplyingIds((prev) => prev.filter((id) => id !== suggestionId));
    }
  }

  async function handleRejectLinkSuggestion(suggestionId: number) {
    if (!documentId) return;
    setRejectingIds((prev) => [...prev, suggestionId]);
    try {
      const r = await rejectDmsLinkSuggestions(documentId, [suggestionId]);
      if (r.success) {
        toast.success("Suggestion rejected");
        await refetchLinkSuggestions();
      } else {
        toast.error(r.error ?? "Failed to reject suggestion");
      }
    } finally {
      setRejectingIds((prev) => prev.filter((id) => id !== suggestionId));
    }
  }

  async function handleAdd() {
    if (!documentId) return;
    const id = parseInt(entityId, 10);
    if (isNaN(id) || id <= 0) {
      toast.error("Please enter a valid entity ID");
      return;
    }
    setAdding(true);
    try {
      const result = await addDmsDocumentLink(documentId, {
        entity_type: entityType as typeof DMS_ENTITY_TYPES[number],
        entity_id: id,
        link_role: linkRole || null,
        is_primary: isPrimary,
      });
      if (result.success) {
        toast.success("Link added");
        setShowAdd(false);
        setEntityId("");
        setLinkRole("");
        setIsPrimary(false);
        qc.invalidateQueries({ queryKey: queryKeys.dms.documentLinks(documentId) });
      } else {
        toast.error(result.error ?? "Failed to add link");
      }
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(linkId: number) {
    if (!documentId) return;
    const result = await removeDmsDocumentLink(linkId, documentId);
    if (result.success) {
      toast.success("Link removed");
      qc.invalidateQueries({ queryKey: queryKeys.dms.documentLinks(documentId) });
    } else {
      toast.error(result.error ?? "Failed to remove link");
    }
  }

  if (!documentId) {
    return (
      <div className="text-sm text-muted-foreground py-6 text-center">
        Save the document first to manage links.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading links...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {links.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
          <Link2 className="h-6 w-6 opacity-40" />
          <p className="text-sm">No entity links yet</p>
        </div>
      ) : (
        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Entity Type</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Entity ID</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Role</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Primary</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Linked</th>
                {!isViewing && <th className="px-3 py-2 w-[50px]" />}
              </tr>
            </thead>
            <tbody>
              {links.map((link) => (
                <tr key={link.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium">
                    {DMS_ENTITY_TYPE_LABELS[link.entity_type as keyof typeof DMS_ENTITY_TYPE_LABELS] ?? link.entity_type}
                  </td>
                  <td className="px-3 py-2 font-mono">#{link.entity_id}</td>
                  <td className="px-3 py-2 text-muted-foreground">{link.link_role ?? "—"}</td>
                  <td className="px-3 py-2">{link.is_primary ? "✓" : "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {format(parseISO(link.linked_at), "dd MMM yyyy")}
                  </td>
                  {!isViewing && (
                    <td className="px-3 py-2">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-destructive hover:text-destructive"
                        onClick={() => handleRemove(link.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isViewing && !showAdd && (
        <Button size="sm" variant="outline" onClick={() => setShowAdd(true)} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Add Link
        </Button>
      )}

      {/* AI Link Suggestions */}
      {!isViewing && (
        <div className="border-t border-border pt-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-purple-500" />
              <span className="text-xs font-medium">AI Link Suggestions</span>
              {pendingLinkSuggestions.length > 0 && (
                <Badge variant="outline" className="text-[9px] px-1 py-0 text-purple-600 border-purple-300">
                  {pendingLinkSuggestions.length} pending
                </Badge>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleSuggestLinks}
              disabled={suggestLoading}
              className="h-7 text-xs gap-1"
            >
              {suggestLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3 text-purple-500" />
              )}
              Suggest Links
            </Button>
          </div>

          {pendingLinkSuggestions.length > 0 && (
            <div className="space-y-1.5">
              {pendingLinkSuggestions.map((s: DmsLinkSuggestionRow) => (
                <div
                  key={s.id}
                  className="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-2.5 py-1.5"
                >
                  <Link2 className="h-3 w-3 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">
                        {DMS_ENTITY_TYPE_LABELS[s.entityType as keyof typeof DMS_ENTITY_TYPE_LABELS] ?? s.entityType}
                      </Badge>
                      <span className="text-xs font-medium truncate">
                        {s.entityName ?? `#${s.entityId}`}
                      </span>
                    </div>
                    {s.reason && (
                      <p className="text-[10px] text-muted-foreground truncate">{s.reason}</p>
                    )}
                  </div>
                  {s.confidence !== null && (
                    <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">
                      {Math.round(s.confidence * 100)}%
                    </Badge>
                  )}
                  <div className="flex gap-1 shrink-0">
                    {s.entityId !== null && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                        onClick={() => handleApplyLinkSuggestion(s.id)}
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
                      onClick={() => handleRejectLinkSuggestion(s.id)}
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
            </div>
          )}
        </div>
      )}

      {!isViewing && showAdd && (
        <div className="rounded-md border border-border p-4 space-y-3 bg-muted/10">
          <p className="text-xs font-medium">Add Entity Link</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Entity Type</Label>
              <Select value={entityType} onValueChange={(v) => setEntityType(v ?? DMS_ENTITY_TYPES[0])}>
                <SelectTrigger className="mt-1 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DMS_ENTITY_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{DMS_ENTITY_TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Entity ID</Label>
              <Input
                className="mt-1 h-8 text-xs"
                type="number"
                min={1}
                value={entityId}
                onChange={(e) => setEntityId(e.target.value)}
                placeholder="Numeric ID"
              />
            </div>
            <div>
              <Label className="text-xs">Role (optional)</Label>
              <Input
                className="mt-1 h-8 text-xs"
                value={linkRole}
                onChange={(e) => setLinkRole(e.target.value)}
                placeholder="e.g. primary, supporting"
              />
            </div>
            <div className="flex items-end gap-2">
              <label className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={isPrimary}
                  onChange={(e) => setIsPrimary(e.target.checked)}
                />
                Primary link
              </label>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" onClick={handleAdd} disabled={adding} className="gap-1.5">
              {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Add
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)} disabled={adding}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
