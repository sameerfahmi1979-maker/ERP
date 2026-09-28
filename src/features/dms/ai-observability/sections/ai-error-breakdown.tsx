"use client";

import { getDmsAiErrorBreakdown, type ObservabilityFilters } from "@/server/actions/dms/ai-observability";
import { useQuery } from "@tanstack/react-query";

interface Props {
  filters: ObservabilityFilters;
  refreshKey: number;
}

export function AiErrorBreakdown({ filters, refreshKey }: Props) {
  const { data, isPending: loading, error: queryError } = useQuery({
    queryKey: ["dms-observability", "getDmsAiErrorBreakdown", filters, refreshKey],
    queryFn: async () => {
      const result = await getDmsAiErrorBreakdown(filters);
      if (!result.success || !result.data) throw new Error(result.error ?? "Failed to load.");
      return result.data;
    },
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const error = queryError?.message;

  if (loading) return <div className="text-sm text-muted-foreground">Loading error analysis...</div>;
  if (error) return <div className="text-sm text-destructive">{error}</div>;
  if (!data || data.length === 0) return <div className="text-sm text-muted-foreground text-green-600">No errors in selected period.</div>;

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/50">
          <tr>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Error (capped 200 chars)</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Feature</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Operation</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">Count</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Last Seen</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
              <td className="px-3 py-2 max-w-[300px] truncate text-xs font-mono text-destructive">
                {row.errorMessage}
              </td>
              <td className="px-3 py-2 text-xs">{row.featureArea}</td>
              <td className="px-3 py-2 text-xs text-muted-foreground">{row.operationType}</td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold">{row.count}</td>
              <td className="px-3 py-2 text-xs text-muted-foreground">
                {new Date(row.lastSeen).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
