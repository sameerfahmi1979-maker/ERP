/**
 * TanStack Query client factory
 * Phase 002F.3E.3B.6B — Global Lookup Cache and Hook Standard
 *
 * Creates a singleton QueryClient on the browser; creates a fresh one per request
 * on the server (Next.js App Router pattern).
 *
 * Default options target stable ERP master-data:
 *   staleTime  5 min  — lookup categories / geography don't change often
 *   gcTime    30 min  — keep in memory across drawer open/close cycles
 *   refetchOnWindowFocus false — master data doesn't need re-validation on focus
 *   retry      1      — one retry on transient network errors
 */

import { QueryClient } from "@tanstack/react-query";

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined = undefined;

export function getQueryClient(): QueryClient {
  if (typeof window === "undefined") {
    // Server: always fresh
    return makeQueryClient();
  }
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}
