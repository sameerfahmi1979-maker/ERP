"use client";

import { useEffect, useState } from "react";
import { getDmsAiRecentUsageEvents, type ObservabilityFilters, type RecentUsageEventRow } from "@/server/actions/dms/ai-observability";
import { Badge } from "@/components/ui/badge";

interface Props {
  filters: ObservabilityFilters;
  refreshKey: number;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  success: "default",
  failed: "destructive",
  skipped: "secondary",
};

export function AiRecentUsageEventsTable({ filters, refreshKey }: Props) {
  const [data, setData] = useState<RecentUsageEventRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getDmsAiRecentUsageEvents(filters)
      .then((res) => {
        if (res.success && res.data) setData(res.data);
        else setError(res.error ?? "Failed to load.");
      })
      .catch(() => setError("Failed to load recent events."))
      .finally(() => setLoading(false));
  }, [filters, refreshKey]);

  if (loading) return <div className="text-sm text-muted-foreground">Loading recent events...</div>;
  if (error) return <div className="text-sm text-destructive">{error}</div>;
  if (!data || data.length === 0) return <div className="text-sm text-muted-foreground">No usage events found.</div>;

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-xs">
        <thead className="border-b bg-muted/50">
          <tr>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Time</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Feature</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Operation</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Model</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">In Tok</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">Out Tok</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">Cost</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">Doc</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">ms</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.id} className="border-b last:border-0 hover:bg-muted/30">
              <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">
                {new Date(row.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </td>
              <td className="px-3 py-1.5 font-mono">{row.featureArea}</td>
              <td className="px-3 py-1.5 text-muted-foreground">{row.operationType}</td>
              <td className="px-3 py-1.5 font-mono">{row.modelId ?? "—"}</td>
              <td className="px-3 py-1.5">
                <Badge variant={STATUS_VARIANT[row.status] ?? "outline"} className="text-xs">{row.status}</Badge>
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">{row.inputTokenCount ?? "—"}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{row.outputTokenCount ?? "—"}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">
                {row.estimatedCost !== null ? `$${row.estimatedCost.toFixed(5)}` : "—"}
              </td>
              <td className="px-3 py-1.5 text-right text-muted-foreground">{row.documentId ?? "—"}</td>
              <td className="px-3 py-1.5 text-right text-muted-foreground">{row.durationMs ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-3 py-2 text-xs text-muted-foreground border-t bg-muted/20">
        Showing up to 100 recent events. No prompt, response, or content text is displayed.
      </p>
    </div>
  );
}
