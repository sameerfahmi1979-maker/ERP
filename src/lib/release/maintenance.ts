import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextResponse, type NextRequest } from "next/server";

export const RELEASE_HEALTH_PATH = "/api/health/release";
const STARTUP_HEALTH_PATH = "/api/health/ready";

// Server-runtime setting only. Unexpected explicit values fail closed.
export function maintenanceEnabled(value = process.env.ERP_MAINTENANCE_MODE): boolean {
  return value !== undefined && value !== "0";
}

/** Liveness only: never queries Auth or business data and is not a release-readiness proof. */
export function releaseResponse(request: NextRequest): NextResponse | null {
  const active = maintenanceEnabled();
  const headers = { "Cache-Control": "private, no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
  if (request.nextUrl.pathname === RELEASE_HEALTH_PATH && ["GET", "HEAD"].includes(request.method)) {
    return new NextResponse(request.method === "HEAD" ? null : JSON.stringify({ service: "algt-erp", status: active ? "maintenance" : "ok", check: "liveness-only" }),
      { status: 200, headers: { ...headers, "Content-Type": "application/json" } });
  }
  if (request.nextUrl.pathname === STARTUP_HEALTH_PATH && ["GET", "HEAD"].includes(request.method)) return null;
  if (!active) return null;
  const html = request.method === "GET" && !request.nextUrl.pathname.startsWith("/api/") && request.headers.get("accept")?.includes("text/html");
  const body = request.method === "HEAD" ? null : html
    ? readFileSync(join(process.cwd(), "public", "maintenance.html"), "utf8")
    : JSON.stringify({ error: "maintenance", message: "ALGT ERP is temporarily unavailable for a planned update. Please try again shortly." });
  return new NextResponse(body, { status: 503, headers: { ...headers, "Retry-After": "120", "Content-Type": html ? "text/html; charset=utf-8" : "application/json", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'" } });
}

/** Preserve previous refresh exclusions only after the maintenance gate runs. */
export function skipsSessionRefresh(pathname: string, method?: string): boolean {
  if (method === "POST" && pathname === "/api/internal/communications/worker-launch") return true;
  if (method === "POST" && pathname === "/api/internal/communications/supervisor-launch") return true;
  if (method === "POST" && pathname === "/api/internal/communications/refresh-baseline") return true;
  if (method === "POST" && pathname === "/api/internal/communications/notification-tick") return true;
  return pathname === STARTUP_HEALTH_PATH || pathname === "/api/mobile/dms/v1" || pathname === "/api/mobile/dms/shared" || pathname === "/.well-known/assetlinks.json" || pathname === "/api/mobile/hr/v1" || /^\/(?:_next\/static|_next\/image|favicon\.ico)/.test(pathname) || /\.(?:svg|png|jpg|jpeg|gif|webp)$/.test(pathname);
}
