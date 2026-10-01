"use client";

import type { ReactNode } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ERPDataTable } from "./erp-data-table";
import { loadedListValue, type LoadedListField } from "./loaded-list-view";

/** Explicit permitted scalar columns, plus the existing permission-aware record renderer.
 * Never discovers fields from an object or flattens confidential data for searching. */
export function RecordCollection<T>({ id, rows, fields, renderRecord }: {
  id: string; rows: T[]; fields: LoadedListField[]; renderRecord: (row: T, index: number) => ReactNode;
}) {
  const columns: ColumnDef<T>[] = fields.map((field, index) => ({
    id: field.id, header: field.label, accessorFn: row => loadedListValue(row, field.path ?? field.id),
    size: field.width ?? 160, enableHiding: index !== 0, meta: { filter: { type: field.type === "multi-select" ? "text" : field.type ?? "text", options: field.options } },
  }));
  columns.push({ id: "record_details", header: "Details and permitted actions", size: 520, enableSorting: false,
    meta: { exportable: false }, cell: ({ row }) => <div className="min-w-0 whitespace-normal">{renderRecord(row.original, row.index)}</div> });
  return <div className="min-w-0"><ERPDataTable tableId={id} data={rows} columns={columns} enableRowSelection={false}
    searchPlaceholder="Search loaded records…" emptyMessage="No loaded records match this view." initialPageSize={10} />
    <p className="px-4 py-2 text-xs text-muted-foreground">Columns, search and filters apply only to permitted records loaded in this section. Details retain their existing access rules.</p>
  </div>;
}
