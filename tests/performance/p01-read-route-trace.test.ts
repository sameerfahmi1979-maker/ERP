import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readRoute } from "@/server/reads/route-response";
import { PERF_HEADER, performanceFetch, traceOperation } from "@/lib/performance/trace";

const correlationId = "77777777-7777-4777-8777-777777777777";
const privateInput = "SYNTHETIC_PRIVATE_SEARCH";
const path = "/api/reads/dms-inbox";

function request(signal?: AbortSignal, correlation = correlationId) {
  return new Request("https://synthetic.invalid" + path + "?token=" + privateInput, {
    method: "POST",
    body: JSON.stringify({ query: privateInput }),
    headers: { [PERF_HEADER]: correlation, "content-type": "application/json" },
    signal,
  });
}

beforeEach(() => {
  vi.stubEnv("ALGT_PERF_ENABLED", "true");
  vi.stubEnv("ALGT_PERF_LOG_RETENTION_DAYS", "1");
  vi.stubEnv("ALGT_PERF_SAMPLE_PERCENT", "100");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("correlates the whole authorized read and response with proxy and backend without logging input", async () => {
  const sink = vi.spyOn(console, "info").mockImplementation(() => {});
  await traceOperation("proxy", async () => new Response(null), correlationId, path);
  const response = await readRoute(request(), async () => {
    await performanceFetch("https://synthetic.invalid/rest/v1/dms_upload_sessions?query=" + privateInput);
    return { success: true, data: { syntheticPrivateOutput: privateInput } };
  });
  expect(response.headers.get("X-ERP-Correlation")).toBe(correlationId);
  const events = sink.mock.calls.map(call => JSON.parse(String(call[0])));
  expect(events).toMatchObject([
    { id: correlationId, operation: "proxy", route: path },
    {
      id: correlationId,
      operation: "dms.inbox.read",
      route: path,
      outcome: "ok",
      spans: [
        { name: "backend.dms_upload_sessions", status: 204 },
        { name: "read.execute", outcome: "ok" },
        { name: "response.json", status: 200, contentLength: expect.any(Number) },
      ],
    },
  ]);
  expect(JSON.stringify(events)).not.toContain(privateInput);
});

it.each(["timeout", "cancelled"])("traces a safe %s response with its shared correlation", async outcome => {
  const sink = vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const controller = new AbortController();
  if (outcome === "cancelled") controller.abort(privateInput);
  const reader = vi.fn(async () => { throw new Error(privateInput); });
  const response = await readRoute(request(controller.signal), reader);
  expect(response.status).toBe(outcome === "timeout" ? 503 : 400);
  expect(response.headers.get("X-ERP-Correlation")).toBe(correlationId);
  expect(await response.json()).toMatchObject({ success: false, correlationId });
  if (outcome === "cancelled") expect(reader).not.toHaveBeenCalled();
  expect(JSON.parse(String(sink.mock.calls[0][0]))).toMatchObject({
    id: correlationId, operation: "dms.inbox.read", outcome: "error",
    spans: expect.arrayContaining([{ name: "response.json", status: response.status, contentLength: expect.any(Number), ms: expect.any(Number), offsetMs: expect.any(Number), outcome: "ok" }]),
  });
  expect(JSON.stringify(sink.mock.calls)).not.toContain(privateInput);
});

it("uses a new correlation rather than echoing an invalid input header", async () => {
  const sink = vi.spyOn(console, "info").mockImplementation(() => {});
  const response = await readRoute(request(undefined, privateInput), async () => ({ success: true }));
  expect(response.headers.get("X-ERP-Correlation")).toMatch(/^[a-f0-9-]{36}$/);
  expect(JSON.stringify(sink.mock.calls)).not.toContain(privateInput);
});

it.each([
  ["hr-search", "hr.search.read"],
  ["hr-document-browser", "hr.document-browser.read"],
  ["hr-time", "hr.time.read"],
  ["report-history", "reports.history.read"],
  ["report-deliveries", "reports.deliveries.read"],
  ["lookup-search", "lookup.search.read"],
  ["dms-approvals", "dms.approvals.read"],
  ["dms-expiry-page", "dms.expiry.read"],
])("attributes the %s handler without retaining search parameters", async (entry, operation) => {
  const sink = vi.spyOn(console, "info").mockImplementation(() => {});
  const route = `/api/reads/${entry}`;
  const tracedRequest = new Request(`https://synthetic.invalid${route}?q=${privateInput}`, {
    headers: { [PERF_HEADER]: correlationId },
  });
  await traceOperation("proxy", async () => new Response(null), correlationId, route);
  await readRoute(tracedRequest, async () => ({ success: true, data: [] }));
  expect(sink.mock.calls.map(call => JSON.parse(String(call[0])))).toMatchObject([
    { id: correlationId, operation: "proxy", route },
    { id: correlationId, operation, route, outcome: "ok" },
  ]);
  expect(JSON.stringify(sink.mock.calls)).not.toContain(privateInput);
});
