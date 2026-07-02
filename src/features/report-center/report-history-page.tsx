"use client";

import { useState, useEffect, useCallback } from "react";
import { format, formatDistanceToNow } from "date-fns";
import type { ColumnDef } from "@tanstack/react-table";
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  RefreshCw,
  Eye,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import { ERPPageHeader } from "@/components/erp/page-header";
import { createClient } from "@/lib/supabase/client";
import { ReportDeliveryLogPanel } from "./report-delivery-log-page";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ReportRun {
  id: number;
  report_code: string;
  run_status: "success" | "failed" | "cancelled" | "running";
  output_format: string;
  row_count: number | null;
  sensitive_data_included: boolean;
  was_multi_company: boolean;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  redaction_summary_json: Record<string, unknown> | null;
  owner_company_ids: number[];
  selected_template_id: number | null;
  template_selected_manually: boolean;
  run_by: number;
  run_reference: string | null;
  filters_json: Record<string, unknown>;
  report?: { report_name_en: string; module_code: string };
  runner?: { display_name: string | null };
}

const STATUS_CONFIG = {
  success: { label: "Success", icon: CheckCircle2, color: "text-emerald-600" },
  failed: { label: "Failed", icon: XCircle, color: "text-red-600" },
  cancelled: { label: "Cancelled", icon: AlertCircle, color: "text-amber-600" },
  running: { label: "Running", icon: Clock, color: "text-blue-600" },
};

