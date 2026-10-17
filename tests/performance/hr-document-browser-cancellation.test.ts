// Actual reader/route, installed Supabase SDK and protected-read/retry adapters.
// The only HTTP transport is a synthetic in-memory fetch; no native API or database.
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {createClient as createSdkClient} from "@supabase/supabase-js";
import type {AuthContext} from "@/lib/rbac/check";
import {withDocumentReadPolicy} from "@/lib/supabase/document-read-policy";
import {applyReadAttemptScope} from "@/lib/supabase/read-attempt-scope";

type Row = Record<string, unknown>;
type Call = {source: string; url: URL; method: string; signal: AbortSignal | null | undefined};
const state = vi.hoisted(() => ({auth: vi.fn(), client: vi.fn(), fetch: vi.fn(), calls: [] as Call[], rows: {} as Record<string, Row[]>,
  range416: false, fail: "", counts: {} as Record<string, number>, preview: true, download: true}));
vi.mock("@/lib/rbac/check", async () => ({...await import("@/lib/rbac/scope"), getAuthContext: state.auth}));
vi.mock("@/lib/supabase/server", () => ({createClient: state.client}));
import {readHrDocumentBrowser} from "@/server/reads/hr-document-browser";
import {POST} from "@/app/api/reads/hr-document-browser/route";
import {hrBrowserDocumentsPage} from "@/lib/reads/hr-document-browser-schema";

// A two-argument implementation is structurally assignable before the repair;
// the failing regression can supply the intended optional signal without @ts-ignore.
const read: (input: unknown, context?: AuthContext, signal?: AbortSignal) => ReturnType<typeof readHrDocumentBrowser> = readHrDocumentBrowser;
const auth = {profile: {id: 1, auth_user_id: "synthetic", must_change_password: false}, isAccountActive: true, accountStatus: "active", email: null,
  roleCodes: [], roleAssignments: [], permissionCodes: ["hr.employees.view", "dms.documents.view"]} as unknown as AuthContext;
const employees = {operation: "employees"};
const documents = {operation: "documents", entityType: "employee", entityId: 1};
const files = {operation: "files", entityType: "employee", entityId: 1, documentId: 2};
function deferred<T>() {let resolve!: (value: T) => void; const promise = new Promise<T>(done => {resolve = done;}); return {promise, resolve};}
function respond(call: Call): Response {
  // A returned database error, not an SDK retry-timing test. HTTP 400 avoids
  // default SDK 503 backoff obscuring the source-composition error assertion.
  if (state.fail === call.source) return Response.json({code: "SYNTHETIC", message: "PRIVATE fixture failure"}, {status: 400});
  if (call.source === "f03_has_document_permission") return Response.json(call.method === "POST" ? true : state.preview);
  let rows = state.rows[call.source] ?? [];
  const idFilter = call.url.searchParams.get("id");
  if (idFilter?.startsWith("in.(")) {const ids = idFilter.slice(4, -1).split(",").map(Number); rows = rows.filter(row => ids.includes(Number(row.id)));}
  const total = state.counts[call.source] ?? rows.length;
  const offset = Number(call.url.searchParams.get("offset") ?? 0), limit = Number(call.url.searchParams.get("limit") ?? rows.length);
  if (state.range416 && call.method !== "HEAD" && offset >= total && offset > 0) return Response.json({code: "PGRST103", message: "Range exhausted"}, {status: 416});
  const selected = rows.slice(offset, offset + limit), range = selected.length ? `${offset}-${offset + selected.length - 1}/${total}` : `*/${total}`;
  return new Response(call.method === "HEAD" ? null : JSON.stringify(selected), {status: 200, headers: {"content-type": "application/json", "content-range": range}});
}
function sdk() {
  return withDocumentReadPolicy(applyReadAttemptScope(createSdkClient("https://synthetic.invalid", "not-a-real-key", {
    auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false},
    global: {fetch: async (input, init) => {
      const url = new URL(String(input));
      if (url.origin !== "https://synthetic.invalid" || !url.pathname.startsWith("/rest/v1/")) throw Error("Unexpected synthetic transport target");
      const call: Call = {source: url.pathname.split("/").at(-1)!, url, method: init?.method ?? "GET", signal: init?.signal}; state.calls.push(call);
      return state.fetch(call, init);
    }},
  })));
}
beforeEach(() => {
  vi.clearAllMocks(); state.calls = []; state.counts = {}; state.range416 = false; state.fail = ""; state.preview = true; state.download = true;
  state.auth.mockResolvedValue(auth); state.client.mockImplementation(async () => sdk()); state.fetch.mockImplementation((call: Call) => respond(call));
  state.rows = {
    employees: [{id: 1, employee_code: "SYN-1", full_name_en: "Synthetic One", employee_status: "active"}],
    f03_read_employee_dependents: [{id: 7, employee_id: 1, dependent_name_en: "Synthetic Child", dms_document_id: 2, relationship_type: {name_en: "Child"}}],
    dms_document_links: [{id: 8, document_id: 2}],
    employee_identity_documents: [{id: 9, document_number: "SYN-ID-9", issue_date: null, expiry_date: null, status: "active", dms_document_id: null, doc_type: {name_en: "Passport"}}],
    f03_read_documents: [{id: 2, document_no: "SYN-DOC-2", title: "Synthetic linked", status: "active", issue_date: null, expiry_date: null, document_type: {name_en: "Evidence"}}],
    f03_read_document_files: [{id: 3, document_id: 2, file_name: "Synthetic.pdf", mime_type: "application/pdf", file_size_bytes: 12}],
  };
});
afterEach(() => {vi.restoreAllMocks();});

