import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

const operations = ["proxy", "auth.context", "auth.session", "auth.permissions", "employees.list", "departments.list", "departments.lookup", "documents.list", "session.route", "response.json"] as const;
export type PerfOperation = typeof operations[number];
type Span = { name: string; ms: number; offsetMs: number; outcome: "ok" | "error"; status?: number; retry?: number; contentLength?: number | null };
type Trace = { id: string; operation: PerfOperation; started: number; spans: Span[]; dropped: number; closed: boolean };
const scope = new AsyncLocalStorage<Trace | null>();
let windowStart = 0;
let admitted = 0;
const MAX_SPANS = 128;
export const PERF_HEADER = "x-algt-perf-correlation";
export const PERF_ROUTE_HEADER = "x-algt-perf-route";
const routeTemplates = ["/admin/hr/employees", "/admin/hr/employees/record/[id]", "/admin/common-master-data/departments", "/dms/documents", "/dms/documents/record/[id]", "/api/auth/session", "/login", "other"] as const;
export function performanceRoute(pathname: string): string {
  if ((routeTemplates as readonly string[]).includes(pathname)) return pathname;
  if (/^\/admin\/hr\/employees\/record\/\d+$/.test(pathname)) return "/admin/hr/employees/record/[id]";
  if (/^\/dms\/documents\/record\/\d+$/.test(pathname)) return "/dms/documents/record/[id]";
  return "other";
}

export function tracingEnabled(): boolean {
  // Retention acknowledgement is mandatory; actual log access/expiry is the host's responsibility.
  const retention = Number(process.env.ALGT_PERF_LOG_RETENTION_DAYS);
  return process.env.ALGT_PERF_ENABLED === "true" && Number.isInteger(retention) && retention >= 1 && retention <= 7;
}
function admit(id: string): boolean {
  if (!tracingEnabled()) return false;
  const configured = Number(process.env.ALGT_PERF_SAMPLE_PERCENT ?? "1");
  const percent = Number.isFinite(configured) ? Math.max(0, Math.min(100, configured)) : 0;
  // The proxy and downstream segment make the same sampling decision for this UUID.
  if (percent === 0 || parseInt(id.slice(0, 8), 16) / 0x100000000 * 100 >= percent) return false;
  const now = Date.now();
  if (now - windowStart >= 60_000 || now < windowStart) { windowStart = now; admitted = 0; }
  const configuredLimit = Number(process.env.ALGT_PERF_MAX_TRACES_PER_MINUTE ?? "60");
  const limit = Number.isInteger(configuredLimit) ? Math.max(1, Math.min(2000, configuredLimit)) : 60;
  if (admitted >= limit) return false;
  admitted++;
  return true;
}
function append(trace: Trace, span: Span) {
  if (trace.closed) return;
  if (trace.spans.length < MAX_SPANS) trace.spans.push(span); else trace.dropped++;
}
function elapsed(start: number) { return Math.round(Math.max(0, performance.now() - start) * 1000) / 1000; }
function offset(trace: Trace, start: number) { return Math.round(Math.max(0, start - trace.started) * 1000) / 1000; }
function safeId(value?: string | null) {
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : randomUUID();
}
export function currentTraceId() { return scope.getStore()?.id; }
export function hasTraceScope() { return scope.getStore() !== undefined; }

/** Never logs result values, exception text, URLs, principal IDs, headers or bindings. */
export async function traceOperation<T>(operation: PerfOperation, work: () => Promise<T>, correlation?: string | null, route = "other"): Promise<T> {
  if (!operations.includes(operation)) return work();
  const parent = scope.getStore();
  if (parent === null || parent?.closed) return work();
  if (parent && !parent.closed) return traceSpan(operation, work);
  if (!tracingEnabled()) return work();
  const id = safeId(correlation);
  if (!admit(id)) return scope.run(null, work);
  const trace: Trace = { id, operation, started: performance.now(), spans: [], dropped: 0, closed: false };
  let outcome: "ok" | "error" = "ok";
  return scope.run(trace, async () => {
    try {
      const result = await work();
      // Only inspect a plain data descriptor; never invoke a result's getter/toJSON.
      try {
        if (result && typeof result === "object" && Object.getOwnPropertyDescriptor(result, "success")?.value === false) outcome = "error";
        if (result instanceof Response && result.status >= 400) outcome = "error";
      } catch { /* Exotic results must not fail because of telemetry inspection. */ }
      return result;
    }
    catch (error) { outcome = "error"; throw error; }
    finally {
      trace.closed = true;
      // A failed sink must never replace an application result/error.
      try { console.info(JSON.stringify({ event: "algt.perf.v1", id: trace.id, operation, route: performanceRoute(route), ms: elapsed(trace.started), outcome, spans: trace.spans, dropped: trace.dropped })); } catch { /* best effort */ }
    }
  });
}
export async function traceSpan<T>(name: PerfOperation, work: () => PromiseLike<T>): Promise<T> {
  const trace = scope.getStore();
  if (!trace || trace.closed || !operations.includes(name)) return await work();
  const start = performance.now();
  let outcome: "ok" | "error" = "ok";
  try { return await work(); }
  catch (error) { outcome = "error"; throw error; }
  finally { append(trace, { name, ms: elapsed(start), offsetMs: offset(trace, start), outcome }); }
}

const backendPaths = new Map<string, string>([
  ["/auth/v1/user", "backend.auth.user"], ["/auth/v1/token", "backend.auth.token"],
  ["/rest/v1/rpc/f03_current_session_valid", "backend.session.valid"],
  ["/rest/v1/rpc/f03_read_documents", "backend.documents.projection"],
  ...["user_profiles", "user_roles", "roles", "role_permissions", "permissions", "employees", "departments", "dms_documents"].map(table => [`/rest/v1/${table}`, `backend.${table}`] as const),
]);
/** SDK physical attempts, headers latency and advertised length; no body cloning or retries added. */
export const performanceFetch: typeof fetch = async (input, init) => {
  const trace = scope.getStore();
  if (!trace || trace.closed) return fetch(input, init);
  let name = "backend.other";
  let retry = 0;
  try {
    const url = new URL(input instanceof Request ? input.url : String(input));
    name = backendPaths.get(url.pathname) ?? "backend.other";
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const value = Number(headers.get("x-retry-count") ?? "0");
    if (Number.isInteger(value) && value >= 0 && value <= 10) retry = value;
  } catch { /* Metadata failure must not alter the actual request. */ }
  const start = performance.now();
  try {
    const response = await fetch(input, init);
    const raw = response.headers.get("content-length");
    const length = raw === null ? null : Number(raw);
    append(trace, { name, ms: elapsed(start), offsetMs: offset(trace, start), outcome: response.ok ? "ok" : "error", status: response.status, retry,
      contentLength: length !== null && Number.isSafeInteger(length) && length >= 0 ? length : null });
    return response;
  } catch (error) {
    append(trace, { name, ms: elapsed(start), offsetMs: offset(trace, start), outcome: "error", retry });
    throw error;
  }
};

/** Measures real JSON response construction, not Next's separate RSC/action serialization. */
export function tracedJsonResponse(value: unknown, init?: ResponseInit): Response {
  const trace = scope.getStore();
  const start = performance.now();
  const body = JSON.stringify(value);
  const headers = new Headers(init?.headers);
  if (!headers.has("content-type")) headers.set("content-type", "application/json");
  const response = new Response(body, { ...init, headers });
  if (trace && !trace.closed) append(trace, { name: "response.json", ms: elapsed(start), offsetMs: offset(trace, start), outcome: "ok", status: response.status, contentLength: Buffer.byteLength(body) });
  return response;
}
