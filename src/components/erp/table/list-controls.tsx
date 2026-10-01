"use client";

import { Children, isValidElement, useState, type ReactNode, type HTMLAttributes, type ReactElement } from "react";
import { Button, Checkbox, Input } from "@fluentui/react-components";
import { ArrowDown20Regular, ArrowUp20Regular, ColumnTriple20Regular, Filter20Regular } from "@fluentui/react-icons";
import { AlgtDialog } from "@/components/design-system/algt-dialog";
import { usePersistentUiState } from "@/hooks/use-persistent-ui-state";

export type ListColumn = { id: string; label: string; width: number; visible: boolean; required?: boolean };
export function normalizeColumns(saved: ListColumn[], definitions: ListColumn[]): ListColumn[] {
  const seen = new Set<string>();
  return [...saved, ...definitions].flatMap(value => {
    const definition = definitions.find(column => column.id === value.id);
    if (!definition || seen.has(value.id)) return [];
    seen.add(value.id);
    return [{ ...definition, visible: definition.required || value.visible, width: Number.isFinite(value.width) ? Math.max(80, Math.min(640, value.width)) : definition.width }];
  });
}

/** Preferences are principal-owned F04 memory, never localStorage. Schema changes discard unauthorized columns. */
export function useListColumns(key: string, definitions: ListColumn[]) {
  const [saved, setSaved] = usePersistentUiState<ListColumn[]>(`list-columns:${key}`, definitions);
  const columns = normalizeColumns(saved, definitions);
  return { columns, visible: columns.filter(column => column.visible), setColumns: (next: ListColumn[]) => setSaved(normalizeColumns(next, definitions)) };
}

