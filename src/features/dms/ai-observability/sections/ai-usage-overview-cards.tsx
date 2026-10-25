"use client";
import { QueryReadBoundary } from "@/components/erp/query-read-boundary";

import { type ObservabilityFilters } from "@/server/actions/dms/ai-observability";
import { useUsageSnapshot } from "../use-usage-snapshot";
import { CheckCircle2, Coins, DollarSign, Hash, MinusCircle, XCircle } from "lucide-react";

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

function fmt(n: number | null) {
  if (n === null) return "Unknown";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function AiUsageOverviewCards({ filters, refreshKey }: Props) {
  const uiRead1 = useUsageSnapshot("overview", filters, refreshKey);
 const { data, isPending: loading, error: queryError } = uiRead1;
  const error = queryError?.message;

  if (loading) return <QueryReadBoundary queries={[uiRead1]}><div className="text-sm text-muted-foreground">Loading overview...</div></QueryReadBoundary>;
  if (error) return <QueryReadBoundary queries={[uiRead1]}><div className="text-sm text-destructive">{error}</div></QueryReadBoundary>;
  if (!data) return null;

  return (
    <QueryReadBoundary queries={[uiRead1]}><p className="text-xs text-muted-foreground mb-2">Verified matching usage through {new Date(data.asOf).toLocaleString()}. Unknown tokens or costs remain unavailable.</p><div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
      <StatCard label="Total Calls" value={fmt(data.totalLogs)} icon={<Hash className="h-5 w-5" />} />
      <StatCard label="Success" value={fmt(data.successCount)} icon={<CheckCircle2 className="h-5 w-5 text-green-600" />} />
      <StatCard label="Failed" value={fmt(data.failedCount)} icon={<XCircle className="h-5 w-5 text-destructive" />} warn={data.failedCount > 0} />
      <StatCard label="Skipped" sub={data.otherCount ? `${data.otherCount} other or unknown outcomes` : undefined} value={fmt(data.skippedCount)} icon={<MinusCircle className="h-5 w-5" />} />
      <StatCard
        label="Input Tokens"
        value={fmt(data.totalInputTokens)}
        icon={<Coins className="h-5 w-5" />}
        sub={data.totalOutputTokens !== null && data.totalOutputTokens > 0 ? `+ ${fmt(data.totalOutputTokens)} out` : undefined}
      />
      <StatCard
        label="Est. Cost"
        value={data.costDataAvailable && data.totalEstimatedCost !== null
          ? `$${data.totalEstimatedCost.toFixed(4)}`
          : "—"}
        icon={<DollarSign className="h-5 w-5" />}
        sub={!data.costDataAvailable ? `${data.costKnownCount} of ${data.totalLogs} calls have cost evidence` : "Recorded estimates; not an invoice"}
      />
    </div></QueryReadBoundary>
  );
}
