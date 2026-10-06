// Real shared route/client helpers; all requests, streams and transport are synthetic.
// Settled deferred work proves admission/delivery fences, not native DB or socket cancellation.
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {QueryClient} from "@tanstack/react-query";

const log = vi.hoisted(() => ({warn: vi.fn()}));
vi.mock("@/lib/logger", () => ({logger: log}));
import {readRoute} from "@/server/reads/route-response";
import {readJson, ReadError, retryAuthorizedRead} from "@/lib/reads/client";

const url = "https://synthetic.invalid/api/reads/example";
const privateValue = "SYNTHETIC_PRIVATE_INPUT_OR_REASON";
const success = {success: true, data: {rows: [{id: 1}]}};
const encoder = new TextEncoder();
const abortedError = {name: "AbortError", message: "Read cancelled."};
function request(signal?: AbortSignal, body = JSON.stringify({search: privateValue})) {
  return new Request(url, {method: "POST", headers: {"content-type": "application/json"}, body, signal});
}
function streamRequest(body: ReadableStream<Uint8Array>, signal?: AbortSignal) {
  const init: RequestInit & {duplex: "half"} = {method: "POST", headers: {"content-type": "application/json"}, body, signal, duplex: "half"};
  return new Request(url, init);
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {resolve = done; reject = fail;});
  return {promise, resolve, reject};
}
function cache() {return new QueryClient({defaultOptions: {queries: {retry: retryAuthorizedRead, retryDelay: 0}}});}
function privateHeaders(response: Response) {
  expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
  expect(response.headers.get("Vary")).toBe("Cookie");
  expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  expect(response.headers.get("Retry-After")).toBeNull();
  const correlationId = response.headers.get("X-ERP-Correlation");
  expect(correlationId).toMatch(/^[0-9a-f-]{36}$/);
  return correlationId;
}
async function cancelled(response: Response) {
  expect(response.status).toBe(400);
  expect(response.headers.get("X-ERP-Read-Outcome")).toBe("cancelled");
  const correlationId = privateHeaders(response);
  expect(await response.json()).toEqual({success: false, error: "Read cancelled.", code: "READ_CANCELLED", correlationId});
  expect(log.warn).not.toHaveBeenCalled();
}
async function invalid(response: Response) {
  expect(response.status).toBe(400); expect(response.headers.get("X-ERP-Read-Outcome")).toBeNull();
  const correlationId = privateHeaders(response);
  expect(await response.json()).toEqual({success: false, error: "Invalid read parameters", correlationId});
  expect(log.warn).not.toHaveBeenCalled();
}
beforeEach(() => {vi.clearAllMocks();});
afterEach(() => {vi.unstubAllGlobals(); vi.restoreAllMocks();});

it.each([undefined, Object.assign(new Error(privateValue), {name: "ResponseAborted"}), privateValue])(
  "pre-aborted server request does not consume its body or dispatch, regardless of reason %#", async reason => {
    const control = new AbortController(); control.abort(reason);
    const input = request(control.signal), getReader = vi.spyOn(input.body!, "getReader");
    const read = vi.fn(async () => success);
    await cancelled(await readRoute(input, read));
    expect(getReader).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled();
  },
);

it.each([
  ["success", success],
  ["ordinary failure", {success: false, error: privateValue}],
  ["permission denial", {success: false, error: "Permission denied"}],
] as const)("late reader %s after known abort cannot become an ordinary response", async (_label, value) => {
  const pending = deferred<typeof value>(), control = new AbortController();
  const read = vi.fn(() => pending.promise), result = readRoute(request(control.signal), read);
  await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(1));
  control.abort(privateValue); pending.resolve(value);
  await cancelled(await result); expect(read).toHaveBeenCalledTimes(1);
});

it.each([new Error(privateValue), new TypeError(privateValue), privateValue])(
  "an ordinary reader rejection after known abort is redacted cancellation %#", async reason => {
    const pending = deferred<typeof success>(), control = new AbortController();
    const read = vi.fn(() => pending.promise), result = readRoute(request(control.signal), read);
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    control.abort(privateValue); pending.reject(reason);
    await cancelled(await result); expect(read).toHaveBeenCalledTimes(1);
  },
);

