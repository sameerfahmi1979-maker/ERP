"use client";

import { useState, useCallback } from "react";
import { RefreshCw, LayoutDashboard, ShieldAlert } from "lucide-react";
import type { DailyDashboardScope, DailyDashboardSummary } from "@/lib/ai/common/dashboard/types";
import { getAiDailyDashboard } from "@/server/actions/ai/common/dashboard";
import { DashboardScopeSelector } from "./dashboard-scope-selector";
import { DashboardKpiCardComponent } from "./dashboard-kpi-card";
import { DashboardSectionCard } from "./dashboard-section-card";
import { DashboardLoadingSkeleton } from "./dashboard-loading-skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Props {
  initialData: DailyDashboardSummary | null;
}

export function AiDailyDashboardPageClient({ initialData }: Props) {
  const [scope, setScope] = useState<DailyDashboardScope>(initialData?.scope ?? "today");
  const [data, setData] = useState<DailyDashboardSummary | null>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (newScope: DailyDashboardScope) => {
    setLoading(true);
    setError(null);
    try {
      const result = await getAiDailyDashboard({ scope: newScope });
      if (result.success && result.data) {
        setData(result.data);
      } else {
        setError(result.error ?? "Failed to load dashboard.");
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleScopeChange = (newScope: DailyDashboardScope) => {
    setScope(newScope);
    void load(newScope);
  };

  const handleRefresh = () => {
    void load(scope);
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900">
            <LayoutDashboard className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              AI Daily Dashboard
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Read-only aggregation • Existing ERP scope only • No actions
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-xs text-slate-500 border-slate-300">
            <ShieldAlert className="h-3 w-3 mr-1" />
            Read-only
          </Badge>
          <DashboardScopeSelector scope={scope} onChange={handleScopeChange} disabled={loading} />
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading} className="h-8 text-xs gap-1">
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Generated at */}
      {data?.generatedAt && (
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Generated at {new Date(data.generatedAt).toLocaleString()}
        </p>
      )}

      {/* Warnings */}
      {(data?.warnings ?? []).length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3 text-xs text-amber-700 dark:text-amber-400 space-y-1">
          {data!.warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && !data && <DashboardLoadingSkeleton />}

      {/* Top KPIs */}
      {!loading && data && data.kpis.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
            Critical Alerts
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {data.kpis.map((kpi, i) => (
              <DashboardKpiCardComponent key={i} card={kpi} />
            ))}
          </div>
        </div>
      )}

      {/* Sections */}
      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {data.sections.map((section) => (
            <DashboardSectionCard key={section.code} section={section} />
          ))}
        </div>
      )}
    </div>
  );
}
