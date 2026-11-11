"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { AlgtDialog } from "@/components/design-system/algt-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDmsSectionQuery } from "@/features/dms/documents/section-activity";
import { readDmsSection } from "@/features/dms/documents/section-read";
import type { DmsCatalogueTag, DmsTagCatalogueQuery } from "@/server/reads/dms-tag-catalogue";

export function DmsAddTagsDialog({ assignedIds, onAdd, onOpenChange, disabled }: {
  assignedIds: ReadonlySet<number>;
  onAdd: (tags: DmsCatalogueTag[]) => void;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [criteria, setCriteria] = useState<DmsTagCatalogueQuery>({ page: 1, search: "", kind: "all" });
  const [selected, setSelected] = useState(new Map<number, DmsCatalogueTag>());
  const waitingForSearch = search.trim() !== criteria.search;

  useEffect(() => {
    if (!open || !waitingForSearch) return;
    const timer = setTimeout(() => setCriteria(previous => ({ ...previous, search: search.trim(), page: 1 })), 200);
    return () => clearTimeout(timer);
  }, [open, search, waitingForSearch]);

  const catalogue = useDmsSectionQuery({
    queryKey: ["dms", "tag-catalogue", criteria],
    enabled: open && !waitingForSearch,
    staleTime: 0,
    gcTime: 60_000,
    queryFn: async ({ signal }) => {
      const result = await readDmsSection("getDmsTagCatalogue", [criteria], signal);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
  });
  const staged = Array.from(selected.values()).filter(tag => !assignedIds.has(tag.id));
  const page = catalogue.data;
  const hasNext = !!page && criteria.page * 25 < page.total;

  function changeOpen(next: boolean) {
    setOpen(next);
    onOpenChange(next);
    if (!next) {
      setSearch("");
      setCriteria({ page: 1, search: "", kind: "all" });
      setSelected(new Map());
    }
  }

  function toggle(tag: DmsCatalogueTag) {
    setSelected(previous => {
      const next = new Map(previous);
      if (next.has(tag.id)) next.delete(tag.id);
      else next.set(tag.id, tag);
      return next;
    });
  }

  return <AlgtDialog open={open} onOpenChange={changeOpen} title="Add tags"
    trigger={<Button type="button" variant="outline" size="sm" disabled={disabled}><Plus /> Add tags</Button>}
    actions={<>
      <Button type="button" variant="outline" onClick={() => changeOpen(false)}>Cancel</Button>
      <Button type="button" disabled={staged.length === 0 || disabled} onClick={() => { onAdd(staged); changeOpen(false); }}>
        {staged.length ? `Add ${staged.length} ${staged.length === 1 ? "tag" : "tags"}` : "Add tags"}
      </Button>
    </>}>
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <label className="grid gap-1 text-sm font-medium">Search tags
          <Input type="search" value={search} maxLength={200} onChange={event => setSearch(event.target.value)} placeholder="Search by name or code" />
        </label>
        <label className="grid gap-1 text-sm font-medium">Tag type
          <select value={criteria.kind} className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            onChange={event => setCriteria({ page: 1, search: search.trim(), kind: event.target.value as DmsTagCatalogueQuery["kind"] })}>
            <option value="all">All tags</option>
            <option value="system">System tags</option>
            <option value="custom">Custom tags</option>
          </select>
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0 space-y-2">
          <h3 className="text-sm font-semibold">Available tags</h3>
          <div className="max-h-[40vh] min-h-24 overflow-y-auto rounded-md border p-1">
            {waitingForSearch || catalogue.isPending ? <p role="status" className="p-2 text-sm text-muted-foreground">Loading tags…</p>
              : catalogue.isError ? <div role="alert" className="space-y-2 p-2 text-sm">
                <p>Tags could not be loaded.</p>
                <Button type="button" size="sm" variant="outline" onClick={() => void catalogue.refetch()}>Try again</Button>
              </div>
              : !page?.tags.length ? <p className="p-2 text-sm text-muted-foreground">No tags match this search.</p>
              : page.tags.map(tag => <label key={tag.id} className="flex min-h-9 items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
                <input type="checkbox" className="shrink-0" checked={assignedIds.has(tag.id) || selected.has(tag.id)}
                  aria-label={assignedIds.has(tag.id) ? `${tag.tag_name}, already assigned` : tag.tag_name}
                  disabled={assignedIds.has(tag.id)} onChange={() => toggle(tag)} />
                <span className="min-w-0 flex-1 break-words" dir="auto">{tag.tag_name}</span>
                {assignedIds.has(tag.id) && <span className="shrink-0 text-xs text-muted-foreground">Already assigned</span>}
              </label>)}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {!waitingForSearch && page && <span className="text-xs text-muted-foreground">
              {page.total ? `${(criteria.page - 1) * 25 + 1}–${(criteria.page - 1) * 25 + page.tags.length} of ${page.total}` : "0 tags"}
            </span>}
            <div className="ml-auto flex gap-1">
              <Button type="button" size="sm" variant="outline" disabled={criteria.page === 1 || waitingForSearch}
                onClick={() => setCriteria(previous => ({ ...previous, page: previous.page - 1 }))}>Previous</Button>
              <Button type="button" size="sm" variant="outline" disabled={!hasNext || waitingForSearch || catalogue.isFetching}
                onClick={() => setCriteria(previous => ({ ...previous, page: previous.page + 1 }))}>Next</Button>
            </div>
          </div>
        </div>
        <div className="min-w-0 space-y-2">
          <h3 className="text-sm font-semibold">Selected tags ({staged.length})</h3>
          <ul className="max-h-[40vh] min-h-24 overflow-y-auto rounded-md border p-1">
            {staged.length === 0 && <li className="p-2 text-sm text-muted-foreground">No tags selected</li>}
            {staged.map(tag => <li key={tag.id} className="flex min-h-9 items-center justify-between gap-2 px-2 text-sm">
              <span className="min-w-0 break-words" dir="auto">{tag.tag_name}</span>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${tag.tag_name} from selection`}
                onClick={() => toggle(tag)}><X /></Button>
            </li>)}
          </ul>
        </div>
      </div>
    </div>
  </AlgtDialog>;
}
