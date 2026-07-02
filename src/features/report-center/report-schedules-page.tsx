"use client";

import { useState, useEffect, useCallback } from "react";
import { format, formatDistanceToNow } from "date-fns";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Plus,
  RefreshCw,
  Trash2,
  Play,
  Pencil,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import { ERPPageHeader } from "@/components/erp/page-header";
import {
  listReportSchedules,
  deleteReportSchedule,
  runReportScheduleNow,
  type ReportSchedule,
} from "@/server/actions/reports/schedules";
import { ReportScheduleForm } from "./report-schedule-form";

const STATUS_CONFIG = {
  success: { label: "Success", icon: CheckCircle2, color: "text-emerald-600" },
  failed: { label: "Failed", icon: XCircle, color: "text-red-600" },
  skipped: { label: "Skipped", icon: AlertCircle, color: "text-amber-600" },
  cancelled: { label: "Cancelled", icon: AlertCircle, color: "text-slate-500" },
};

export function ReportSchedulesPage() {
  const [schedules, setSchedules] = useState<ReportSchedule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ReportSchedule | null>(null);
  const [runningId, setRunningId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    const result = await listReportSchedules();
    if (result.success && result.data) {
      setSchedules(result.data);
    } else {
      toast.error(result.error ?? "Failed to load schedules.");
    }
    setIsLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRunNow = async (id: number) => {
    setRunningId(id);
    try {
      const result = await runReportScheduleNow(id);
      if (result.success) toast.success("Schedule ran successfully. Email delivered.");
      else toast.error(result.error ?? "Run failed.");
    } finally {
      setRunningId(null);
      load();
    }
  };

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      const result = await deleteReportSchedule(id);
      if (result.success) { toast.success("Schedule deleted."); load(); }
      else toast.error(result.error ?? "Delete failed.");
    } finally {
      setDeletingId(null);
    }
  };

  const columns: ColumnDef<ReportSchedule>[] = [
    {
      id: "schedule_name",
      accessorKey: "schedule_name",
      header: "Schedule",
      size: 220,
      cell: ({ row }) => {
        const sched = row.original;
        return (
          <div className="min-w-0">
            <div className="font-medium text-sm truncate">{sched.schedule_name}</div>
            {sched.recipient_to.length > 0 && (
              <div className="text-[10px] text-muted-foreground truncate">
                To: {sched.recipient_to.join(", ")}
              </div>
            )}
          </div>
        );
      },
      meta: { exportValue: (row) => row.schedule_name },
    },
    {
      id: "report",
      header: "Report",
      size: 170,
      accessorFn: (row) => (row.report as { report_name_en?: string } | undefined)?.report_name_en ?? "",
      cell: ({ row }) => {
        const report = row.original.report as { report_name_en?: string } | undefined;
        return (
          <span className="text-xs text-muted-foreground truncate block">
            {report?.report_name_en ?? "—"}
          </span>
        );
      },
      meta: { exportValue: (row) => (row.report as { report_name_en?: string } | undefined)?.report_name_en ?? "" },
    },
    {
      id: "frequency",
      accessorKey: "frequency",
      header: "Frequency",
      size: 100,
      cell: ({ row }) => (
        <Badge variant="outline" className="text-[10px] font-semibold px-1.5 py-0.5 capitalize">
          {row.original.frequency}
        </Badge>
      ),
      meta: { exportValue: (row) => row.frequency },
    },
    {
      id: "output_format",
      accessorKey: "output_format",
      header: "Format",
      size: 80,
      cell: ({ row }) => (
        <Badge variant="secondary" className="text-[10px] font-mono uppercase px-1.5 py-0.5">
          {row.original.output_format}
        </Badge>
      ),
      meta: { exportValue: (row) => row.output_format },
    },
    {
      id: "next_run_at",
      accessorKey: "next_run_at",
      header: "Next Run",
      size: 130,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.next_run_at
            ? formatDistanceToNow(new Date(row.original.next_run_at), { addSuffix: true })
            : "—"}
        </span>
      ),
      meta: { exportValue: (row) => row.next_run_at ? format(new Date(row.next_run_at), "dd MMM yyyy HH:mm") : "" },
    },
    {
      id: "last_run_at",
      accessorKey: "last_run_at",
      header: "Last Run",
      size: 110,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.last_run_at
            ? format(new Date(row.original.last_run_at), "dd MMM HH:mm")
            : "—"}
        </span>
      ),
      meta: { exportValue: (row) => row.last_run_at ? format(new Date(row.last_run_at), "dd MMM yyyy HH:mm") : "" },
    },
    {
      id: "last_status",
      accessorKey: "last_status",
      header: "Last Status",
      size: 110,
      cell: ({ row }) => {
        const statusCfg = row.original.last_status
          ? STATUS_CONFIG[row.original.last_status as keyof typeof STATUS_CONFIG]
          : null;
        return statusCfg ? (
          <div className={cn("flex items-center gap-1.5 text-xs", statusCfg.color)}>
            <statusCfg.icon className="h-3.5 w-3.5 shrink-0" />
            {statusCfg.label}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            Never run
          </span>
        );
      },
      meta: { exportValue: (row) => row.last_status ?? "Never run" },
    },
    {
      id: "is_active",
      accessorKey: "is_active",
      header: "Active",
      size: 80,
      cell: ({ row }) => (
        <Badge
          variant={row.original.is_active ? "default" : "secondary"}
          className="text-[10px] font-semibold px-1.5 py-0.5"
        >
          {row.original.is_active ? "Active" : "Paused"}
        </Badge>
      ),
      meta: { exportValue: (row) => (row.is_active ? "Active" : "Paused") },
    },
    {
      id: "actions",
      header: "",
      size: 100,
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const sched = row.original;
        return (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => handleRunNow(sched.id)}
              disabled={runningId === sched.id}
              title="Run Now"
            >
              {runningId === sched.id ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => { setEditingSchedule(sched); setShowForm(true); }}
              title="Edit"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={() => handleDelete(sched.id)}
              disabled={deletingId === sched.id}
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        );
      },
      meta: { exportable: false },
    },
  ];

  return (
    <>
      <ERPPageHeader
        title="Report Schedules"
        description="Configure automated report delivery on a recurring schedule"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Admin" },
          { label: "Report Center", href: "/admin/reports" },
          { label: "Report Schedules" },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">{schedules.length}</Badge>
            <Button variant="outline" size="sm" onClick={load} disabled={isLoading}>
              <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", isLoading && "animate-spin")} />
              Refresh
            </Button>
            <Button size="sm" onClick={() => { setEditingSchedule(null); setShowForm(true); }}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              New Schedule
            </Button>
          </div>
        }
      />

      <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2 border border-border">
        Scheduled reports require a cron trigger (Supabase Edge Function or pg_cron) to run automatically.
        Use <strong>Run Now</strong> to trigger manually for testing.
      </div>

      <div className="rounded-md border border-border overflow-hidden">
        <ERPDataTable
          tableId="admin.reports.schedules"
          columns={columns}
          data={schedules}
          searchPlaceholder="Search schedules..."
          emptyMessage={isLoading ? "Loading schedules..." : "No report schedules configured yet."}
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

      <ReportScheduleForm
        open={showForm}
        onOpenChange={(open) => { setShowForm(open); if (!open) setEditingSchedule(null); }}
        editing={editingSchedule}
        onSaved={load}
      />
    </>
  );
}
