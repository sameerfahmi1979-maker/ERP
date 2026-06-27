"use client";

import { useState, useCallback } from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ObservabilityConfig, ObservabilityFilters } from "@/server/actions/dms/ai-observability";
import { AiObservabilityFilters } from "./ai-observability-filters";
import { AiUsageOverviewCards } from "./sections/ai-usage-overview-cards";
import { AiTokenCostSummary } from "./sections/ai-token-cost-summary";
import { AiProviderModelBreakdown } from "./sections/ai-provider-model-breakdown";
import { AiFeatureBreakdown } from "./sections/ai-feature-breakdown";
import { AiJobQueueHealth } from "./sections/ai-job-queue-health";
import { AiPipelineHealth } from "./sections/ai-pipeline-health";
import { AiRecentUsageEventsTable } from "./sections/ai-recent-usage-events-table";
import { AiErrorBreakdown } from "./sections/ai-error-breakdown";
import { AiCostRateAdmin } from "./ai-cost-rate-admin";

interface Props {
  config: ObservabilityConfig;
}

export function DmsAiObservabilityPageClient({ config }: Props) {
  const [filters, setFilters] = useState<ObservabilityFilters>({});
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  if (!config.hasViewPermission) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <h2 className="text-lg font-semibold">Access Denied</h2>
        <p className="text-muted-foreground text-sm">
          You do not have permission to view DMS AI Observability.
        </p>
      </div>
    );
  }

  if (!config.featureFlagEnabled) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-center px-8">
        <div className="rounded-full bg-muted p-4">
          <AlertTriangle className="h-8 w-8 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-semibold mb-1">DMS AI Observability is not enabled</h2>
          <p className="text-muted-foreground text-sm max-w-md">
            The <strong>DMS_AI_OBSERVABILITY</strong> feature flag is currently disabled.
            Enable it in Administration → Settings → AI Settings (Feature Flags) to access
            the AI usage, token, cost, and pipeline observability dashboard.
          </p>
        </div>
        <Badge variant="secondary" className="text-xs">Feature Flag: DMS_AI_OBSERVABILITY = false</Badge>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 px-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">DMS AI Observability</h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI usage, token consumption, cost estimates, queue health, and pipeline status.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <AiObservabilityFilters filters={filters} onChange={setFilters} />

      {/* Usage Overview */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          AI Usage Overview
        </h2>
        <AiUsageOverviewCards filters={filters} refreshKey={refreshKey} />
      </section>

      {/* Token & Cost Summary */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Token &amp; Cost Summary
        </h2>
        <AiTokenCostSummary filters={filters} refreshKey={refreshKey} />
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Provider / Model Breakdown */}
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Provider / Model Breakdown
          </h2>
          <AiProviderModelBreakdown filters={filters} refreshKey={refreshKey} />
        </section>

        {/* Feature / Operation Breakdown */}
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Feature / Operation Breakdown
          </h2>
          <AiFeatureBreakdown filters={filters} refreshKey={refreshKey} />
        </section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Queue Health */}
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            DMS AI Queue Health
          </h2>
          <AiJobQueueHealth refreshKey={refreshKey} />
        </section>

        {/* Pipeline Health */}
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            DMS AI Pipeline Health
          </h2>
          <AiPipelineHealth refreshKey={refreshKey} />
        </section>
      </div>

      {/* Recent Usage Events */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Recent Usage Events
        </h2>
        <AiRecentUsageEventsTable filters={filters} refreshKey={refreshKey} />
      </section>

      {/* Error Breakdown */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Error / Failure Analysis
        </h2>
        <AiErrorBreakdown filters={filters} refreshKey={refreshKey} />
      </section>

      {/* Cost Rate Admin (admin only) */}
      {config.hasAdminPermission && (
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Cost Rate Configuration
          </h2>
          <AiCostRateAdmin refreshKey={refreshKey} />
        </section>
      )}
    </div>
  );
}