it.each(["close", "reject"])("body %s after abort cannot admit the reader", async outcome => {
  const control = new AbortController();
  let streamController!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({start(controller) {streamController = controller;}});
  const read = vi.fn(async () => success), result = readRoute(streamRequest(body, control.signal), read);
  await Promise.resolve(); control.abort(privateValue);
  // Complete the pending body explicitly. This does not assert immediate transport teardown.
  if (outcome === "close") streamController.close(); else streamController.error(new Error(privateValue));
  await cancelled(await result); expect(read).not.toHaveBeenCalled();
});

it("abort while oversized-body cancellation settles wins over ordinary invalid parameters", async () => {
  const pending = deferred<void>(), control = new AbortController();
  const cancel = vi.fn(() => pending.promise);
  const body = new ReadableStream<Uint8Array>({start(controller) {controller.enqueue(encoder.encode(JSON.stringify({search: "a".repeat(3988)})));}, cancel});
  const read = vi.fn(async () => success), result = readRoute(streamRequest(body, control.signal), read);
  await vi.waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
  control.abort(privateValue); pending.resolve(undefined);
  await cancelled(await result); expect(read).not.toHaveBeenCalled();
});

it.each([new DOMException(privateValue, "AbortError"), {name: "AbortError", message: privateValue}])(
  "a live operation AbortError is terminal and never an outage warning %#", async error => {
    const input = request(); expect(input.signal.aborted).toBe(false);
    await cancelled(await readRoute(input, async () => {throw error;}));
  },
);

it("an AbortError while consuming a live body never dispatches or logs an outage", async () => {
  const body = new ReadableStream<Uint8Array>({start(controller) {controller.error(new DOMException(privateValue, "AbortError"));}});
  const read = vi.fn(async () => success);
  await cancelled(await readRoute(streamRequest(body), read)); expect(read).not.toHaveBeenCalled();
});

it.each(["throw", "return", "abort in message"])("ordinary live %s remains redacted/no-store 503", async mode => {
  const response = await readRoute(request(), async () => {
    if (mode === "throw") throw new Error(privateValue);
    if (mode === "abort in message") throw new Error(`abort ${privateValue}`);
    return {success: false, error: privateValue};
  });
  expect(response.status).toBe(503); expect(response.headers.get("X-ERP-Read-Outcome")).toBeNull();
  const correlationId = privateHeaders(response);
  expect(await response.json()).toEqual({success: false, error: "Records could not be loaded. Please retry.", correlationId});
  expect(log.warn.mock.calls).toEqual([["Authorized read unavailable", {correlationId, code: "READ_UNAVAILABLE"}]]);
});

it("live permission denial remains private 403 without a cancellation marker or warning", async () => {
  const response = await readRoute(request(), async () => ({success: false, error: "Permission denied"}));
  expect(response.status).toBe(403); expect(response.headers.get("X-ERP-Read-Outcome")).toBeNull();
  const correlationId = privateHeaders(response);
  expect(await response.json()).toEqual({success: false, error: "Permission denied", correlationId});
  expect(log.warn).not.toHaveBeenCalled();
});

it.each(["malformed JSON", "wrong content type"])("live %s remains ordinary invalid input with no dispatch", async kind => {
  const input = kind === "malformed JSON" ? request(undefined, "{") : new Request(url, {method: "POST", headers: {"content-type": "text/plain"}, body: "{}"});
  const read = vi.fn(async () => success); await invalid(await readRoute(input, read)); expect(read).not.toHaveBeenCalled();
});

it("a live reader's invalid-input result retains its fixed ordinary 400", async () => {
  await invalid(await readRoute(request(), async () => ({success: false, error: `Invalid ${privateValue}`})));
});

it("valid ASCII JSON at exactly 4000 POST bytes dispatches unchanged", async () => {
  const params = {search: "a".repeat(3987)}, body = JSON.stringify(params);
  expect(encoder.encode(body).byteLength).toBe(4000);
  const read = vi.fn(async () => success), response = await readRoute(request(undefined, body), read);
  expect(response.status).toBe(200); expect(await response.json()).toEqual(success); expect(read).toHaveBeenCalledExactlyOnceWith(params);
});

