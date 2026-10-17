import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { releaseResponse, skipsSessionRefresh } from "@/lib/release/maintenance";
import { randomUUID } from "node:crypto";
import { PERF_HEADER, PERF_ROUTE_HEADER, performanceRoute, traceOperation, tracingEnabled } from "@/lib/performance/trace";

export async function proxy(request: NextRequest) {
  // Discard client-supplied correlation; it is never an identity/authorization signal.
  request.headers.delete(PERF_HEADER);
  request.headers.delete(PERF_ROUTE_HEADER);
  const correlation = tracingEnabled() ? randomUUID() : undefined;
  if (correlation) { request.headers.set(PERF_HEADER, correlation); request.headers.set(PERF_ROUTE_HEADER, performanceRoute(request.nextUrl.pathname)); }
  return traceOperation("proxy", () => proxyImpl(request), correlation, performanceRoute(request.nextUrl.pathname));
}

async function proxyImpl(request: NextRequest) {
  const release = releaseResponse(request);
  if (release) return release;
  if (skipsSessionRefresh(request.nextUrl.pathname)) return NextResponse.next();
  return updateSession(request);
}

export const config = {
  matcher: [
    "/:path*",
  ],
};
