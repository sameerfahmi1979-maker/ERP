"use client";

import { useState, useEffect, useCallback } from "react";
import { format, formatDistanceToNow } from "date-fns";
import {
  History,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Mail,
  RefreshCw,
  Search,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { ReportDeliveryLogPanel } from "./report-delivery-log-page";

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
  report?: {
    report_name_en: string;
    module_code: string;
  };
  runner?: {
    full_name_en: string | null;
    email: string | null;
  };
}

const STATUS_CONFIG = {
  success: { label: "Success", icon: CheckCircle2, variant: "default" as const, color: "text-emerald-600" },
  failed: { label: "Failed", icon: XCircle, variant: "destructive" as const, color: "text-red-600" },
  cancelled: { label: "Cancelled", icon: AlertCircle, variant: "secondary" as const, color: "text-amber-600" },
  running: { label: "Running", icon: Clock, variant: "outline" as const, color: "text-blue-600" },
};

export function ReportHistoryPage() {
  const [runs, setRuns] = useState<ReportRun[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedRunId, setExpandedRunId] = useState<number | null>(null);

  const loadRuns = useCallback(async () => {
    setIsLoading(true);
    try {
      const db = createClient();
      const { data } = await db
        .from("erp_report_runs")
        .select(`
          *,
          report:erp_report_registry(report_name_en, module_code),
          runner:user_profiles!run_by(full_name_en, email)
        `)
        .order("started_at", { ascending: false })
        .limit(200);
      setRuns((data ?? []) as ReportRun[]);
    } catch (err) {
      console.error("[ReportHistoryPage] Load failed:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadRuns(); }, [loadRuns]);

  const filtered = runs.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.report_code.toLowerCase().includes(q) ||
      r.report?.report_name_en?.toLowerCase().includes(q) ||
      r.run_reference?.toLowerCase().includes(q) ||
      r.runner?.full_name_en?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Report History</h1>
          <Badge variant="secondary">{runs.length} runs</Badge>
        </div>
        <Button variant="outline" size="sm" onClick={loadRuns} disabled={isLoading}>
          <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", isLoading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by report, user, reference..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b text-xs font-medium text-muted-foreground">
              <th className="px-3 py-2.5 text-left w-6"></th>
              <th className="px-3 py-2.5 text-left">Report</th>
              <th className="px-3 py-2.5 text-left">Format</th>
              <th className="px-3 py-2.5 text-left">Status</th>
              <th className="px-3 py-2.5 text-left">Rows</th>
              <th className="px-3 py-2.5 text-left">Duration</th>
              <th className="px-3 py-2.5 text-left">Run By</th>
              <th className="px-3 py-2.5 text-left">Started</th>
              <th className="px-3 py-2.5 text-left">Flags</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground text-xs">
                  Loading history...
                </td>
              </tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground text-xs">
                  No report runs found.
                </td>
              </tr>
            )}
            {filtered.map((run) => {
              const status = STATUS_CONFIG[run.run_status] ?? STATUS_CONFIG.failed;
              const StatusIcon = status.icon;
              const isExpanded = expandedRunId === run.id;

              return (
                <>
                  <tr
                    key={run.id}
                    className={cn(
                      "border-b last:border-0 hover:bg-muted/20 cursor-pointer transition-colors",
                      isExpanded && "bg-muted/10"
                    )}
                    onClick={() => setExpandedRunId(isExpanded ? null : run.id)}
                  >
                    <td className="px-3 py-2.5">
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-foreground leading-tight">
                        {run.report?.report_name_en ?? run.report_code}
                      </div>
                      <div className="text-[10px] font-mono text-muted-foreground">
                        {run.run_reference ?? run.report_code}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge variant="outline" className="text-[10px] font-mono uppercase">
                        {run.output_format}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className={cn("flex items-center gap-1.5", status.color)}>
                        <StatusIcon className="h-3.5 w-3.5" />
                        <span className="text-xs">{status.label}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {run.row_count != null ? run.row_count.toLocaleString() : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {run.duration_ms != null
                        ? run.duration_ms < 1000
                          ? `${run.duration_ms}ms`
                          : `${(run.duration_ms / 1000).toFixed(1)}s`
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground text-xs">
                      {run.runner?.full_name_en ?? run.runner?.email ?? String(run.run_by)}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground text-xs">
                      <span title={run.started_at}>
                        {formatDistanceToNow(new Date(run.started_at), { addSuffix: true })}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        {run.sensitive_data_included && (
                          <Badge variant="destructive" className="text-[10px] px-1">Sensitive</Badge>
                        )}
                        {run.was_multi_company && (
                          <Badge variant="outline" className="text-[10px] px-1">Multi-Co</Badge>
                        )}
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${run.id}-expanded`} className="bg-muted/5 border-b">
                      <td colSpan={9} className="px-6 py-4">
                        <RunDetailPanel run={run} />
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RunDetailPanel({ run }: { run: ReportRun }) {
  const redactionSummary = run.redaction_summary_json as {
    wasRedacted?: boolean;
    totalFieldsRedacted?: number;
    redactedFields?: Array<{ field: string; action: string; reason: string }>;
  } | null;

  return (
    <div className="grid grid-cols-12 gap-4 text-sm">
      <div className="col-span-4 space-y-2">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Run Details</div>
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Reference</span>
            <span className="font-mono">{run.run_reference ?? "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Started</span>
            <span>{format(new Date(run.started_at), "dd MMM yyyy HH:mm:ss")}</span>
          </div>
          {run.completed_at && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Completed</span>
              <span>{format(new Date(run.completed_at), "dd MMM yyyy HH:mm:ss")}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Template manually selected</span>
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
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Redaction</div>
        {redactionSummary?.wasRedacted ? (
          <div className="space-y-1 text-xs">
            <div className="text-amber-700">
              {redactionSummary.totalFieldsRedacted} field(s) redacted
            </div>
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
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Email Deliveries
        </div>
        <ReportDeliveryLogPanel runId={run.id} />
      </div>
    </div>
  );
}
