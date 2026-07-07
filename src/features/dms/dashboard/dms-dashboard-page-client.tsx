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
import { RefreshCw, LayoutDashboard } from "lucide-react";
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

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <LayoutDashboard className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">DMS Dashboard</h1>
          <span className="text-sm text-muted-foreground hidden sm:inline">
            · Overview of your document management system
          </span>
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
      <DmsKpiCards stats={s} />

      {/* Zone 2 — Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold">Documents Added Over Time</CardTitle>
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
            <CardTitle className="text-sm font-semibold">Documents by Category</CardTitle>
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
            <CardTitle className="text-sm font-semibold">AI Pipeline Status</CardTitle>
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
            <CardTitle className="text-sm font-semibold">Expiry Timeline</CardTitle>
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

      {/* Zone 4 — Action panels */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 min-h-[220px]">
        <DmsInboxPanel items={s.inbox_items} />
        <DmsExpiringPanel items={s.expiring_items} />
        <DmsRenewalsPanel items={s.renewal_items} />
      </div>
    </div>
  );
}
