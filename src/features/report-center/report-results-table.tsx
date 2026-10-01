"use client";

import { Badge } from "@/components/ui/badge";
import { ERPEmptyState } from "@/components/erp/empty-state";
import { FileText } from "lucide-react";
import type { ReportDataResult } from "@/lib/report-center/types";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import type { ColumnDef } from "@tanstack/react-table";

interface ReportResultsTableProps {
  data: ReportDataResult | null;
  isLoading: boolean;
  error?: string | null;
}

// Human-readable column headers
function formatColumnHeader(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Format cell value for display
function formatCellValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return value.toLocaleString();
  return String(value);
}

function statusVariant(value: string): "default" | "destructive" | "outline" | "secondary" {
  const v = value.toLowerCase();
  if (["active", "valid", "ready", "approved", "completed", "hired", "issued"].includes(v)) return "default";
  if (["expired", "inactive", "rejected", "failed", "blocked"].includes(v)) return "destructive";
  if (["expiring", "pending", "on_hold", "incomplete"].includes(v)) return "secondary";
  return "outline";
}

const STATUS_COLUMNS = new Set(["status", "approval_status", "readiness_status", "assignment_status", "candidate_status", "case_status", "ppe_status", "asset_status", "offer_status", "task_status", "process_status", "wps_status"]);

export function ReportResultsTable({ data, isLoading, error }: ReportResultsTableProps) {
  if (isLoading) {
    return (
      <div role="status" className="border rounded-sm bg-card p-8 text-center text-sm text-muted-foreground">
        Loading report data...
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="border rounded-sm bg-destructive/5 border-destructive/20 p-6 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (!data) return null;

  const { columns, rows } = data;
  const tableColumns: ColumnDef<Record<string, unknown>>[] = columns.map(col => ({
    id: col, accessorFn: row => row[col], header: formatColumnHeader(col), size: 180,
    cell: ({ getValue }) => {
      const value = getValue();
      return STATUS_COLUMNS.has(col) && value ? <Badge variant={statusVariant(String(value))} className="text-xs capitalize">{String(value).replace(/_/g," ")}</Badge>
        : <span className="whitespace-normal break-words">{formatCellValue(value)}</span>;
    },
  }));

  if (rows.length === 0) {
    return (
      <ERPEmptyState
        icon={FileText}
        title="No results found"
        description="Try adjusting your filters and running the report again."
      />
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden bg-card">
      <ERPDataTable key={columns.join("|")} tableId={`reports.results:${columns.join("|")}`} columns={tableColumns} data={rows}
        enableRowSelection={false} searchPlaceholder="Search generated rows…" initialPageSize={25} />
      <div className="px-4 py-2 border-t bg-muted/20 text-xs text-muted-foreground">
        {rows.length.toLocaleString()} loaded row{rows.length !== 1 ? "s" : ""}. List filters affect these generated rows only, not the report definition or its exports.
        {data.meta?.total && Number(data.meta.total) !== rows.length ? ` (${Number(data.meta.total).toLocaleString()} total)` : null}
      </div>
    </div>
  );
}