it.each(["one chunk", "multiple chunks"])("valid JSON at 4001 POST bytes is rejected across %s", async kind => {
  const text = JSON.stringify({search: "a".repeat(3988)}), bytes = encoder.encode(text);
  expect(bytes.byteLength).toBe(4001); expect(JSON.parse(text)).toEqual({search: "a".repeat(3988)});
  const chunks = [bytes.slice(0, 2000), bytes.slice(2000)]; expect(chunks.every(chunk => chunk.byteLength < 4000)).toBe(true);
  const input = kind === "one chunk" ? request(undefined, text) : streamRequest(new ReadableStream<Uint8Array>({start(controller) {for (const chunk of chunks) controller.enqueue(chunk); controller.close();}}));
  const read = vi.fn(async () => success); await invalid(await readRoute(input, read)); expect(read).not.toHaveBeenCalled();
});

it("multibyte valid POST JSON uses cumulative bytes, not decoded character count", async () => {
  const body = JSON.stringify({search: "é".repeat(1994)});
  expect(encoder.encode(body).byteLength).toBe(4001); expect(body.length).toBe(2007); expect(JSON.parse(body).search).toHaveLength(1994);
  const read = vi.fn(async () => success); await invalid(await readRoute(request(undefined, body), read)); expect(read).not.toHaveBeenCalled();
});

it("valid 4000-byte multibyte JSON split inside a character preserves its full payload", async () => {
  const params = {search: "é".repeat(1993) + "a"}, bytes = encoder.encode(JSON.stringify(params)); expect(bytes.byteLength).toBe(4000);
  const body = new ReadableStream<Uint8Array>({start(controller) {controller.enqueue(bytes.slice(0, 12)); controller.enqueue(bytes.slice(12)); controller.close();}});
  const read = vi.fn(async () => success), response = await readRoute(streamRequest(body), read);
  expect(response.status).toBe(200); expect(read).toHaveBeenCalledExactlyOnceWith(params);
});

it.each(["ASCII boundary", "multibyte"])("legacy GET bounds decoded JSON characters, not encoded URL or bytes: %s", async kind => {
  const params = {search: kind === "ASCII boundary" ? "a".repeat(3987) : "é".repeat(1994)}, raw = JSON.stringify(params);
  expect(raw.length).toBe(kind === "ASCII boundary" ? 4000 : 2007);
  expect(encoder.encode(raw).byteLength).toBe(kind === "ASCII boundary" ? 4000 : 4001);
  const input = new Request(`${url}?params=${encodeURIComponent(raw)}`); expect(input.url.length).toBeGreaterThan(4000);
  const read = vi.fn(async () => success), response = await readRoute(input, read);
  expect(response.status).toBe(200); expect(read).toHaveBeenCalledExactlyOnceWith(params);
});

it("valid legacy GET JSON beyond 4000 decoded characters is ordinary invalid input", async () => {
  const raw = JSON.stringify({search: "a".repeat(3988)}); expect(raw.length).toBe(4001); expect(JSON.parse(raw).search).toHaveLength(3988);
  const read = vi.fn(async () => success); await invalid(await readRoute(new Request(`${url}?params=${encodeURIComponent(raw)}`), read)); expect(read).not.toHaveBeenCalled();
});

it("inbound cancellation and correlation headers cannot replace a live server outcome or reference", async () => {
  const input = request(); input.headers.set("X-ERP-Read-Outcome", "cancelled"); input.headers.set("X-ERP-Correlation", privateValue);
  const read = vi.fn(async () => success), response = await readRoute(input, read);
  expect(response.status).toBe(200); expect(response.headers.get("X-ERP-Read-Outcome")).toBeNull();
  expect(privateHeaders(response)).not.toBe(privateValue); expect(await response.json()).toEqual(success); expect(read).toHaveBeenCalledTimes(1);
  expect(log.warn).not.toHaveBeenCalled();
});

