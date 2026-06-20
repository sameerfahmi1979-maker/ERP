"use client";

import { useState, useEffect, useCallback } from "react";
import { format, formatDistanceToNow } from "date-fns";
import {
  CalendarClock,
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
      if (result.success) {
        toast.success("Schedule ran successfully. Email delivered.");
      } else {
        toast.error(result.error ?? "Run failed.");
      }
    } finally {
      setRunningId(null);
      load();
    }
  };

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      const result = await deleteReportSchedule(id);
      if (result.success) {
        toast.success("Schedule deleted.");
        load();
      } else {
        toast.error(result.error ?? "Delete failed.");
      }
    } finally {
      setDeletingId(null);
    }
  };

  const handleEdit = (schedule: ReportSchedule) => {
    setEditingSchedule(schedule);
    setShowForm(true);
  };

  const handleFormOpenChange = (open: boolean) => {
    setShowForm(open);
    if (!open) setEditingSchedule(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Report Schedules</h1>
          <Badge variant="secondary">{schedules.length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={isLoading}>
            <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", isLoading && "animate-spin")} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => { setEditingSchedule(null); setShowForm(true); }}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            New Schedule
          </Button>
        </div>
      </div>

      <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2 border">
        Scheduled reports require a cron trigger (Supabase Edge Function or pg_cron) to run automatically.
        Use <strong>Run Now</strong> to trigger manually for testing.
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b text-xs font-medium text-muted-foreground">
              <th className="px-3 py-2.5 text-left">Schedule</th>
              <th className="px-3 py-2.5 text-left">Report</th>
              <th className="px-3 py-2.5 text-left">Frequency</th>
              <th className="px-3 py-2.5 text-left">Format</th>
              <th className="px-3 py-2.5 text-left">Next Run</th>
              <th className="px-3 py-2.5 text-left">Last Run</th>
              <th className="px-3 py-2.5 text-left">Status</th>
              <th className="px-3 py-2.5 text-left">Active</th>
              <th className="px-3 py-2.5 text-left"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground text-xs">
                  Loading schedules...
                </td>
              </tr>
            )}
            {!isLoading && schedules.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground text-xs">
                  No report schedules configured yet.
                </td>
              </tr>
            )}
            {schedules.map((sched) => {
              const statusCfg = sched.last_status ? STATUS_CONFIG[sched.last_status] : null;
              const report = sched.report as { report_name_en?: string } | undefined;

              return (
                <tr key={sched.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-foreground leading-tight">{sched.schedule_name}</div>
                    {sched.recipient_to.length > 0 && (
                      <div className="text-[10px] text-muted-foreground truncate max-w-[180px]">
                        To: {sched.recipient_to.join(", ")}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    {report?.report_name_en ?? "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {sched.frequency}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant="secondary" className="text-[10px] uppercase font-mono">
                      {sched.output_format}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {sched.next_run_at
                      ? formatDistanceToNow(new Date(sched.next_run_at), { addSuffix: true })
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {sched.last_run_at
                      ? format(new Date(sched.last_run_at), "dd MMM HH:mm")
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    {statusCfg ? (
                      <div className={cn("flex items-center gap-1.5 text-xs", statusCfg.color)}>
                        <statusCfg.icon className="h-3.5 w-3.5" />
                        {statusCfg.label}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        Never run
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge
                      variant={sched.is_active ? "default" : "secondary"}
                      className="text-[10px]"
                    >
                      {sched.is_active ? "Active" : "Paused"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
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
                        size="icon-sm"
                        onClick={() => handleEdit(sched)}
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(sched.id)}
                        disabled={deletingId === sched.id}
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ReportScheduleForm
        open={showForm}
        onOpenChange={handleFormOpenChange}
        editing={editingSchedule}
        onSaved={load}
      />
    </div>
  );
}