export function ReportHistoryPage() {
  const [runs, setRuns] = useState<ReportRun[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [detailRun, setDetailRun] = useState<ReportRun | null>(null);

  const loadRuns = useCallback(async () => {
    setIsLoading(true);
    try {
      const db = createClient();
      const { data } = await db
        .from("erp_report_runs")
        .select(`*, report:erp_report_registry(report_name_en, module_code), runner:user_profiles!run_by(display_name)`)
        .order("started_at", { ascending: false })
        .limit(500);
      setRuns((data ?? []) as ReportRun[]);
    } catch (err) {
      console.error("[ReportHistoryPage] Load failed:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadRuns(); }, [loadRuns]);

  const columns: ColumnDef<ReportRun>[] = [
    {
      id: "report",
      header: "Report",
      size: 260,
      accessorFn: (row) => row.report?.report_name_en ?? row.report_code,
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="font-medium text-sm truncate">
            {row.original.report?.report_name_en ?? row.original.report_code}
          </div>
          <div className="text-[10px] font-mono text-muted-foreground truncate">
            {row.original.run_reference ?? row.original.report_code}
          </div>
        </div>
      ),
      meta: { exportValue: (row) => row.report?.report_name_en ?? row.report_code },
    },
    {
      id: "output_format",
      accessorKey: "output_format",
      header: "Format",
      size: 80,
      cell: ({ row }) => (
        <Badge variant="outline" className="text-[10px] font-mono uppercase px-1.5 py-0.5">
          {row.original.output_format}
        </Badge>
      ),
      meta: { exportValue: (row) => row.output_format },
    },
    {
      id: "run_status",
      accessorKey: "run_status",
      header: "Status",
      size: 110,
      cell: ({ row }) => {
        const cfg = STATUS_CONFIG[row.original.run_status] ?? STATUS_CONFIG.failed;
        return (
          <div className={cn("flex items-center gap-1.5 text-xs", cfg.color)}>
            <cfg.icon className="h-3.5 w-3.5 shrink-0" />
            {cfg.label}
          </div>
        );
      },
      meta: { exportValue: (row) => row.run_status },
    },
    {
      id: "row_count",
      accessorKey: "row_count",
      header: "Rows",
      size: 70,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.row_count != null ? row.original.row_count.toLocaleString() : "—"}
        </span>
      ),
      meta: { exportValue: (row) => String(row.row_count ?? "") },
    },
    {
      id: "duration",
      header: "Duration",
      size: 90,
      accessorFn: (row) => row.duration_ms ?? 0,
      cell: ({ row }) => {
        const ms = row.original.duration_ms;
        return (
          <span className="text-xs text-muted-foreground">
            {ms != null ? (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`) : "—"}
          </span>
        );
      },
      meta: { exportValue: (row) => row.duration_ms != null ? (row.duration_ms < 1000 ? `${row.duration_ms}ms` : `${(row.duration_ms / 1000).toFixed(1)}s`) : "" },
    },
    {
      id: "run_by",
      header: "Run By",
      size: 140,
      accessorFn: (row) => row.runner?.display_name ?? String(row.run_by),
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground truncate block">
          {row.original.runner?.display_name ?? String(row.original.run_by)}
        </span>
      ),
      meta: { exportValue: (row) => row.runner?.display_name ?? String(row.run_by) },
    },
    {
      id: "started_at",
      accessorKey: "started_at",
      header: "Started",
      size: 130,
      cell: ({ row }) => (
        <span
          className="text-xs text-muted-foreground"
          title={row.original.started_at}
        >
          {formatDistanceToNow(new Date(row.original.started_at), { addSuffix: true })}
        </span>
      ),
      meta: { exportValue: (row) => format(new Date(row.started_at), "dd MMM yyyy HH:mm") },
    },
    {
      id: "flags",
      header: "Flags",
      size: 130,
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex items-center gap-1 flex-wrap">
          {row.original.sensitive_data_included && (
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0.5">Sensitive</Badge>
          )}
          {row.original.was_multi_company && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0.5">Multi-Co</Badge>
          )}
        </div>
      ),
      meta: { exportable: false },
    },
    {
      id: "actions",
      header: "",
      size: 60,
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title="View Run Details"
          onClick={() => setDetailRun(row.original)}
        >
          <Eye className="h-3.5 w-3.5" />
        </Button>
      ),
      meta: { exportable: false },
    },
  ];

  return (
    <>
      <ERPPageHeader
        title="Report History"
        description="View past report runs, output details, and delivery logs"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Admin" },
          { label: "Report Center", href: "/admin/reports" },
          { label: "Report History" },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">{runs.length} runs</Badge>
            <Button variant="outline" size="sm" onClick={loadRuns} disabled={isLoading}>
              <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", isLoading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        }
      />

      <div className="rounded-md border border-border overflow-hidden">
        <ERPDataTable
          tableId="admin.reports.history"
          columns={columns}
          data={runs}
          searchPlaceholder="Search by report, reference, user..."
          emptyMessage={isLoading ? "Loading history..." : "No report runs found."}
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

      {/* Run detail dialog */}
      <Dialog open={!!detailRun} onOpenChange={(open) => { if (!open) setDetailRun(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {detailRun?.report?.report_name_en ?? detailRun?.report_code} — Run Details
            </DialogTitle>
          </DialogHeader>
          {detailRun && <RunDetailPanel run={detailRun} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function RunDetailPanel({ run }: { run: ReportRun }) {
  const redactionSummary = run.redaction_summary_json as {
    wasRedacted?: boolean;
    totalFieldsRedacted?: number;
    redactedFields?: Array<{ field: string; action: string; reason: string }>;
  } | null;

  return (
    <div className="grid grid-cols-12 gap-4 text-sm pt-2">
      <div className="col-span-4 space-y-2">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Run Details</div>
        <div className="space-y-1 text-xs">
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Reference</span>
            <span className="font-mono">{run.run_reference ?? "—"}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Started</span>
            <span>{format(new Date(run.started_at), "dd MMM yyyy HH:mm:ss")}</span>
          </div>
          {run.completed_at && (
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Completed</span>
              <span>{format(new Date(run.completed_at), "dd MMM yyyy HH:mm:ss")}</span>
            </div>
          )}
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Template manual</span>
            <span>{run.template_selected_manually ? "Yes" : "No"}</span>
          </div>
          {run.error_message && (
            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-red-700">
              {run.error_message}
            </div>
          )}
        </div>
      </div>

      <div className="col-span-4 space-y-2">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Redaction</div>
        {redactionSummary?.wasRedacted ? (
          <div className="space-y-1 text-xs">
            <div className="text-amber-700">{redactionSummary.totalFieldsRedacted} field(s) redacted</div>
            {(redactionSummary.redactedFields ?? []).slice(0, 5).map((f, i) => (
              <div key={i} className="text-muted-foreground">
                <span className="font-mono">{f.field}</span> — {f.action}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">No redaction applied.</div>
        )}
      </div>

      <div className="col-span-4 space-y-2">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Email Deliveries</div>
        <ReportDeliveryLogPanel runId={run.id} />
      </div>
    </div>
  );
}