it.each([undefined, new Error(privateValue), privateValue])("pre-aborted client performs no fetch and normalizes reason %#", async reason => {
  const control = new AbortController(); control.abort(reason);
  const fetcher = vi.fn(async () => Response.json(success)); vi.stubGlobal("fetch", fetcher);
  await expect(readJson("example", {}, control.signal)).rejects.toMatchObject(abortedError); expect(fetcher).not.toHaveBeenCalled();
});

it.each([200, 403])("late uncooperative fetch status %s cannot fulfill or deny an already aborted client", async status => {
  const pending = deferred<Response>(), control = new AbortController(), response = Response.json(success, {status});
  const json = vi.spyOn(response, "json"), fetcher = vi.fn(() => pending.promise);
  vi.stubGlobal("fetch", fetcher);
  const result = expect(readJson("example", {search: privateValue}, control.signal)).rejects.toMatchObject(abortedError);
  expect(fetcher).toHaveBeenCalledExactlyOnceWith("/api/reads/example", expect.objectContaining({method: "POST", credentials: "same-origin", cache: "no-store", signal: control.signal, body: JSON.stringify({search: privateValue})}));
  control.abort(privateValue); pending.resolve(response); await result; expect(json).not.toHaveBeenCalled();
});

it("abort during JSON consumption cannot fulfill a late decoded payload", async () => {
  const pending = deferred<typeof success>(), control = new AbortController(), response = Response.json(success);
  const json = vi.spyOn(response, "json").mockReturnValue(pending.promise); vi.stubGlobal("fetch", vi.fn(async () => response));
  const result = expect(readJson("example", {}, control.signal)).rejects.toMatchObject(abortedError);
  await vi.waitFor(() => expect(json).toHaveBeenCalledTimes(1)); control.abort(privateValue); pending.resolve(success); await result;
});

it.each([
  ["fetch", new Error(privateValue)], ["fetch", new TypeError(privateValue)], ["fetch", privateValue],
  ["json", new Error(privateValue)], ["json", new TypeError(privateValue)], ["json", privateValue],
] as const)("known abort plus ordinary %s rejection is fixed cancellation without a second whole-read attempt %#", async (stage, reason) => {
  const fetchPending = deferred<Response>(), jsonPending = deferred<typeof success>(), control = new AbortController(), response = Response.json(success);
  const json = vi.spyOn(response, "json").mockReturnValue(jsonPending.promise);
  const fetcher = vi.fn(() => fetchPending.promise); vi.stubGlobal("fetch", fetcher); const queries = cache();
  try {
    const outcome = queries.fetchQuery({queryKey: ["rejected-read", stage], queryFn: () => readJson("example", {}, control.signal)}).then(value => ({value}), error => ({error}));
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    if (stage === "json") {fetchPending.resolve(response); await vi.waitFor(() => expect(json).toHaveBeenCalledTimes(1));}
    control.abort(privateValue);
    if (stage === "fetch") {fetchPending.reject(reason); jsonPending.resolve(success);} else jsonPending.reject(reason);
    expect(await outcome).toMatchObject({error: abortedError}); expect(fetcher).toHaveBeenCalledTimes(1);
    expect(json).toHaveBeenCalledTimes(stage === "json" ? 1 : 0); expect(log.warn).not.toHaveBeenCalled();
  } finally {queries.clear();}
});

it.each(["fetch", "json"])("live %s AbortError uses the same fixed private cancellation message", async stage => {
  const response = Response.json(success);
  vi.spyOn(response, "json").mockRejectedValue(new DOMException(privateValue, "AbortError"));
  vi.stubGlobal("fetch", vi.fn(async () => {if (stage === "fetch") throw new DOMException(privateValue, "AbortError"); return response;}));
  await expect(readJson("example", {})).rejects.toMatchObject(abortedError);
});

it("exact 400 cancellation marker is decoded before consuming even a non-JSON body", async () => {
  const response = new Response(privateValue, {status: 400, headers: {"X-ERP-Read-Outcome": "cancelled"}}), json = vi.spyOn(response, "json");
  vi.stubGlobal("fetch", vi.fn(async () => response));
  await expect(readJson("example", {})).rejects.toMatchObject(abortedError); expect(json).not.toHaveBeenCalled();
});