export function EditColumns({ columns, defaults, onApply }: { columns: ListColumn[]; defaults: ListColumn[]; onApply: (columns: ListColumn[]) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(columns);
  const widthsValid = draft.every(column => Number.isInteger(column.width) && column.width >= 80 && column.width <= 640);
  const changeOpen = (next: boolean) => { if (next) setDraft(columns.map(column => ({ ...column }))); setOpen(next); };
  const move = (index: number, offset: number) => setDraft(previous => {
    const next = [...previous]; [next[index], next[index + offset]] = [next[index + offset], next[index]]; return next;
  });
  return <AlgtDialog open={open} onOpenChange={changeOpen} title="Edit columns"
    trigger={<Button icon={<ColumnTriple20Regular />}>Edit columns</Button>}
    actions={<><Button appearance="subtle" onClick={() => setDraft(defaults.map(column => ({ ...column })))}>Restore defaults</Button><Button onClick={() => changeOpen(false)}>Cancel</Button><Button appearance="primary" disabled={!widthsValid} onClick={() => { if (widthsValid) { onApply(draft); changeOpen(false); } }}>Apply</Button></>}>
    <p className="text-sm mb-3">Choose visible columns, their order and width. Required identity columns stay visible. Changes apply only to this list.</p>
    {!widthsValid && <p role="alert" className="mb-3 text-sm text-red-700 dark:text-red-300">Enter a whole-number width between 80 and 640 pixels for every column.</p>}
    <ol className="space-y-3">{draft.map((column, index) => <li key={column.id} className="border-b pb-3">
      <div className="flex items-center flex-wrap gap-2">
        <Checkbox label={column.required ? `${column.label} (required)` : column.label} checked={column.visible} disabled={column.required}
          onChange={(_, data) => setDraft(previous => previous.map(item => item.id === column.id ? { ...item, visible: data.checked === true } : item))} />
        <div className="ml-auto flex gap-1">
          <Button icon={<ArrowUp20Regular />} aria-label={`Move ${column.label} up`} disabled={index === 0} onClick={() => move(index, -1)} />
          <Button icon={<ArrowDown20Regular />} aria-label={`Move ${column.label} down`} disabled={index === draft.length - 1} onClick={() => move(index, 1)} />
        </div>
      </div>
      <label className="flex gap-2 items-center pl-2 text-sm">Width (pixels)<Input type="number" min={80} max={640} step={1} value={Number.isNaN(column.width) ? "" : String(column.width)} aria-label={`${column.label} width`}
        aria-invalid={!Number.isInteger(column.width) || column.width < 80 || column.width > 640 || undefined}
        onChange={(_, data) => setDraft(previous => previous.map(item => item.id === column.id ? { ...item, width: data.value === "" ? NaN : Number(data.value) } : item))} style={{ width: 110 }} /></label>
    </li>)}</ol>
  </AlgtDialog>;
}

export type ListFilter = { id: string; label: string; type: "text" | "number" | "date" | "select" | "multi-select"; options?: { value: string; label: string }[] };
export type FilterValues = Record<string, string>;
export function EditFilters({ definitions, values, onApply, scopeLabel }: { definitions: ListFilter[]; values: FilterValues; onApply: (values: FilterValues) => void; scopeLabel: string }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(values);
  const count = definitions.filter(field => values[field.id]).length;
  const changeOpen = (next: boolean) => { if (next) setDraft({ ...values }); setOpen(next); };
  return <div className="contents">
    <AlgtDialog open={open} onOpenChange={changeOpen} title="Edit filters" trigger={<Button icon={<Filter20Regular />}>Edit filters{count ? ` (${count})` : ""}</Button>}
      actions={<><Button appearance="subtle" onClick={() => setDraft({})}>Clear filters</Button><Button onClick={() => changeOpen(false)}>Cancel</Button><Button appearance="primary" onClick={() => { onApply(Object.fromEntries(definitions.map(field => [field.id, draft[field.id] ?? ""]))); changeOpen(false); }}>Apply</Button></>}>
      <p className="mb-4 text-sm">{scopeLabel} Filters combine with AND. They never grant access to additional records.</p>
      <div className="grid gap-4">{definitions.map(field => field.type === "multi-select" ? <fieldset key={field.id} className="grid gap-1">
        <legend className="text-sm font-medium">{field.label}</legend>
        <p className="text-xs text-muted-foreground">Match any selected value; none means all.</p>
        {field.options?.map(option => <Checkbox key={option.value} label={option.label} checked={(draft[field.id] ?? "").split(",").includes(option.value)}
          onChange={(_, data) => setDraft(previous => {
            const selected = new Set((previous[field.id] ?? "").split(",").filter(Boolean));
            if (data.checked === true) selected.add(option.value); else selected.delete(option.value);
            return { ...previous, [field.id]: (field.options ?? []).filter(item => selected.has(item.value)).map(item => item.value).join(",") };
          })} />)}
      </fieldset> : <label key={field.id} className="grid gap-1 text-sm font-medium">{field.label}
        {field.type === "select" ? <select aria-label={field.label} className="h-10 rounded-sm border p-2 bg-transparent font-normal" value={draft[field.id] ?? ""} onChange={event => setDraft(previous => ({ ...previous, [field.id]: event.target.value }))}>
          <option value="">All</option>{field.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select> : <Input aria-label={field.label} type={field.type} value={draft[field.id] ?? ""} onChange={(_, data) => setDraft(previous => ({ ...previous, [field.id]: data.value }))} />}
      </label>)}</div>
    </AlgtDialog>
    {count > 0 && <div className="flex flex-wrap items-center gap-2 w-full text-sm" aria-label="Active filters">
      {definitions.filter(field => values[field.id]).map(field => <Button key={field.id} size="small" aria-label={`Remove ${field.label} filter`} onClick={() => onApply({ ...values, [field.id]: "" })}>{field.label}: {field.type === "multi-select" ? field.options?.filter(option => values[field.id].split(",").includes(option.value)).map(option => option.label).join(", ") : field.options?.find(option => option.value === values[field.id])?.label ?? values[field.id]} ×</Button>)}
      <Button appearance="subtle" size="small" onClick={() => onApply({})}>Clear all filters</Button>
    </div>}
  </div>;
}

/** React-level order/visibility for existing plain-table cell renderers; no CSS-only reordering. */
export function ConfiguredRow({ columns, children, ...props }: HTMLAttributes<HTMLTableRowElement> & { columns: ListColumn[]; children: ReactNode }) {
  const cells = Children.toArray(children).filter(isValidElement) as ReactElement<{ "data-column"?: string }>[];
  const mapped = new Map(cells.filter(cell => cell.props["data-column"]).map(cell => [cell.props["data-column"], cell]));
  return <tr {...props}>{columns.filter(column => column.visible).map(column => mapped.get(column.id))}{cells.filter(cell => !cell.props["data-column"])}</tr>;
}
