"use client";

import { useEffect, useState } from "react";
import { getDmsAiCostBreakdown, type ObservabilityFilters, type TokenCostSummaryRow } from "@/server/actions/dms/ai-observability";
import { Badge } from "@/components/ui/badge";

interface Props {
  filters: ObservabilityFilters;
  refreshKey: number;
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function AiTokenCostSummary({ filters, refreshKey }: Props) {
  const [data, setData] = useState<TokenCostSummaryRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getDmsAiCostBreakdown(filters)
      .then((res) => {
        if (res.success && res.data) setData(res.data);
        else setError(res.error ?? "Failed to load.");
      })
      .catch(() => setError("Failed to load cost summary."))
      .finally(() => setLoading(false));
  }, [filters, refreshKey]);

  if (loading) return <div className="text-sm text-muted-foreground">Loading cost summary...</div>;
  if (error) return <div className="text-sm text-destructive">{error}</div>;
  if (!data || data.length === 0) return <div className="text-sm text-muted-foreground">No usage data available for selected filters.</div>;

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/50">
          <tr>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Feature</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Operation</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">Calls</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">Success</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">Failed</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">In Tokens</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">Out Tokens</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">Est. Cost</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
              <td className="px-3 py-2 font-mono text-xs">{row.featureArea}</td>
              <td className="px-3 py-2 text-xs text-muted-foreground">{row.operationType}</td>
              <td className="px-3 py-2 text-right tabular-nums">{row.totalCalls}</td>
              <td className="px-3 py-2 text-right tabular-nums text-green-700">{row.successCalls}</td>
              <td className="px-3 py-2 text-right tabular-nums text-destructive">{row.failedCalls}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmt(row.totalInputTokens)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmt(row.totalOutputTokens)}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {row.estimatedCost !== null
                  ? `$${row.estimatedCost.toFixed(4)}`
                  : <Badge variant="outline" className="text-xs">Unconfirmed</Badge>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
