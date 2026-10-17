import {beforeEach, expect, it, vi} from "vitest";
import type {AuthContext} from "@/lib/rbac/check";
type Row = Record<string, unknown>;
type Call = {table: string; methods: unknown[][]};
const state = vi.hoisted(() => ({ctx: {} as AuthContext, calls: [] as Call[], rows: {} as Record<string, Row[]>, fault: "", nullCount: "", short: "", clients: 0,
  rpcCalls: [] as unknown[][], preview: true, download: true, rpcFault: false, range416: false, afterRead: undefined as undefined | ((call: Call) => void)}));
vi.mock("@/lib/rbac/check", async () => ({...await import("@/lib/rbac/scope"), getAuthContext: async () => state.ctx}));
vi.mock("@/lib/supabase/server", () => ({createClient: async () => {
  state.clients++;
  return {rpc: (...args: unknown[]) => {
    state.rpcCalls.push(args);
    const response = {data: (args[1] as {permission_code: string}).permission_code.endsWith("preview") ? state.preview : state.download, error: state.rpcFault ? {message: "SYNTHETIC_PRIVATE"} : null};
    return {abortSignal: () => Promise.resolve(response), then: (resolve: (v: unknown) => unknown) => Promise.resolve(response).then(resolve)};
  }, from: (table: string) => {
    const call: Call = {table, methods: []}; state.calls.push(call);
    const builder: Record<string, unknown> = {then: (resolve: (r: unknown) => unknown) => {
      if (state.fault === table) return Promise.resolve({data: null, count: null, error: {message: "SYNTHETIC_PRIVATE_FAILURE"}}).then(resolve);
      let rows = [...(state.rows[table] ?? [])];
      for (const [method, key, value] of call.methods) {
        if (method === "eq") rows = rows.filter(row => row[String(key)] === value);
        if (method === "is") rows = rows.filter(row => (row[String(key)] ?? null) === value);
        if (method === "in") rows = rows.filter(row => (value as unknown[]).includes(row[String(key)]));
        if (method === "not") rows = rows.filter(row => !["archived", "superseded", "deleted"].includes(String(row[String(key)])));
        if (method === "gte") rows = rows.filter(row => String(row[String(key)]) >= String(value));
        if (method === "lte") rows = rows.filter(row => row[String(key)] != null && String(row[String(key)]) <= String(value));
        if (method === "ilike") rows = rows.filter(row => String(row[String(key)] ?? "").toLowerCase().includes(String(value).slice(1, -1).toLowerCase()));
        if (method === "or" && String(key).startsWith("title.")) {
          const expression = String(key), ids = expression.match(/id\.in\.\(([^)]+)\)/)?.[1].split(",").map(Number) ?? [];
          const term = expression.match(/title\.ilike\."?%([^%]*)%"?/)?.[1].toLowerCase() ?? "NO_MATCH";
          rows = rows.filter(row => ids.includes(Number(row.id)) || String(row.title).toLowerCase().includes(term) || String(row.document_no).toLowerCase().includes(term));
        }
      }
      const orders = call.methods.filter(m => m[0] === "order");
      rows.sort((a, b) => {for (const [, key, options] of orders) {const k = String(key), sign = (options as {ascending?: boolean} | undefined)?.ascending === false ? -1 : 1;
        const c = a[k] == null ? b[k] == null ? 0 : -1 : b[k] == null ? 1 : typeof a[k] === "number" ? Number(a[k]) - Number(b[k]) : String(a[k]).localeCompare(String(b[k])); if (c) return c * sign;} return 0;});
      const count = state.nullCount === table ? null : rows.length;
      const limit = call.methods.find(m => m[0] === "limit"), range = call.methods.find(m => m[0] === "range");
      if (state.range416 && range && Number(range[1]) > 0 && Number(range[1]) >= rows.length) return Promise.resolve({data: null, count: null, error: {code: "PGRST103"}, status: 416}).then(resolve);
      if (limit) rows = rows.slice(0, Number(limit[1]));
      if (range) rows = rows.slice(Number(range[1]), Number(range[2]) + 1);
      if (state.short === table) rows = rows.slice(0, 1);
      const head = (call.methods.find(m => m[0] === "select")?.[2] as {head?: boolean} | undefined)?.head;
      state.afterRead?.(call);
      return Promise.resolve({data: head ? null : rows, count, error: null, status: 200}).then(resolve);
    }};
    for (const method of ["select", "eq", "is", "in", "not", "or", "gte", "lte", "ilike", "textSearch", "order", "limit", "range", "abortSignal"]) builder[method] = (...args: unknown[]) => {call.methods.push([method, ...args]); return builder;};
    return builder;
  }};
}}));
import {searchDmsBrowser, getDmsBrowserDocumentTypes} from "@/server/actions/dms/browser";
import {DMS_BROWSER_READ_TIMEOUT_MS, readDmsBrowser} from "@/server/reads/dms-browser";
import {POST} from "@/app/api/reads/dms-browser/route";
import {dmsBrowserSearchPage, dmsBrowserFilesPage, dmsBrowserTypesPage, dmsBrowserResponseSchema, dmsBrowserCriteriaSchema} from "@/lib/reads/dms-browser-schema";
const doc = (id: number, extra: Row = {}) => ({id, document_no: `DOC-${id}`, title: `Document ${id}`, status: "active", issue_date: null, expiry_date: null,
  created_at: "2026-01-01T00:00:00+00:00", is_archived: false, deleted_at: null, document_type: {type_code: "TEST", name_en: "Evidence"}, files: [], ...extra});