it.each([undefined, "", "Cancelled", "cancelled, other"])("a non-exact 400 marker remains invalid ReadError even with a cancellation-looking body %#", async marker => {
  const headers = new Headers({"X-ERP-Correlation": "synthetic-reference"}); if (marker !== undefined) headers.set("X-ERP-Read-Outcome", marker);
  const response = Response.json({success: false, code: "READ_CANCELLED", error: privateValue}, {status: 400, headers}), json = vi.spyOn(response, "json");
  vi.stubGlobal("fetch", vi.fn(async () => response));
  await expect(readJson("example", {})).rejects.toMatchObject({name: "ReadError", status: 400, correlationId: "synthetic-reference"});
  expect(json).not.toHaveBeenCalled(); expect(retryAuthorizedRead(0, new ReadError("fixed", 400))).toBe(false);
});

it.each([401, 403, 503])("a cancellation-looking header cannot hide live status %s", async status => {
  const response = new Response(privateValue, {status, headers: {"X-ERP-Read-Outcome": "cancelled", "X-ERP-Correlation": "synthetic-reference"}}), json = vi.spyOn(response, "json");
  vi.stubGlobal("fetch", vi.fn(async () => response));
  await expect(readJson("example", {})).rejects.toMatchObject({name: "ReadError", status, correlationId: "synthetic-reference", message: status === 503 ? "Records could not be loaded. Please retry." : "Your access could not be verified. Sign in again or contact your administrator."});
  expect(json).not.toHaveBeenCalled(); expect(retryAuthorizedRead(0, new ReadError("fixed", status))).toBe(status === 503);
});

it("a success response with a stray cancellation marker remains success", async () => {
  const response = Response.json(success, {headers: {"X-ERP-Read-Outcome": "cancelled"}}), json = vi.spyOn(response, "json");
  vi.stubGlobal("fetch", vi.fn(async () => response));
  await expect(readJson("example", {})).resolves.toEqual(success); expect(json).toHaveBeenCalledTimes(1);
});

it("actual route cancellation reaches the client once, not as two service attempts", async () => {
  const read = vi.fn(async () => {throw new DOMException(privateValue, "AbortError");});
  const fetcher = vi.fn((input: string, init?: RequestInit) => readRoute(new Request(new URL(input, "https://synthetic.invalid"), init), read));
  vi.stubGlobal("fetch", fetcher); const queries = cache();
  try {
    await expect(queries.fetchQuery({queryKey: ["cancelled-read"], queryFn: ({signal}) => readJson("example", {}, signal)})).rejects.toMatchObject(abortedError);
    expect(fetcher).toHaveBeenCalledTimes(1); expect(read).toHaveBeenCalledTimes(1); expect(log.warn).not.toHaveBeenCalled();
  } finally {queries.clear();}
});

it("non-abort response loss retains the one bounded retry", async () => {
  const fetcher = vi.fn(async () => {throw new TypeError("Synthetic response loss");}); vi.stubGlobal("fetch", fetcher); const queries = cache();
  try {
    await expect(queries.fetchQuery({queryKey: ["lost-read"], queryFn: ({signal}) => readJson("example", {}, signal)})).rejects.toThrow("Records could not be loaded. Please retry.");
    expect(fetcher).toHaveBeenCalledTimes(2); expect(log.warn).not.toHaveBeenCalled();
  } finally {queries.clear();}
});

it("live success preserves same-origin POST, encoded resource, private headers and the full payload", async () => {
  const response = await readRoute(request(), async () => success);
  expect(response.status).toBe(200); expect(response.headers.get("X-ERP-Read-Outcome")).toBeNull(); privateHeaders(response);
  const fetcher = vi.fn(async () => response); vi.stubGlobal("fetch", fetcher);
  await expect(readJson("example/selection", {search: privateValue})).resolves.toEqual(success);
  expect(fetcher).toHaveBeenCalledExactlyOnceWith("/api/reads/example%2Fselection", expect.objectContaining({method: "POST", credentials: "same-origin", cache: "no-store", headers: {Accept: "application/json", "Content-Type": "application/json"}, body: JSON.stringify({search: privateValue})}));
  expect(log.warn).not.toHaveBeenCalled();
});
