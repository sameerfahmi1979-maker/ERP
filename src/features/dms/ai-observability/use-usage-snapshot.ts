"use client";
import { useQuery } from "@tanstack/react-query";
import { getDmsAiUsageSnapshot, type ObservabilityFilters } from "@/server/actions/dms/ai-observability";
import type { UsageSnapshot } from "@/lib/ai/observability/usage-summary";

/** Six panels share one request, but each observer retains its normal retry/error boundary.
 * QueryClient is retired by the existing account-switch privacy boundary. No persisted data. */
export function useUsageSnapshot<K extends keyof UsageSnapshot>(section: K, filters: ObservabilityFilters, refreshKey: number) {
  return useQuery({
    queryKey: ["dms-observability", "usage-snapshot", filters, refreshKey],
    queryFn: async () => {
      const result = await getDmsAiUsageSnapshot(filters);
      if (!result.success || !result.data) throw new Error(result.error ?? "Usage metrics could not be verified.");
      return result.data;
    },
    select: (data: UsageSnapshot) => data[section],
    retry: false, gcTime: 0, refetchOnWindowFocus: false,
  });
}
