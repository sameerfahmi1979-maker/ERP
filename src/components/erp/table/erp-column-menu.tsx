"use client";

import type { Table } from "@tanstack/react-table";
import { EditColumns, type ListColumn } from "./list-controls";

export function ERPColumnMenu<TData>({ table, requiredColumns = [] }: { table: Table<TData>; requiredColumns?: string[] }) {
  // Flat schema order is stable; leaf order already reflects the user's ordering.
  const dataColumns = table.getAllFlatColumns().filter(column => !column.columns.length && column.id !== "select" && column.id !== "actions");
  const toChoice = (column: typeof dataColumns[number], defaults: boolean): ListColumn => ({
    id: column.id,
    label: typeof column.columnDef.header === "string" && column.columnDef.header ? column.columnDef.header : column.columnDef.meta?.exportHeader ?? column.id.replaceAll("_", " "),
    width: defaults ? column.columnDef.size ?? 150 : column.getSize(),
    visible: defaults ? table.initialState.columnVisibility[column.id] !== false : column.getIsVisible(),
    required: column.id === dataColumns[0]?.id || requiredColumns.includes(column.id) || !column.getCanHide(),
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