it("pre-aborted reader performs no authorization, client creation or database transport", async () => {
  const control = new AbortController(); control.abort(); const result = await read(employees, undefined, control.signal);
  expect(result.success).toBe(false); expect(result.data).toBeUndefined(); expect(state.auth).not.toHaveBeenCalled(); expect(state.client).not.toHaveBeenCalled(); expect(state.calls).toHaveLength(0);
});
it("pre-aborted route cancels before admission without authorization or database transport", async () => {
  const control = new AbortController(); control.abort();
  const request = new Request("http://synthetic/api/reads/hr-document-browser", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(employees), signal: control.signal});
  const result = await POST(request); expect(result.status).toBe(400);
  expect(result.headers.get("X-ERP-Read-Outcome")).toBe("cancelled");
  expect(result.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
  expect(result.headers.get("Vary")).toBe("Cookie"); expect(result.headers.get("X-Content-Type-Options")).toBe("nosniff");
  expect(result.headers.get("Retry-After")).toBeNull();
  const correlationId = result.headers.get("X-ERP-Correlation"); expect(correlationId).toMatch(/^[0-9a-f-]{36}$/);
  expect(await result.json()).toEqual({success: false, error: "Read cancelled.", code: "READ_CANCELLED", correlationId});
  expect(state.auth).not.toHaveBeenCalled(); expect(state.client).not.toHaveBeenCalled(); expect(state.calls).toHaveLength(0);
});
it("abort while authorization resolves cannot start a database client", async () => {
  const pending = deferred<AuthContext>(), control = new AbortController(); state.auth.mockReturnValue(pending.promise);
  const result = read(employees, undefined, control.signal); await vi.waitFor(() => expect(state.auth).toHaveBeenCalledTimes(1));
  control.abort(); pending.resolve(auth); expect((await result).success).toBe(false); expect(state.client).not.toHaveBeenCalled();
});
it("abort while client creation resolves cannot dispatch its first query", async () => {
  const pending = deferred<ReturnType<typeof sdk>>(), control = new AbortController(); state.client.mockReturnValue(pending.promise);
  const result = read(employees, auth, control.signal); await vi.waitFor(() => expect(state.client).toHaveBeenCalledTimes(1));
  control.abort(); pending.resolve(sdk()); expect((await result).success).toBe(false); expect(state.calls).toHaveLength(0);
});
it.each([
  ["ordinary page", employees], ["searched page", {...employees, search: "Synthetic"}],
  ["dependent page", {operation: "dependents", employeeId: 1}], ["employee union", documents],
  ["dependent union", {...documents, entityType: "employee_dependent", entityId: 7}], ["files and capabilities", files],
] as const)("%s sends the exact signal to every installed-SDK select/point/count/protected RPC request", async (_label, input) => {
  const control = new AbortController(); const result = await read(input, auth, control.signal);
  expect(result.success).toBe(true); expect(state.calls.length).toBeGreaterThan(0);
  for (const call of state.calls) expect(call.signal, `${call.source} ${call.method}`).toBe(control.signal);
  if (input.operation === "files") expect(state.calls.filter(call => call.source === "f03_has_document_permission")).toHaveLength(2);
  expect(state.auth).not.toHaveBeenCalled(); expect(state.client).toHaveBeenCalledTimes(1);
});
it("route forwards Request.signal through actual SDK transport and preserves private response headers", async () => {
  const control = new AbortController(), request = new Request("http://synthetic/api/reads/hr-document-browser", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(employees), signal: control.signal});
  const result = await POST(request); expect(result.status).toBe(200); expect(result.headers.get("Cache-Control")).toContain("private, no-store");
  expect(state.calls).toHaveLength(1); expect(state.calls[0].signal).toBe(request.signal);
});
it("range exhaustion passes the signal to both the native page and exact HEAD recount", async () => {
  state.range416 = true; const control = new AbortController(); const result = await read({...employees, page: 5}, auth, control.signal);
  expect(result.success).toBe(true); expect(state.calls.map(call => call.method)).toEqual(["GET", "HEAD"]);
  expect(state.calls.every(call => call.signal === control.signal)).toBe(true);
});
it.each(["employees", "dms_document_links", "employee_identity_documents", "f03_read_documents", "f03_read_document_files", "f03_has_document_permission"])("late successful %s transport after abort cannot yield a successful or partial response", async target => {
  const control = new AbortController(); state.fetch.mockImplementation((call: Call) => {const response = respond(call); if (call.source === target) control.abort(); return response;});
  const result = await read(target.includes("file") || target === "f03_has_document_permission" ? files : target === "employees" ? employees : documents, auth, control.signal);
  expect(result.success).toBe(false); expect(result.data).toBeUndefined();
});
it("aborting a pending first complete page suppresses later source pages and metadata chunks", async () => {
  const control = new AbortController(), pending = deferred<Response>(); state.counts.dms_document_links = 1107;
  state.rows.dms_document_links = Array.from({length: 500}, (_, i) => ({id: i + 1, document_id: i + 1}));
  state.fetch.mockImplementation((call: Call) => call.source === "dms_document_links" ? pending.promise : respond(call));
  const result = read(documents, auth, control.signal); await vi.waitFor(() => expect(state.calls.some(call => call.source === "dms_document_links")).toBe(true));
  control.abort(); pending.resolve(respond(state.calls.find(call => call.source === "dms_document_links")!));
  expect((await result).success).toBe(false); expect(state.calls.filter(call => call.source === "dms_document_links")).toHaveLength(1);
  expect(state.calls.some(call => call.source === "f03_read_documents")).toBe(false);
});
it("parallel independent identity and link reads both start after authorization, before either pending source resolves", async () => {
  const pending = deferred<Response>(); state.fetch.mockImplementation((call: Call) => call.source === "dms_document_links" ? pending.promise : respond(call));
  const result = read(documents, auth); let page: Awaited<ReturnType<typeof read>> | undefined;
  try {
    await vi.waitFor(() => expect(state.calls.some(call => call.source === "dms_document_links")).toBe(true));
    await vi.waitFor(() => expect(state.calls.some(call => call.source === "employee_identity_documents")).toBe(true), {timeout: 300, interval: 5});
    expect(state.calls[0].source).toBe("employees"); expect(state.calls.some(call => call.source === "f03_read_documents")).toBe(false);
  } finally {pending.resolve(respond(state.calls.find(call => call.source === "dms_document_links")!)); page = await result;}
  expect(hrBrowserDocumentsPage.parse(page.data).rows.map(row => row.key)).toEqual(["identity:9", "dms:2"]);
});
it("parallel completion preserves baseline link-first oversized-versus-failed-source precedence", async () => {
  state.counts.dms_document_links = 5001; state.fail = "employee_identity_documents";
  const result = await read(documents, auth); expect(result.data).toMatchObject({availability: "too_large"}); expect(result.data).not.toHaveProperty("rows");
});
it("abort takes precedence over an oversized transport that resolves late", async () => {
  const control = new AbortController(); state.counts.dms_document_links = 5001;
  state.fetch.mockImplementation((call: Call) => {const response = respond(call); if (call.source === "dms_document_links") control.abort(); return response;});
  const result = await read(documents, auth, control.signal); expect(result.success).toBe(false); expect(result.data).toBeUndefined();
});
it("a missing signal preserves the existing SSR reader contract and successful exact output", async () => {
  const result = await readHrDocumentBrowser(documents, auth); expect(result.success).toBe(true); expect(hrBrowserDocumentsPage.parse(result.data).totalCount).toBe(2);
  expect(state.auth).not.toHaveBeenCalled(); expect(state.client).toHaveBeenCalledTimes(1);
});
it("a genuinely pending SDK fetch observes abort and is not retried", async () => {
  const control = new AbortController(); let observed = false, releaseIgnored!: () => void;
  state.fetch.mockImplementation((call: Call) => new Promise<Response>((resolve, reject) => {
    releaseIgnored = () => resolve(respond(call));
    call.signal?.addEventListener("abort", () => {observed = true; reject(new DOMException("Synthetic aborted fetch", "AbortError"));}, {once: true});
  }));
  const result = read(employees, auth, control.signal); await vi.waitFor(() => expect(state.calls).toHaveLength(1));
  control.abort(); releaseIgnored(); expect((await result).success).toBe(false); expect(observed).toBe(true); expect(state.calls).toHaveLength(1);
});
it("abort after a late first metadata chunk suppresses all later chunks", async () => {
  const control = new AbortController(); state.rows.dms_document_links = Array.from({length: 501}, (_, i) => ({id: i + 1, document_id: i + 1}));
  state.rows.employee_identity_documents = []; state.rows.f03_read_documents = Array.from({length: 501}, (_, i) => ({...state.rows.f03_read_documents[0], id: i + 1}));
  state.fetch.mockImplementation((call: Call) => {const response = respond(call); if (call.source === "f03_read_documents") control.abort(); return response;});
  const result = await read(documents, auth, control.signal); expect(result.success).toBe(false); expect(result.data).toBeUndefined();
  expect(state.calls.filter(call => call.source === "dms_document_links")).toHaveLength(2);
  expect(state.calls.filter(call => call.source === "f03_read_documents")).toHaveLength(1);
});
it.each(["GET", "HEAD"])("abort on the exhausted %s range path cannot return an empty success or start another request", async target => {
  const control = new AbortController(); state.range416 = true;
  state.fetch.mockImplementation((call: Call) => {const response = respond(call); if (call.method === target) control.abort(); return response;});
  const result = await read({...employees, page: 5}, auth, control.signal); expect(result.success).toBe(false); expect(result.data).toBeUndefined();
  expect(state.calls).toHaveLength(target === "GET" ? 1 : 2);
});
it("identity-document file membership fallback also receives the same signal", async () => {
  const control = new AbortController(); state.rows.dms_document_links = []; state.rows.employee_identity_documents[0].dms_document_id = 2;
  const result = await read(files, auth, control.signal); expect(result.success).toBe(true);
  const fallback = state.calls.find(call => call.source === "employee_identity_documents"); expect(fallback?.method).toBe("HEAD"); expect(fallback?.signal).toBe(control.signal);
});
it("parallel links failure remains failure even if the identity source is oversized", async () => {
  state.fail = "dms_document_links"; state.counts.employee_identity_documents = 5001;
  const result = await read(documents, auth); expect(result.success).toBe(false); expect(result.data).toBeUndefined();
});
it("ordinary failed parallel identity reads cannot turn the permitted link subset into success", async () => {
  state.fail = "employee_identity_documents"; const result = await read(documents, auth);
  expect(result.success).toBe(false); expect(result.data).toBeUndefined(); expect(state.calls.some(call => call.source === "f03_read_documents")).toBe(false);
});
