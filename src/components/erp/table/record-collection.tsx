"use client";

import {createContext, useContext, type ReactNode} from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ERPDataTable } from "./erp-data-table";
import { loadedListValue, type LoadedListField } from "./loaded-list-view";
import type { ERPTableServerRead } from "./erp-table-types";
import { EmbeddedRecordCollection } from "./embedded-record-collection";
import type { ListPresentation } from "./embedded-list-navigation";

const RecordRenderer = createContext<((row: unknown, index: number) => ReactNode) | null>(null);
/** Stable cell type retains detail controls across the parent's loading updates.
 * A per-render inline component factory remounts its children instead. */
function RecordDetailsCell({row}: {row: {original: unknown; index: number}}) {
  const render = useContext(RecordRenderer);
  return <div className="min-w-0 whitespace-normal">{render?.(row.original, row.index)}</div>;
}

/** Explicit permitted scalar columns, plus the existing permission-aware record renderer.
 * Never discovers fields from an object or flattens confidential data for searching. */
export function RecordCollection<T>({ id, rows, fields, renderRecord, serverRead, isLoading, message, userProfileId, presentation = "embedded" }: {
  id: string; rows: T[]; fields: LoadedListField[]; renderRecord: (row: T, index: number) => ReactNode;
  serverRead?: ERPTableServerRead<T>; isLoading?: boolean; message?: string | null; userProfileId?: string;
  presentation?: ListPresentation;
}) {
  if (presentation === "embedded") return <EmbeddedRecordCollection id={id} rows={rows} renderRecord={renderRecord} serverRead={serverRead} isLoading={isLoading} message={message} userProfileId={userProfileId} />;
  const columns: ColumnDef<T>[] = fields.map((field, index) => ({
    id: field.id, header: field.label, accessorFn: row => loadedListValue(row, field.path ?? field.id),
    size: field.width ?? 160, enableHiding: index !== 0, meta: { filter: { type: field.type === "multi-select" ? "text" : field.type ?? "text", options: field.options } },
  }));
  columns.push({ id: "record_details", header: "Details and permitted actions", size: 520, enableSorting: false,
    meta: { exportable: false }, cell: RecordDetailsCell });
  return <RecordRenderer.Provider value={(row,index)=>renderRecord(row as T,index)}><div className="min-w-0">{message && <p role="alert" className="mb-2 text-sm text-destructive">{message}</p>}<ERPDataTable tableId={id} data={rows} columns={columns} enableRowSelection={false}
    serverRead={serverRead} isLoading={isLoading} userProfileId={userProfileId} resultsLabel={`${id} results`}
    searchPlaceholder={serverRead ? "Search all permitted records…" : "Search loaded records…"} emptyMessage={serverRead ? "No permitted records match this view." : "No loaded records match this view."} initialPageSize={serverRead ? 25 : 10} />
    <p className="px-4 py-2 text-xs text-muted-foreground">{serverRead ? `${serverRead.totalCount === null ? "Records unavailable or loading" : `${serverRead.totalCount} permitted records`}. Search, filters and sorting cover the full permitted result; details retain their existing access rules.` : "Columns, search and filters apply only to permitted records loaded in this section. Details retain their existing access rules."}</p>
  </div></RecordRenderer.Provider>;
}
