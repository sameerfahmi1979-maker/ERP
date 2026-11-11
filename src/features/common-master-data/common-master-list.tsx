"use client";

import Link from "next/link";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import type { ColumnDef } from "@tanstack/react-table";

type Value = string | number | boolean | null;
export type CommonMasterRecord = { id: number; name: string; code: string } & Record<string, Value>;
export type CommonMasterColumn = { key: string; label: string; type?: "text" | "number" | "date" | "select"; options?: { value: string; label: string }[] };
const COLUMN_PREFERENCE_IDS: Record<string, string> = {
  "/admin/common-master-data/approval-roles": "common.approval-roles",
  "/admin/common-master-data/work-sites": "common.work-sites",
  "/admin/common-master-data/dms-required-documents": "common.dms-required-documents",
};

/** Serializable, explicit projections only; preserves the server's existing scope and query. */
export function CommonMasterList({ rows, fields, basePath, title, editableRecordIds }: {
  rows: CommonMasterRecord[]; fields: CommonMasterColumn[]; basePath: string; title: string;
  editableRecordIds?: number[];
}) {
  const editableIds = new Set(editableRecordIds);
  const columns: ColumnDef<CommonMasterRecord>[] = [
    { accessorKey: "name", header: "Name", size: 260, enableHiding: false,
      cell: ({ row }) => <Link className="font-medium text-primary underline underline-offset-4" href={`${basePath}/record/${row.original.id}`}>{row.original.name}</Link> },
    { accessorKey: "code", header: "Code", size: 140 },
    ...fields.map(field => ({ accessorKey: field.key, header: field.label, size: 160,
      meta: { filter: { type: field.type ?? "text", options: field.options } },
      cell: ({ row }) => { const value = row.original[field.key]; return value == null || value === "" ? "—" : typeof value === "boolean" ? (value ? "Yes" : "No") : String(value); },
    } satisfies ColumnDef<CommonMasterRecord>)),
  ];
  if (editableIds.size) {
    columns.push({
      id: "actions", header: "Actions", size: 90, enableHiding: false, enableSorting: false,
      cell: ({ row }) => editableIds.has(row.original.id) ? (
        <Link className="text-primary underline underline-offset-4" href={`${basePath}/record/${row.original.id}?mode=edit`} aria-label={`Edit ${row.original.name}`}>
          Edit
        </Link>
      ) : null,
    });
  }
  return <ERPDataTable presentation="worklist" tableId={`common:${basePath}`} columnPreferenceId={COLUMN_PREFERENCE_IDS[basePath] ?? null} resultsLabel={title} columns={columns} data={rows}
    enableRowSelection={false} searchPlaceholder={`Search ${title.toLocaleLowerCase()}…`} emptyMessage={`No ${title.toLocaleLowerCase()} are available.`} />;
}