const content = (n: number, extra: Row = {}) => ({id: n, document_id: n, content_text: "needle evidence", ...extra});
const link = (n: number, extra: Row = {}) => ({id: n, document_id: n, entity_type: "employee", deleted_at: null, ...extra});
const file = (n: number, extra: Row = {}) => ({id: n, document_id: 1, file_name: `Synthetic ${n}.pdf`, mime_type: "application/pdf", file_size_bytes: 12, deleted_at: null, ...extra});
beforeEach(() => {Object.assign(state, {calls: [], clients: 0, fault: "", nullCount: "", short: "", rpcCalls: [], preview: true, download: true, rpcFault: false, range416: false, afterRead: undefined,
  rows: {dms_documents: [doc(1)], dms_document_content: [], dms_document_links: [], dms_document_files: [file(1)], dms_document_types: []}});
  state.ctx = {profile: {id: 1, auth_user_id: "synthetic", must_change_password: false}, isAccountActive: true, accountStatus: "active", permissionCodes: ["dms.admin"], roleCodes: [], roleAssignments: []} as unknown as AuthContext;
});
it("content matches beyond 200 are included in the exact filtered total and stable page", async () => {
  state.rows.dms_documents = Array.from({length: 1107}, (_, i) => doc(i + 1));
  state.rows.dms_document_content = state.rows.dms_documents.map(row => ({id: row.id, document_id: row.id, content_text: "needle evidence"}));
  const result = await searchDmsBrowser({query: "needle", offset: 1100, limit: 25});
  expect(result.success).toBe(true); expect(result.data?.total).toBe(1107); expect(result.data?.rows).toHaveLength(7);
});
it.each(["dms_document_content", "dms_document_links"])("%s failure cannot be advertised as a successful empty search", async table => {
  state.fault = table;
  const result = await searchDmsBrowser({query: "needle", linkedEntityType: table.endsWith("links") ? "employee" : undefined});
  expect(result.success).toBe(false); expect(result.data).toBeUndefined(); expect(JSON.stringify(result)).not.toContain("SYNTHETIC_PRIVATE");
});
it("a missing exact total is not replaced by the page length", async () => {
  state.nullCount = "dms_documents";
  const result = await searchDmsBrowser({query: ""}); expect(result.success).toBe(false); expect(result.data).toBeUndefined();
});
it("created-at ties have a deterministic native document ID tie-breaker", async () => {
  await searchDmsBrowser({query: ""});
  expect(state.calls.find(c => c.table === "dms_documents")?.methods).toContainEqual(["order", "id", {ascending: false}]);
});
const search = (extra = {}) => readDmsBrowser({operation: "search", query: "", ...extra});
it("ordinary metadata browsing remains one native page, with no eager nested files or content text", async () => {
  state.rows.dms_documents = Array.from({length: 1107}, (_, i) => doc(i + 1));
  const page = dmsBrowserSearchPage.parse((await search({offset: 1100})).data);
  expect(page.totalCount).toBe(1107); expect(page.rows).toHaveLength(7); expect(state.calls).toHaveLength(1); expect(state.clients).toBe(1);
  expect(state.calls[0].methods).toContainEqual(["range", 1100, 1124]);
  expect(String(state.calls[0].methods.find(m => m[0] === "select")?.[1])).not.toMatch(/files|content_text|storage_path/);
});
it("all linked IDs are traversed past 1000 and duplicate links do not double-count documents", async () => {
  state.rows.dms_document_links = [...Array.from({length: 1107}, (_, i) => link(i + 1)), link(2000, {document_id: 1107}), link(2001, {document_id: 1, deleted_at: "2026-01-01"})];
  state.rows.dms_documents = Array.from({length: 1108}, (_, i) => doc(i + 1));
  const page = dmsBrowserSearchPage.parse((await search({linkedEntityType: "employee", offset: 1100})).data);
  expect(page.totalCount).toBe(1107); expect(page.rows.map(r => r.id)).toEqual([7, 6, 5, 4, 3, 2, 1]);
  expect(state.calls.filter(c => c.table === "dms_document_links")).toHaveLength(3);
  expect(state.calls.filter(c => c.table === "dms_documents").every(c => (c.methods.find(m => m[0] === "in")?.[2] as number[]).length <= 200)).toBe(true);
});
it("complete metadata/content union deduplicates overlapping matches and keeps native filters on every branch", async () => {
  state.rows.dms_document_content = [content(2), content(3), content(4), content(5), content(6)];
  state.rows.dms_documents = [doc(1, {title: "needle metadata", document_type_id: 7, issue_date: "2026-01-10"}), doc(2, {title: "needle both", document_type_id: 7, issue_date: "2026-01-10"}), doc(3, {document_type_id: 7, issue_date: "2026-01-10"}), doc(4, {document_type_id: 8, issue_date: "2026-01-10"}), doc(5, {document_type_id: 7, issue_date: "2025-01-10"}), doc(6, {document_type_id: 7, issue_date: "2026-01-10", status: "expired"})];
  const page = dmsBrowserSearchPage.parse((await search({query: "needle", status: "active", documentTypeIds: [7], issueDateFrom: "2026-01-01", issueDateTo: "2026-12-31"})).data);
  expect(page.totalCount).toBe(3); expect(page.rows.map(r => [r.id, r.matchSource])).toEqual([[3, "content"], [2, "both"], [1, "metadata"]]);
  for (const call of state.calls.filter(c => c.table === "dms_documents")) {
    expect(call.methods).toContainEqual(["eq", "status", "active"]); expect(call.methods).toContainEqual(["in", "document_type_id", [7]]); expect(call.methods).toContainEqual(["gte", "issue_date", "2026-01-01"]);
  }
});
it.each(["DOC-1234", "1234"])("document-number precedence for %s never broadens into title/content IDs", async query => {
  state.rows.dms_documents = [doc(1, {document_no: query}), doc(2, {title: query})]; state.rows.dms_document_content = [content(1, {content_text: query}), content(2, {content_text: query})];
  const page = dmsBrowserSearchPage.parse((await search({query})).data); expect(page.rows.map(r => r.id)).toEqual([1]);
  expect(state.calls.find(c => c.table === "dms_documents")?.methods).toContainEqual(["ilike", "document_no", `%${query}%`]);
});
it("one-character queries skip FTS while date expansion preserves the exact legacy plain/simple expression", async () => {
  await search({query: "a"}); expect(state.calls.some(c => c.table === "dms_document_content")).toBe(false); state.calls = [];
  await search({query: "09 August 2026"});
  expect(state.calls[0].methods).toContainEqual(["textSearch", "content_text", "09 August 2026 09/08 08/09 09-08 08-09 09.08 AUG 2026", {type: "plain", config: "simple"}]);
});
it("OR grammar punctuation is quoted while legacy wildcard pattern operators are not silently rewritten", async () => {
  await search({query: 'a%,title.eq."secret"_\\tail'});
  expect(state.calls.find(c => c.table === "dms_documents")?.methods.find(m => m[0] === "or")?.[1]).toBe('title.ilike."%a%,title.eq.\\"secret\\"_\\\\tail%",document_no.ilike."%a%,title.eq.\\"secret\\"_\\\\tail%"');
});
it("content candidate reads are lean and excerpts are read only for the final authorized page", async () => {
  state.rows.dms_documents = [doc(1), doc(2)]; state.rows.dms_document_content = [content(1), content(2, {content_text: `${"x".repeat(100)} needle ${"y".repeat(200)}`})];
  const page = dmsBrowserSearchPage.parse((await search({query: "needle", limit: 1})).data);
  expect(page.rows[0].id).toBe(2); expect(page.rows[0].contentExcerpt?.length).toBeLessThanOrEqual(122); expect(page.rows[0].contentExcerpt).toMatch(/^….*needle.*…$/);
  const calls = state.calls.filter(c => c.table === "dms_document_content"); expect(calls[0].methods).toContainEqual(["select", "id,document_id", {count: "exact", head: false}]);
  expect(calls[1].methods).toContainEqual(["in", "document_id", [2]]); expect(JSON.stringify(page)).not.toContain("content_text"); expect(JSON.stringify(page)).not.toContain("yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy");
});
it("cross-batch composition preserves NULLS FIRST and sub-millisecond created-at ordering", async () => {
  state.rows.dms_document_links = [link(1), link(2), link(3), link(4)];
  state.rows.dms_documents = [doc(1, {created_at: "2026-01-01T00:00:00.000002Z"}), doc(2, {created_at: "2026-01-01T04:00:00.000001+04:00"}), doc(3, {created_at: null}), doc(4, {created_at: "2026-01-01T00:00:00.000002+00:00"})];
  const page = dmsBrowserSearchPage.parse((await search({linkedEntityType: "employee"})).data); expect(page.rows.map(r => r.id)).toEqual([3, 4, 1, 2]);
});
it.each(["dms_documents", "dms_document_content", "dms_document_links"])("%s malformed/partial counts fail closed without raw errors", async table => {
  state.rows.dms_documents = [doc(1), doc(2)]; state.rows.dms_document_content = [content(1), content(2)]; state.rows.dms_document_links = [link(1), link(2)]; state.nullCount = table;
  const result = await search({query: "needle", linkedEntityType: "employee"}); expect(result.success).toBe(false); expect(result.data).toBeUndefined();
});
it.each(["dms_document_content", "dms_document_links"])("a provider-short %s page is not mistaken for complete", async table => {
  state.rows[table] = table.endsWith("content") ? [content(1), content(2)] : [link(1), link(2)]; state.short = table;
  expect((await search({query: "needle", linkedEntityType: "employee"})).success).toBe(false);
});
it("changed counts between source pages fail and never return the first page", async () => {
  state.rows.dms_document_content = Array.from({length: 501}, (_, i) => content(i + 1));
  state.afterRead = call => {if (call.table === "dms_document_content") state.rows.dms_document_content.push(content(900));};
  expect((await search({query: "needle"})).success).toBe(false);
});
it.each(["content", "links", "types"])("oversized %s composition is explicit and carries no row/count claim", async source => {
  const table = source === "content" ? "dms_document_content" : source === "links" ? "dms_document_links" : "dms_document_types";
  state.rows[table] = Array.from({length: 5001}, (_, i) => source === "content" ? content(i + 1) : source === "links" ? link(i + 1) : {id: i + 1, type_code: "TEST", name_en: "Test", is_active: true});
  const result = source === "types" ? await readDmsBrowser({operation: "types"}) : await search({query: "needle", linkedEntityType: source === "links" ? "employee" : ""});
  expect(result.data).toMatchObject({availability: "too_large"}); expect(result.data).not.toHaveProperty("rows"); expect(result.data).not.toHaveProperty("totalCount");
});
it.each(["missing", "inactive", "password"])("%s authorization stops before any client/source read", async mode => {
  if (mode === "missing") state.ctx.permissionCodes = []; if (mode === "inactive") state.ctx.isAccountActive = false; if (mode === "password") state.ctx.profile!.must_change_password = true;
  expect(await search()).toEqual({success: false, error: "Permission denied"}); expect(state.clients).toBe(0);
});
it("preserves explicit confidentiality/owner/creator restriction in addition to native RLS", async () => {
  state.ctx.permissionCodes = ["dms.documents.view", "dms.documents.view.hr"];
  await search(); expect(state.calls[0].methods).toContainEqual(["or", "confidentiality_level.in.(internal,company,hr),owner_user_id.eq.1,created_by.eq.1"]);
});
it("selected files are independently authorized, ranged, lean and capability separated", async () => {
  state.rows.dms_document_files = [...Array.from({length: 31}, (_, i) => file(i + 1)), file(88, {document_id: 2}), file(99, {deleted_at: "2026-01-01"})]; state.preview = false;
  const page = dmsBrowserFilesPage.parse((await readDmsBrowser({operation: "files", documentId: 1, offset: 25})).data);
  expect(page.totalCount).toBe(31); expect(page.rows.map(r => r.id)).toEqual([26, 27, 28, 29, 30, 31]); expect(page.canPreview).toBe(false); expect(page.canDownload).toBe(true);
  expect(state.rpcCalls.map(c => c[1])).toEqual([{document_id: 1, permission_code: "dms.documents.preview"}, {document_id: 1, permission_code: "dms.documents.download"}]);
  expect(JSON.stringify(page)).not.toMatch(/storage_path|bucket|signed/);
});
it("absent selected document is non-enumerating unavailable, not no files", async () => {
  state.rows.dms_documents = [];
  const result = await readDmsBrowser({operation: "files", documentId: 1}); expect(result.data).toMatchObject({availability: "unavailable"}); expect(result.data).not.toHaveProperty("document"); expect(result.data).not.toHaveProperty("rows"); expect(state.rpcCalls).toHaveLength(0);
});
it("file capability failure does not become a false permission or an empty attachment list", async () => {
  state.rpcFault = true; expect((await readDmsBrowser({operation: "files", documentId: 1})).success).toBe(false);
});
it("valid out-of-range page is confirmed by an exact count-only recheck", async () => {
  state.range416 = true; const page = dmsBrowserSearchPage.parse((await search({offset: 25})).data); expect(page.totalCount).toBe(1); expect(page.rows).toEqual([]);
  expect(state.calls).toHaveLength(2); expect(state.calls[1].methods.find(m => m[0] === "select")?.[2]).toEqual({count: "exact", head: true});
});
it("types are complete beyond provider caps and failed legacy catalogue access does not silently return []", async () => {
  state.rows.dms_document_types = Array.from({length: 1107}, (_, i) => ({id: i + 1, type_code: `T${i}`, name_en: "Synthetic", is_active: true}));
  expect(dmsBrowserTypesPage.parse((await readDmsBrowser({operation: "types"})).data).rows).toHaveLength(1107);
  state.fault = "dms_document_types"; await expect(getDmsBrowserDocumentTypes()).rejects.toThrow(/could not be completely loaded/);
});
it("already-aborted and mid-source aborted requests stop downstream work", async () => {
  const initial = new AbortController(); initial.abort(); expect((await readDmsBrowser({operation: "search"}, undefined, initial.signal)).success).toBe(false); expect(state.clients).toBe(0);
  const next = new AbortController(); state.afterRead = () => next.abort(); expect((await readDmsBrowser({operation: "search", query: "needle"}, undefined, next.signal)).success).toBe(false); expect(state.calls).toHaveLength(1);
  const bounded = state.calls[0].methods.find(m => m[0] === "abortSignal")?.[1] as AbortSignal;
  expect(bounded.aborted).toBe(true);
});
it("one finite deadline covers the complete multi-source attempt and prevents further pages", async () => {
  const deadline = new AbortController(), timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
  try {
    state.rows.dms_document_content = Array.from({length: 501}, (_, i) => content(i + 1));
    state.afterRead = () => deadline.abort();
    expect((await search({query: "needle"})).success).toBe(false); expect(state.calls).toHaveLength(1);
    expect(timeout).toHaveBeenCalledExactlyOnceWith(DMS_BROWSER_READ_TIMEOUT_MS); expect(DMS_BROWSER_READ_TIMEOUT_MS).toBe(15000);
    expect((state.calls[0].methods.find(m => m[0] === "abortSignal")?.[1] as AbortSignal).aborted).toBe(true);
  } finally {timeout.mockRestore();}
});
it.each([{limit: 101}, {offset: -1}, {query: "x".repeat(201)}, {issueDateFrom: "2026-02-30"}, {documentTypeIds: [NaN]}, {admin: true}])("rejects invalid bounded criteria %j before authentication/client creation", async extra => {
  const result = await search(extra); expect(result.error).toMatch(/^Invalid /); expect(state.clients).toBe(0);
});
it("response schemas reject private fields, duplicate IDs, fake counts and unavailable existence hints", () => {
  const criteria = dmsBrowserCriteriaSchema.parse({operation: "search"}), row = {id: 1, documentNo: "DOC-1", title: "Test", typeNameEn: null, typeCode: null, status: "active", issueDate: null, expiryDate: null, matchSource: "metadata", contentExcerpt: null};
  const page = {criteria, asOf: new Date().toISOString(), availability: "available", totalCount: 1, rows: [row]};
  expect(dmsBrowserResponseSchema.safeParse(page).success).toBe(true);
  for (const value of [{...page, totalCount: 2}, {...page, rows: [{...row, content_text: "SECRET"}]}, {...page, totalCount: 2, rows: [row, row]}, {criteria: {operation: "files", documentId: 1}, asOf: page.asOf, availability: "unavailable", exists: true}]) expect(dmsBrowserResponseSchema.safeParse(value).success).toBe(false);
});
it("read route is private, uncached, bound to request cancellation, and sanitizes failures", async () => {
  const request = () => new Request("http://localhost/api/reads/dms-browser", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({operation: "search"})});
  const ok = await POST(request()); expect(ok.status).toBe(200); expect(ok.headers.get("Cache-Control")).toBe("private, no-store, max-age=0"); expect(ok.headers.get("Vary")).toBe("Cookie"); expect(state.calls[0].methods.some(m => m[0] === "abortSignal")).toBe(true);
  state.fault = "dms_documents"; const failed = await POST(request()); expect(failed.status).toBe(503); expect(await failed.text()).not.toContain("SYNTHETIC_PRIVATE");
  state.ctx.permissionCodes = []; expect((await POST(request())).status).toBe(403);
});
