"use client";

import { useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { getDmsDashboardStats } from "@/server/actions/dms/dashboard";
import type { DmsDashboardStats } from "@/server/actions/dms/dashboard";
import { useRealtimeSync } from "@/hooks/realtime/use-realtime-sync";
import { invalidateDmsDashboard } from "@/lib/query/invalidation";
import { queryKeys } from "@/lib/query/query-keys";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { RefreshCw, FolderKanban, TrendingUp, PieChart, Bot, CalendarClock, BellRing } from "lucide-react";
import { DmsKpiCards } from "./dms-kpi-cards";
import { DmsDocumentsOverTimeChart } from "./dms-documents-over-time-chart";
import { DmsCategoryBarChart } from "./dms-category-bar-chart";
import { DmsAiPipelineChart } from "./dms-ai-pipeline-chart";
import { DmsExpiryTimelineChart } from "./dms-expiry-timeline-chart";
import { DmsInboxPanel, DmsExpiringPanel, DmsRenewalsPanel } from "./dms-action-panels";

type RangeDays = 7 | 30 | 90;

const RANGE_OPTIONS: { label: string; value: RangeDays }[] = [
  { label: "7d", value: 7 },
  { label: "30d", value: 30 },
  { label: "90d", value: 90 },
];

type Props = {
  initialStats: DmsDashboardStats;
};

export function DmsDashboardPageClient({ initialStats }: Props) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [rangeDays, setRangeDays] = useState<RangeDays>(30);
  const [, startTransition] = useTransition();

  const { data: stats, isLoading } = useQuery({
    queryKey: queryKeys.dms.dashboard(rangeDays),
    queryFn: async () => {
      const res = await getDmsDashboardStats(rangeDays);
      if (!res.success || !res.data) throw new Error(res.error ?? "Failed");
      return res.data;
    },
    initialData: rangeDays === 30 ? initialStats : undefined,
    staleTime: 60_000,
  });

  // ERP REALTIME.1D — auto-refresh dashboard when DMS data changes
  useRealtimeSync({
    table: "dms_documents",
    event: "*",
    debounceMs: 800,
    onEvent: () => {
      invalidateDmsDashboard(queryClient);
    },
  });
  useRealtimeSync({
    table: "dms_upload_sessions",
    event: "*",
    debounceMs: 600,
    onEvent: () => {
      invalidateDmsDashboard(queryClient);
    },
  });

  function handleManualRefresh() {
    invalidateDmsDashboard(queryClient);
    startTransition(() => router.refresh());
  }

  const s = stats ?? initialStats;

  // Derived, honest insights computed from data already on the page — no extra queries.
  const topCategory = [...s.documents_by_category].sort((a, b) => b.count - a.count)[0];
  const topCategoryPct =
    topCategory && s.total_documents > 0
      ? Math.round((topCategory.count / s.total_documents) * 100)
      : null;

  const aiComplete = s.ai_pipeline.find((p) => p.status === "ai_complete")?.count ?? 0;
  const aiCompletePct =
    s.total_documents > 0 ? Math.round((aiComplete / s.total_documents) * 100) : null;

  const attentionCount = s.inbox_items.length + s.expiring_items.length + s.renewal_items.length;

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FolderKanban className="h-[18px] w-[18px]" />
          </span>
          <div>
            <h1 className="text-lg font-semibold leading-tight">DMS Dashboard</h1>
            <p className="text-xs text-muted-foreground">
              Live overview of intake, AI processing, and expiry compliance
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Date range toggle */}
          <div className="flex rounded-lg border bg-muted/30 p-0.5 gap-0.5">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setRangeDays(opt.value)}
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-medium transition-all",
                  rangeDays === opt.value
                    ? "bg-background shadow text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleManualRefresh}
            title="Refresh dashboard"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Zone 1 — KPI Cards */}
      <DmsKpiCards stats={s} sparklineData={s.documents_by_day} />

      {/* Section label */}
      <div className="flex items-center gap-2 pt-1">
        <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Analytics
        </h2>
      </div>

      {/* Zone 2 — Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-3.5 w-3.5 text-blue-500" />
              <CardTitle className="text-sm font-semibold">Documents Added Over Time</CardTitle>
            </div>
            <p className="text-[11px] text-muted-foreground pl-[22px]">
              {s.added_this_month.toLocaleString()} added in the current month
            </p>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {isLoading ? (
              <Skeleton className="h-48 w-full rounded-lg" />
            ) : (
              <DmsDocumentsOverTimeChart
                data={s.documents_by_day}
                rangeDays={rangeDays}
              />
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center gap-2">
              <PieChart className="h-3.5 w-3.5 text-violet-500" />
              <CardTitle className="text-sm font-semibold">Documents by Category</CardTitle>
            </div>
            <p className="text-[11px] text-muted-foreground pl-[22px]">
              {topCategory && topCategoryPct != null
                ? `${topCategory.name} is your largest category (${topCategoryPct}%)`
                : "No category data available"}
            </p>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {isLoading ? (
              <Skeleton className="h-48 w-full rounded-lg" />
            ) : s.documents_by_category.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">
                No category data available
              </div>
            ) : (
              <DmsCategoryBarChart data={s.documents_by_category} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Zone 3 — Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center gap-2">
              <Bot className="h-3.5 w-3.5 text-emerald-500" />
              <CardTitle className="text-sm font-semibold">AI Pipeline Status</CardTitle>
            </div>
            <p className="text-[11px] text-muted-foreground pl-[22px]">
              {aiCompletePct != null
                ? `${aiCompletePct}% of documents fully AI-processed`
                : "No AI pipeline data"}
            </p>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {isLoading ? (
              <Skeleton className="h-48 w-full rounded-lg" />
            ) : s.ai_pipeline.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">
                No AI pipeline data
              </div>
            ) : (
              <DmsAiPipelineChart
                data={s.ai_pipeline}
                total={s.total_documents}
              />
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-3.5 w-3.5 text-amber-500" />
              <CardTitle className="text-sm font-semibold">Expiry Timeline</CardTitle>
            </div>
            <p className="text-[11px] text-muted-foreground pl-[22px]">
              {s.expiring_30_days > 0
                ? `${s.expiring_30_days} document${s.expiring_30_days === 1 ? "" : "s"} expiring within 30 days`
                : "Nothing expiring within 30 days"}
            </p>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {isLoading ? (
              <Skeleton className="h-48 w-full rounded-lg" />
            ) : (
              <DmsExpiryTimelineChart data={s.expiry_buckets} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Section label */}
      <div className="flex items-center gap-2 pt-1">
        <BellRing className="h-3.5 w-3.5 text-muted-foreground" />
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Needs Your Attention
        </h2>
        {attentionCount > 0 && (
          <span className="text-[11px] text-muted-foreground">
            · {attentionCount} item{attentionCount === 1 ? "" : "s"} across inbox, expiry, and renewals
          </span>
        )}
      </div>

      {/* Zone 4 — Action panels */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 min-h-[220px]">
        <DmsInboxPanel items={s.inbox_items} />
        <DmsExpiringPanel items={s.expiring_items} />
        <DmsRenewalsPanel items={s.renewal_items} />
      </div>
    </div>
  );
}
