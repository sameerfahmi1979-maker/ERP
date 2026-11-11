"use client";

import type { ColumnDef, Table } from "@tanstack/react-table";
import { EditColumns, type ListColumn } from "./list-controls";

export function erpColumnLayoutDefinitions<TData>(columns: ColumnDef<TData, unknown>[], resizing: boolean): ListColumn[] {
  return columns.flatMap(column => {
    if ("columns" in column && column.columns?.length) return erpColumnLayoutDefinitions(column.columns, resizing);
    const id = column.id ?? ("accessorKey" in column ? String(column.accessorKey).replaceAll(".", "_") : undefined)
      ?? (typeof column.header === "string" ? column.header : undefined);
    if (!id) return [];
    const width = Math.round(Math.max(column.minSize ?? 20, Math.min(column.maxSize ?? Number.MAX_SAFE_INTEGER, column.size ?? 150)));
    const position = id === "select" ? "start" : id === "actions" ? "end" : undefined;
    return [{
      id,
      label: typeof column.header === "string" && column.header ? column.header : column.meta?.exportHeader ?? id.replaceAll("_", " "),
      width,
      visible: true,
      required: !!position || column.enableHiding === false,
      minWidth: Math.max(column.minSize ?? 20, Math.min(80, width)),
      maxWidth: Math.min(column.maxSize ?? Number.MAX_SAFE_INTEGER, Math.max(640, width)),
      resizable: resizing && column.enableResizing !== false && id !== "select",
      position,
    }];
  });
}

type ColumnMenuLayout = { columns: ListColumn[]; defaults: ListColumn[]; setColumns: (columns: ListColumn[]) => void };

export function ERPColumnMenu<TData>({ table, requiredColumns = [], layout }: {
  table: Table<TData>; requiredColumns?: string[]; layout?: ColumnMenuLayout;
}) {
  if (layout) return <EditColumns columns={layout.columns} defaults={layout.defaults} onApply={layout.setColumns} />;

  // Flat schema order is stable; leaf order already reflects the user's ordering.
  const dataColumns = table.getAllFlatColumns().filter(column => !column.columns.length && column.id !== "select" && column.id !== "actions");
  const toChoice = (column: typeof dataColumns[number], defaults: boolean): ListColumn => ({
    id: column.id,
    label: typeof column.columnDef.header === "string" && column.columnDef.header ? column.columnDef.header : column.columnDef.meta?.exportHeader ?? column.id.replaceAll("_", " "),
    width: defaults ? column.columnDef.size ?? 150 : column.getSize(),
    visible: defaults ? table.initialState.columnVisibility[column.id] !== false : column.getIsVisible(),
    required: column.id === dataColumns[0]?.id || requiredColumns.includes(column.id) || !column.getCanHide(),
    minWidth: Math.max(column.columnDef.minSize ?? 20, Math.min(80, column.columnDef.size ?? 150)),
    maxWidth: Math.min(column.columnDef.maxSize ?? Number.MAX_SAFE_INTEGER, Math.max(640, column.columnDef.size ?? 150)),
    resizable: column.getCanResize(),
  });
  const definitions = dataColumns.map(column => toChoice(column, true));
  const order = table.getState().columnOrder;
  const ordered = [...dataColumns].sort((a,b) => {
    const ai = order.indexOf(a.id), bi = order.indexOf(b.id);
    return (ai < 0 ? dataColumns.indexOf(a) : ai) - (bi < 0 ? dataColumns.indexOf(b) : bi);
  });
  return <EditColumns columns={ordered.map(column => toChoice(column, false))} defaults={definitions} onApply={next => {
    table.setColumnVisibility(Object.fromEntries(next.map(column => [column.id, column.required || column.visible])));
    table.setColumnSizing(Object.fromEntries(next.map(column => [column.id, column.width])));
    table.setColumnOrder([...table.getAllLeafColumns().filter(column => column.id === "select").map(column => column.id), ...next.map(column => column.id), ...table.getAllLeafColumns().filter(column => column.id === "actions").map(column => column.id)]);
  }} />;
}
