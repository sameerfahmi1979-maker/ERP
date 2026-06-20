"use client";

import { Badge } from "@/components/ui/badge";
import { ERPEmptyState } from "@/components/erp/empty-state";
import { FileText } from "lucide-react";
import type { ReportDataResult } from "@/lib/report-center/types";

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
      <div className="border rounded-lg bg-card p-8 text-center text-sm text-muted-foreground">
        Loading report data...
      </div>
    );
  }

  if (error) {
    return (
      <div className="border rounded-lg bg-destructive/5 border-destructive/20 p-6 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (!data) return null;

  const { columns, rows } = data;

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
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50 border-b">
              {columns.map((col) => (
                <th
                  key={col}
                  className="text-left px-3 py-2.5 font-semibold text-foreground whitespace-nowrap"
                >
                  {formatColumnHeader(col)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-muted/30 transition-colors">
                {columns.map((col) => {
                  const value = row[col];
                  const isStatus = STATUS_COLUMNS.has(col);
                  return (
                    <td key={col} className="px-3 py-2 whitespace-nowrap max-w-[200px] truncate">
                      {isStatus && value ? (
                        <Badge variant={statusVariant(String(value))} className="text-[10px] capitalize">
                          {String(value).replace(/_/g, " ")}
                        </Badge>
                      ) : (
                        <span className={col === "employee_code" || col === "candidate_code" ? "font-mono font-medium" : ""}>
                          {formatCellValue(value)}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 border-t bg-muted/20 text-xs text-muted-foreground">
        {rows.length.toLocaleString()} row{rows.length !== 1 ? "s" : ""}
        {data.meta?.total && Number(data.meta.total) !== rows.length ? ` (${Number(data.meta.total).toLocaleString()} total)` : null}
      </div>
    </div>
  );
}
