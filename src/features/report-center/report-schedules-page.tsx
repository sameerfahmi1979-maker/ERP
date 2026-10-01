"use client";

import { ERPPageHeader } from "@/components/erp/page-header";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  deleteReportSchedule,
  listReportSchedules,
  runReportScheduleNow,
  type ReportSchedule,
} from "@/server/actions/reports/schedules";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { format, formatDistanceToNow } from "date-fns";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ReportScheduleForm } from "./report-schedule-form";
import { AlgtDialog } from "@/components/design-system/algt-dialog";
import { canEditSchedule, type ScheduleUiAccess } from "@/lib/report-center/schedule-ui-access";

const STATUS_CONFIG = {
  success: { label: "Generation succeeded", icon: CheckCircle2, color: "text-emerald-700 dark:text-emerald-300" },
  failed: { label: "Failed", icon: XCircle, color: "text-red-600" },
  skipped: { label: "Skipped", icon: AlertCircle, color: "text-amber-600" },
  cancelled: { label: "Cancelled", icon: AlertCircle, color: "text-slate-500" },
};

export function ReportSchedulesPage({ access }: { access: ScheduleUiAccess }) {
  const [showForm, setShowForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ReportSchedule | null>(null);
  const [runningId, setRunningId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReportSchedule | null>(null);
  const deleting = useRef(false);

  const { data: schedules = [], isFetching: isLoading, refetch, error } = useQuery({
    queryKey: ["report-schedules", access.profileId],
    queryFn: async () => {
      const result = await listReportSchedules();
      if (!result.success || !result.data) throw new Error(result.error ?? "Failed to load schedules.");
      return result.data;
    },
    retry: false, gcTime: 0, refetchOnWindowFocus: false,
  });
  const load = () => refetch();
  useEffect(() => { if (error) toast.error("Schedules could not be refreshed. Actions are disabled until a successful refresh."); }, [error]);

  const requestKeys = useRef(new Map<number, string>());
  const runningRequests = useRef(new Set<number>());
  const handleRunNow = async (id: number) => {
    const row = schedules.find(row => row.id === id);
    if (error || isLoading || !row || !canEditSchedule(access, row) || runningRequests.current.has(id)) return;
    runningRequests.current.add(id);
    const requestKey = requestKeys.current.get(id) ?? crypto.randomUUID();
    requestKeys.current.set(id, requestKey);
    setRunningId(id);
    try {
      const result = await runReportScheduleNow(id, requestKey);
      if (result.success) {
        requestKeys.current.delete(id);
        toast.success("Report queued. Delivery permissions will be checked before sending.");
      }
      else toast.error(result.error ?? "Run failed.");
    } catch {
      toast.error("Queue response unavailable. Retry this run to check the same request; do not create a duplicate.");
    } finally {
      runningRequests.current.delete(id);
      setRunningId(null);
      load();
    }
  };

  const handleDelete = async (id: number) => {
    const row = schedules.find(row => row.id === id);
    if (deleting.current || error || isLoading || !row || !canEditSchedule(access, row)) return;
    deleting.current = true;
    setDeletingId(id);
    try {
      const result = await deleteReportSchedule(id);
      if (result.success) { setDeleteTarget(null); toast.success("Schedule removed. Delivery history is retained."); load(); }
      else toast.error(result.error ?? "Delete failed.");
    } catch {
      toast.error("Deletion could not be confirmed. Refresh before retrying.");
    } finally {
      setDeletingId(null);
      deleting.current = false;
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
        if (!canEditSchedule(access, sched)) return <span className="text-xs text-muted-foreground">View only</span>;
        return (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => handleRunNow(sched.id)}
              disabled={!!error || isLoading || runningId !== null || deletingId !== null}
              title="Run Now"
              aria-label={`Queue ${sched.schedule_name} now`}
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
              aria-label={`Edit ${sched.schedule_name}`}
              disabled={!!error || isLoading || deletingId !== null || runningId !== null}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={() => setDeleteTarget(sched)}
              disabled={!!error || isLoading || deletingId !== null || runningId !== null}
              title="Delete"
              aria-label={`Remove ${sched.schedule_name}`}
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
            <Badge variant="secondary" className="text-xs">{schedules.length} loaded</Badge>
            <Button variant="outline" size="sm" onClick={load} disabled={isLoading}>
              <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", isLoading && "animate-spin")} />
              Refresh
            </Button>
            {(access.globalDelivery || access.deliveryCompanyIds.length > 0) && <Button size="sm" disabled={!!error || isLoading} onClick={() => { setEditingSchedule(null); setShowForm(true); }}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              New Schedule
            </Button>}
          </div>
        }
      />

      <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2 border border-border">
        Run now queues a request; it does not confirm inbox delivery. Automatic delivery requires the enabled backend service.
        Times in the list use your browser timezone; each schedule retains its configured timezone.
        Search and filters apply to the loaded records, not an unlimited system-wide search.
      </div>
      {error && <div role="alert" className="border border-destructive rounded-sm p-3 text-sm">Schedules could not be refreshed. Previously loaded records may be outdated. Use Refresh before taking an action.</div>}

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
      <AlgtDialog open={!!deleteTarget} onOpenChange={open => { if (!open && !deleting.current) setDeleteTarget(null); }} title="Remove schedule?"
        actions={<><Button variant="outline" disabled={deletingId !== null} onClick={() => setDeleteTarget(null)}>Keep schedule</Button>
          <Button variant="destructive" disabled={deletingId !== null || !!error || isLoading} onClick={() => { if (deleteTarget) void handleDelete(deleteTarget.id); }}>Remove schedule</Button></>}>
        <p>Remove “{deleteTarget?.schedule_name}” from active schedules? Its delivery history will remain. This does not recall messages already sent or accepted by the provider.</p>
      </AlgtDialog>
    </>
  );
}
