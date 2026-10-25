import { APPLICATION_ROUTE_PATTERNS } from "./route-patterns";

export type DiagnosticKind = "cancelled" | "timeout" | "dom" | "hydration" | "dependency" | "unexpected";
const patterns = APPLICATION_ROUTE_PATTERNS.map(route => ({ route, parts: route.split("/").filter(Boolean) }));
/** Return a checked source template; never log an actual record id, query, fragment or unknown path. */
export function diagnosticRoute(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) return "unknown";
  const parts = path.split(/[?#]/,1)[0].split("/").filter(Boolean);
  for (const entry of patterns) {
    if (entry.parts.length === parts.length && entry.parts.every((part,i) => part === parts[i] || /^\[[^\]]+\]$/.test(part))) return entry.route;
  }
  return "unknown";
}
export function diagnosticKind(error: unknown): DiagnosticKind {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (name === "AbortError" || /ResponseAborted|response was aborted/i.test(message)) return "cancelled";
  if (name === "TimeoutError" || /timeout|timed out/i.test(message)) return "timeout";
  if (/parentNode|removeChild|insertBefore/i.test(message)) return "dom";
  if (/hydrat|React error #4(?:18|23|25)/i.test(message)) return "hydration";
  if (/fetch failed|connection|unavailable/i.test(message)) return "dependency";
  return "unexpected";
}
let sequence = 0;
let minute = 0;
let admitted = 0;
/** Bounded, allowlisted diagnostics only. No Error/stack/headers/payload are emitted. */
export function reportSafeDiagnostic(error: unknown, context: { route: string; source: "server" | "client" | "dashboard"; event?: string; build?: string }) {
  const reference = `MON-${crypto.randomUUID().replaceAll("-", "").slice(0,12).toUpperCase()}`;
  const now = Date.now();
  if (now - minute >= 60_000 || now < minute) { minute = now; admitted = 0; }
  if (admitted++ < 60) {
    const kind = diagnosticKind(error);
    const digest = error && typeof error === "object" && "digest" in error && /^\d{1,20}$/.test(String(error.digest)) ? String(error.digest) : undefined;
    const candidateBuild = context.build ?? process.env.NEXT_PUBLIC_ALGT_BUILD_COMMIT;
    const build = candidateBuild && /^[a-f\d]{7,64}$/i.test(candidateBuild) ? candidateBuild : "unavailable";
    const event = context.event && /^[A-Z][A-Z0-9_]{0,63}$/.test(context.event) ? context.event : "RUNTIME_ERROR";
    const record = { event, reference, sequence: ++sequence, source: context.source, route: diagnosticRoute(context.route), build, kind, digest };
    console[kind === "cancelled" ? "info" : "error"](JSON.stringify(record));
  }
  return reference;
}
