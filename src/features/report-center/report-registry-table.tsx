"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Lock, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import type { ReportRegistryEntry } from "@/lib/report-center/types";

const categoryLabels: Record<string, string> = {
  list: "List",
  summary: "Summary",
  detail: "Detail",
  dashboard_snapshot: "Dashboard",
  letter: "Letter",
  certificate: "Certificate",
  form: "Form",
  checklist: "Checklist",
  compliance: "Compliance",
  audit: "Audit",
  export: "Export",
  badge: "Badge",
  external_submission: "External",
  group_summary: "Group Summary",
};

interface Props {
  entries: ReportRegistryEntry[];
}

const columns: ColumnDef<ReportRegistryEntry>[] = [
  {
    id: "report_code",
    accessorKey: "report_code",
    header: "Code",
    size: 180,
    cell: ({ row }) => (
      <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded truncate block">
        {row.original.report_code}
      </code>
    ),
    meta: { exportValue: (row) => row.report_code },
  },
  {
    id: "name",
    accessorKey: "report_name_en",
    header: "Report Name",
    size: 280,
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="font-medium text-sm truncate">{row.original.report_name_en}</div>
        {row.original.description_en && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{row.original.description_en}</p>
        )}
        {row.original.sensitive_profile !== "normal" && (
          <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 mt-0.5">
            <Lock className="h-3 w-3" />
            {row.original.sensitive_profile}
          </span>
        )}
      </div>
    ),
    meta: { exportValue: (row) => row.report_name_en },
  },
  {
    id: "module_code",
    accessorKey: "module_code",
    header: "Module",
    size: 120,
    cell: ({ row }) => (
      <Badge variant="outline" className="text-[10px] font-semibold px-1.5 py-0.5">
        {row.original.module_code}
      </Badge>
    ),
    meta: { exportValue: (row) => row.module_code },
  },
  {
    id: "category",
    accessorKey: "report_category",
    header: "Category",
    size: 120,
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {categoryLabels[row.original.report_category] ?? row.original.report_category}
      </span>
    ),
    meta: { exportValue: (row) => categoryLabels[row.report_category] ?? row.report_category },
  },
  {
    id: "formats",
    header: "Formats",
    size: 160,
    enableSorting: false,
    cell: ({ row }) => (
      <div className="flex flex-wrap gap-1">
        {row.original.default_output_formats.map((fmt) => (
          <Badge key={fmt} variant="secondary" className="text-[10px] font-semibold px-1.5 py-0.5">
            {fmt.toUpperCase()}
          </Badge>
        ))}
      </div>
    ),
    meta: { exportable: false },
  },
  {
    id: "is_active",
    accessorKey: "is_active",
    header: "Status",
    size: 90,
    cell: ({ row }) => (
      <Badge
        variant={row.original.is_active ? "default" : "secondary"}
        className="text-[10px] font-semibold px-1.5 py-0.5"
      >
        {row.original.is_active ? "Active" : "Inactive"}
      </Badge>
    ),
    meta: { exportValue: (row) => (row.is_active ? "Active" : "Inactive") },
  },
  {
    id: "actions",
    header: "",
    size: 90,
    enableSorting: false,
    enableHiding: false,
    cell: ({ row }) =>
      row.original.is_active ? (
        <Link href={`/admin/reports/run/${row.original.report_code}`}>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1">
            <Play className="h-3 w-3" />
            Run
          </Button>
        </Link>
      ) : null,
    meta: { exportable: false },
  },
];

export function ReportRegistryTable({ entries }: Props) {
  return (
    <div className="rounded-md border border-border overflow-hidden">
      <ERPDataTable
        tableId="admin.reports.registry"
        columns={columns}
        data={entries}
        searchPlaceholder="Search reports..."
        emptyMessage="No reports available."
        enableSorting
        enableColumnResizing
        enableRowSelection={false}
        enableColumnVisibility
        enablePreferences
        enableGlobalFilter
        initialPageSize={25}
        pageSizeOptions={[10, 25, 50, 100]}
      />
    </div>
  );
}
