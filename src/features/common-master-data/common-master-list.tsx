"use client";

import Link from "next/link";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import type { ColumnDef } from "@tanstack/react-table";

type Value = string | number | boolean | null;
export type CommonMasterRecord = { id: number; name: string; code: string } & Record<string, Value>;
export type CommonMasterColumn = { key: string; label: string; type?: "text" | "number" | "date" | "select"; options?: { value: string; label: string }[] };

/** Serializable, explicit projections only; preserves the server's existing scope and query. */
export function CommonMasterList({ rows, fields, basePath, title }: {
  rows: CommonMasterRecord[]; fields: CommonMasterColumn[]; basePath: string; title: string;
}) {
  const columns: ColumnDef<CommonMasterRecord>[] = [
    { accessorKey: "name", header: "Name", size: 260, enableHiding: false,
      cell: ({ row }) => <Link className="font-medium text-primary underline underline-offset-4" href={`${basePath}/record/${row.original.id}`}>{row.original.name}</Link> },
    { accessorKey: "code", header: "Code", size: 140 },
    ...fields.map(field => ({ accessorKey: field.key, header: field.label, size: 160,
      meta: { filter: { type: field.type ?? "text", options: field.options } },
      cell: ({ row }) => { const value = row.original[field.key]; return value == null || value === "" ? "—" : typeof value === "boolean" ? (value ? "Yes" : "No") : String(value); },
    } satisfies ColumnDef<CommonMasterRecord>)),
  ];
  return <ERPDataTable tableId={`common:${basePath}`} resultsLabel={title} columns={columns} data={rows}
    enableRowSelection={false} searchPlaceholder={`Search ${title.toLocaleLowerCase()}…`} emptyMessage={`No ${title.toLocaleLowerCase()} are available.`} />;
}
