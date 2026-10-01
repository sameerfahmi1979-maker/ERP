"use client";

import { useMemo } from "react";
import { EditColumns, EditFilters, useListColumns, type ListColumn, type ListFilter, type FilterValues } from "@/components/erp/table/list-controls";
import { usePersistentUiState } from "@/hooks/use-persistent-ui-state";
import { Input } from "@/components/ui/input";

export type LoadedListField = { id: string; label: string; path?: string; width?: number; required?: boolean; type?: ListFilter["type"]; options?: ListFilter["options"] };
export function loadedListValue(row: unknown, path: string): string {
  const value = path.split(".").reduce<unknown>((item, key) => item && typeof item === "object" ? (item as Record<string, unknown>)[key] : undefined, row);
  if (Array.isArray(value)) return value.filter(item => typeof item === "string" || typeof item === "number").join(", ");
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : "";
}
export function filterLoadedRows<T>(rows: T[], fields: LoadedListField[], filters: FilterValues, search: string): T[] {
  return rows.filter(row => fields.every(field => {
    const wanted = filters[field.id]?.trim();
    if (!field.path || !wanted) return true;
    const value = loadedListValue(row, field.path);
    if (field.type === "number") return value !== "" && Number(value) === Number(wanted);
    if (field.type === "date") return value.slice(0,10) === wanted;
    if (field.type === "select") return value === wanted;
    if (field.type === "multi-select") return wanted.split(",").includes(value);
    return value.toLocaleLowerCase().includes(wanted.toLocaleLowerCase());
  }) && (!search.trim() || fields.some(field => field.path && loadedListValue(row, field.path).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))));
}

/** UI-only filtering of supplied authorized rows. No second cache or durable record storage. */
export function useLoadedListView<T>(key: string, rows: T[], fields: LoadedListField[]) {
  const [filters,setFilters] = usePersistentUiState<FilterValues>(`dms-list:${key}:filters`,{});
  const [search,setSearch] = usePersistentUiState<string>(`dms-list:${key}:search`,"");
  const defaults: ListColumn[] = fields.map(field => ({ id:field.id,label:field.label,width:field.width ?? 160,visible:true,required:field.required }));
  const columnState = useListColumns(`dms:${key}:v1`,defaults);
  const filtered = useMemo(()=>filterLoadedRows(rows,fields,filters,search),[rows,fields,filters,search]);
  return { ...columnState,defaults,fields,filters,setFilters,search,setSearch,rows:filtered,loadedCount:rows.length };
}

export function LoadedListTools<T>({ view, search = false }: { view: ReturnType<typeof useLoadedListView<T>>; search?: boolean }) {
  return <div className="min-w-0 space-y-2 mb-3">
    <div className="flex flex-wrap items-center gap-2">
      {search && <Input aria-label="Search loaded records" placeholder="Search loaded records…" value={view.search} onChange={e=>view.setSearch(e.target.value)} className="w-full sm:max-w-xs" />}
      <EditColumns columns={view.columns} defaults={view.defaults} onApply={view.setColumns} />
      <EditFilters definitions={view.fields.filter(field=>field.path).map(field=>({id:field.id,label:field.label,type:field.type??"text",options:field.options}))}
        values={view.filters} onApply={view.setFilters} scopeLabel="Filters apply to the records loaded in this view, together with any page criteria or search." />
    </div>
    <p className="text-xs text-muted-foreground">{view.rows.length} of {view.loadedCount} loaded records match these filters. This is not a complete system-wide count.</p>
  </div>;
}
