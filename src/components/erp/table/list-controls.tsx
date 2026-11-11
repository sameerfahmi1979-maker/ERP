"use client";

import { Children, isValidElement, useState, type ReactNode, type HTMLAttributes, type ReactElement } from "react";
import { Button, Checkbox, Input } from "@fluentui/react-components";
import { ArrowDown20Regular, ArrowUp20Regular, ColumnTriple20Regular, Filter20Regular } from "@fluentui/react-icons";
import { AlgtDialog } from "@/components/design-system/algt-dialog";
import { useWorklistColumns } from "@/hooks/use-worklist-columns";
import { useWorklistViewport } from "@/hooks/use-worklist-viewport";
import { columnWidthBounds, normalizeColumns, type ListColumn } from "@/lib/ui/worklist-column-layout";

export { normalizeColumns, type ListColumn };
export function useListColumns(key: string, definitions: ListColumn[], preferenceId: string | null = key, viewportOptions?: Parameters<typeof useWorklistViewport>[2]) {
  const layout = useWorklistColumns(key, definitions, preferenceId);
  const viewport = useWorklistViewport(key, layout.visible, viewportOptions);
  return { ...layout, viewport };
}

export function EditColumns({ columns, defaults, onApply }: { columns: ListColumn[]; defaults: ListColumn[]; onApply: (columns: ListColumn[]) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(columns);
  const currentDefinitions = new Map(defaults.map(column => [column.id, column]));
  const editable = draft.flatMap(column => {
    const definition = currentDefinitions.get(column.id);
    return definition && !definition.position ? [{ column, definition, bounds: columnWidthBounds(definition) }] : [];
  });
  const validWidth = (width: number, min: number, max: number) => Number.isInteger(width) && width >= min && width <= max;
  const widthsValid = editable.every(({ column, definition, bounds }) =>
    definition.resizable === false || validWidth(column.width, bounds.min, bounds.max));
  const changeOpen = (next: boolean) => { if (next) setDraft(columns.map(column => ({ ...column }))); setOpen(next); };
  const move = (id: string, neighborId: string) => setDraft(previous => {
    const index = previous.findIndex(column => column.id === id);
    const neighbor = previous.findIndex(column => column.id === neighborId);
    const next = [...previous];
    [next[index], next[neighbor]] = [next[neighbor], next[index]];
    return next;
  });
  return <AlgtDialog open={open} onOpenChange={changeOpen} title="Edit columns"
    trigger={<Button icon={<ColumnTriple20Regular />}>Edit columns</Button>}
    actions={<><Button appearance="subtle" onClick={() => setDraft(normalizeColumns([], defaults))}>Restore defaults</Button><Button onClick={() => changeOpen(false)}>Cancel</Button><Button appearance="primary" disabled={!widthsValid} onClick={() => { if (widthsValid) { onApply(normalizeColumns(draft, defaults)); changeOpen(false); } }}>Apply</Button></>}>
    <p className="text-sm mb-3">Choose visible columns, their order and width. Required identity columns stay visible. Changes apply only to this list.</p>
    {!widthsValid && <p role="alert" className="mb-3 text-sm text-red-700 dark:text-red-300">Enter a whole-number width within the limits shown for each column.</p>}
    <ol className="space-y-3">{editable.map(({ column, definition, bounds }, index) => <li key={column.id} className="border-b pb-3">
      <div className="flex items-center flex-wrap gap-2">
        <Checkbox label={definition.required ? `${definition.label} (required)` : definition.label} checked={definition.required || column.visible} disabled={definition.required}
          onChange={(_, data) => setDraft(previous => previous.map(item => item.id === column.id ? { ...item, visible: data.checked === true } : item))} />
        <div className="ml-auto flex gap-1">
          <Button icon={<ArrowUp20Regular />} aria-label={`Move ${definition.label} up`} disabled={index === 0} onClick={() => move(column.id, editable[index - 1].column.id)} />
          <Button icon={<ArrowDown20Regular />} aria-label={`Move ${definition.label} down`} disabled={index === editable.length - 1} onClick={() => move(column.id, editable[index + 1].column.id)} />
        </div>
      </div>
      {definition.resizable !== false && <label className="flex flex-wrap gap-2 items-center pl-2 text-sm">
        Width (pixels) <Input type="number" min={bounds.min} max={bounds.max} step={1}
          value={Number.isNaN(column.width) ? "" : String(column.width)} aria-label={`${definition.label} width`}
          aria-invalid={!validWidth(column.width, bounds.min, bounds.max) || undefined}
          onChange={(_, data) => setDraft(previous => previous.map(item => item.id === column.id ? { ...item, width: data.value === "" ? NaN : Number(data.value) } : item))} style={{ width: 110 }} />
        <span className="text-xs text-muted-foreground">{bounds.min}–{bounds.max}</span>
      </label>}
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
