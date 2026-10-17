import "server-only";
import { headers } from "next/headers";
import { hasTraceScope, PERF_HEADER, PERF_ROUTE_HEADER, traceOperation, tracingEnabled, type PerfOperation } from "./trace";

export async function traceRequest<T>(operation: PerfOperation, work: () => Promise<T>): Promise<T> {
  if (!tracingEnabled() || hasTraceScope()) return traceOperation(operation, work);
  let correlation: string | null = null;
  let route = "other";
  try { const requestHeaders = await headers(); correlation = requestHeaders.get(PERF_HEADER); route = requestHeaders.get(PERF_ROUTE_HEADER) ?? "other"; } catch { /* Non-HTTP/isolated contexts receive a fresh ID. */ }
  return traceOperation(operation, work, correlation, route);
}
