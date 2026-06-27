"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, MinusCircle, Hash, Coins, DollarSign } from "lucide-react";
import { getDmsAiObservabilityOverview, type ObservabilityFilters, type UsageOverviewData } from "@/server/actions/dms/ai-observability";

interface Props {
  filters: ObservabilityFilters;
  refreshKey: number;
}

function StatCard({ label, value, icon, sub, warn }: { label: string; value: string | number; icon: React.ReactNode; sub?: string; warn?: boolean }) {
  return (
    <div className={`rounded-lg border bg-card p-4 flex gap-3 ${warn ? "border-destructive/40" : ""}`}>
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold tracking-tight">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function AiUsageOverviewCards({ filters, refreshKey }: Props) {
  const [data, setData] = useState<UsageOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getDmsAiObservabilityOverview(filters)
      .then((res) => {
        if (res.success && res.data) setData(res.data);
        else setError(res.error ?? "Failed to load.");
      })
      .catch(() => setError("Failed to load overview."))
      .finally(() => setLoading(false));
  }, [filters, refreshKey]);

  if (loading) return <div className="text-sm text-muted-foreground">Loading overview...</div>;
  if (error) return <div className="text-sm text-destructive">{error}</div>;
  if (!data) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
      <StatCard label="Total Calls" value={fmt(data.totalLogs)} icon={<Hash className="h-5 w-5" />} />
      <StatCard label="Success" value={fmt(data.successCount)} icon={<CheckCircle2 className="h-5 w-5 text-green-600" />} />
      <StatCard label="Failed" value={fmt(data.failedCount)} icon={<XCircle className="h-5 w-5 text-destructive" />} warn={data.failedCount > 0} />
      <StatCard label="Skipped" value={fmt(data.skippedCount)} icon={<MinusCircle className="h-5 w-5" />} />
      <StatCard
        label="Input Tokens"
        value={fmt(data.totalInputTokens)}
        icon={<Coins className="h-5 w-5" />}
        sub={data.totalOutputTokens > 0 ? `+ ${fmt(data.totalOutputTokens)} out` : undefined}
      />
      <StatCard
        label="Est. Cost"
        value={data.costDataAvailable && data.totalEstimatedCost !== null
          ? `$${data.totalEstimatedCost.toFixed(4)}`
          : "—"}
        icon={<DollarSign className="h-5 w-5" />}
        sub={!data.costDataAvailable ? "Rates unconfirmed" : undefined}
      />
    </div>
  );
}
