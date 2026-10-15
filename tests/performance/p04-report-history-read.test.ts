import {afterEach, expect, it, vi} from "vitest";
const state = vi.hoisted(() => ({permissions: ["reports.view"], active: true, password: false, authReads: 0, calls: [] as unknown[][], result: {} as unknown, queue: [] as unknown[]}));
vi.mock("@/lib/rbac/check", async () => ({...await import("@/lib/rbac/scope"), getAuthContext: async () => {
  state.authReads++; return {profile: {id: 6, must_change_password: state.password}, isAccountActive: state.active, permissionCodes: state.permissions, roleCodes: [], roleAssignments: []};
}}));
vi.mock("@/lib/supabase/server", () => ({createClient: async () => ({from: (...args: unknown[]) => {
  state.calls.push(["from", ...args]);
  const query: Record<string, unknown> = {then: (resolve: (r: unknown) => unknown) => Promise.resolve(state.queue.length ? state.queue.shift() : state.result).then(resolve)};
  for (const method of ["select", "or", "ilike", "eq", "gte", "lt", "order", "range", "maybeSingle", "abortSignal"]) query[method] = (...values: unknown[]) => {state.calls.push([method, ...values]); return query;};
  return query;
}})}));
import {readReportHistory} from "@/server/reads/report-history";
import {POST} from "@/app/api/reads/report-history/route";
import {REPORT_HISTORY_ORDER_CONTRACT, REPORT_HISTORY_SORT_KEYS, reportHistoryCriteriaSchema, reportHistoryPageSchema, reportHistoryRowSchema} from "@/lib/reads/report-history-schema";
import {literalContains} from "@/lib/reads/search";
const row = {id: 3, report_code: "PERF-REPORT", run_reference: "PERF-RUN", run_status: "success", output_format: "pdf", row_count: 10, duration_ms: 15, run_by: 6, started_at: "2026-10-05T00:00:00+00:00", sensitive_data_included: false, was_multi_company: false, report: {report_name_en: "Synthetic report", module_code: "hr"}, runner: {display_name: "Synthetic runner"}};
const detail = {...row, completed_at: "2026-10-05T00:00:01+00:00", template_selected_manually: false, error_message: null, redaction_summary_json: {wasRedacted: true, totalFieldsRedacted: 1, redactedFields: [{field: "synthetic", action: "masked", reason: "test"}]}};
afterEach(() => Object.assign(state, {permissions: ["reports.view"], active: true, password: false, authReads: 0, calls: [], result: {}, queue: []}));

it("reaches a page beyond 1,000 runs with a complete count and minimal listing projection", async () => {
  state.result = {data: [{...row, error_message: "PRIVATE_DETAIL_ONLY", filters_json: {secret: "PRIVATE_FILTER"}, owner_company_ids: [1], report_sort: ["PRIVATE_KEY"], runner_sort: ["PRIVATE_KEY"], duration_sort: 15, report_display: "PRIVATE_LABEL", runner_display: "PRIVATE_LABEL", rows_search: "10"}], count: 1101, error: null};
  const result = await readReportHistory({page: 12, pageSize: 100});
  expect(result.success).toBe(true); expect(result.data).toEqual({mode: "list", page: 12, pageSize: 100, totalCount: 1101, rows: [reportHistoryRowSchema.parse(row)]});
  expect(state.calls).toContainEqual(["range", 1100, 1199]); expect(state.authReads).toBe(1);
  const select = String(state.calls.find(c => c[0] === "select")?.[1]);
  expect(select.split(",")).toHaveLength(13);
  for (const excluded of ["*", "filters_json", "redaction_summary_json", "error_message", "owner_company_ids", "completed_at", "_sort", "_search", "_display"]) expect(select).not.toContain(excluded);
  expect(JSON.stringify(result)).not.toContain("PRIVATE_");
});
it.each([["report", "report_sort"], ["output_format", "output_format"], ["run_status", "run_status"], ["row_count", "row_count"], ["duration", "duration_sort"], ["run_by", "runner_sort"], ["started_at", "started_at"]])("%s uses its reviewed full-result ordering and a deterministic tie break", async (id, column) => {
  state.result = {data: [], count: 0, error: null};
  for (const desc of [false, true]) {
    state.calls = []; expect((await readReportHistory({sorting: [{id, desc}]})).success).toBe(true);
    expect(state.calls.filter(c => c[0] === "order")).toEqual([["order", column, {ascending: !desc, nullsFirst: false}], ["order", "id", {ascending: true}]]);
    expect(state.calls.findIndex(c => c[0] === "order")).toBeLessThan(state.calls.findIndex(c => c[0] === "range"));
  }
});
it("masked-label search uses only the reviewed caller-RLS view before paging, without lookup or capped fallback", async () => {
  state.result = {data: [], count: 0, error: null};
  const search = 'تقرير_%,()"';
  expect((await readReportHistory({search, columnFilters: {report_code: "PERF_%", run_reference: "REF_%"}})).success).toBe(true);
  const projection = String(state.calls.find(c => c[0] === "select")?.[1]);
  expect(projection).toBe("id,report_code,run_reference,run_status,output_format,row_count,duration_ms,run_by,started_at,sensitive_data_included,was_multi_company,report,runner");
  expect(state.calls).toContainEqual(["ilike", "report_code", "%PERF\\_\\%%"]); expect(state.calls).toContainEqual(["ilike", "run_reference", "%REF\\_\\%%"]);
  expect(state.calls.filter(c => c[0] === "or")).toEqual([["or", ["report_display", "format_search", "status_search", "rows_search", "duration_search", "runner_display", "started_search", "code_search", "reference_search"].map(key => `${key}.ilike.${literalContains(search)}`).join(",")]]);
  expect(state.calls.findLastIndex(c => c[0] === "or")).toBeLessThan(state.calls.findIndex(c => c[0] === "range"));
  expect(state.calls.filter(c => c[0] === "from")).toEqual([["from", "perf_report_history_read"]]);
});
it("runner substring search and exact native/accessor filters retain explicit typed semantics", async () => {
  state.result = {data: [], count: 0, error: null};
  await readReportHistory({search: "6", columnFilters: {row_count: "0", duration: "15", run_status: "success", output_format: "pdf", started_at: "2026-12-31"}});
  expect(state.calls.some(c => c[0] === "or" && String(c[1]).includes('runner_display.ilike."%6%"'))).toBe(true);
  expect(JSON.stringify(state.calls)).not.toContain("run_by.eq");
  for (const pair of [["row_count", 0], ["duration_sort", 15], ["run_status", "success"], ["output_format", "pdf"]]) expect(state.calls).toContainEqual(["eq", ...pair]);
  expect(state.calls).toContainEqual(["gte", "started_at", "2026-12-31T00:00:00Z"]); expect(state.calls).toContainEqual(["lt", "started_at", "2027-01-01T00:00:00.000Z"]);
});
it.each(["reports.view", "reports.history.view"])("%s preserves the existing either-permission authorization", async permission => {
  state.permissions = [permission]; state.result = {data: [{...row, report: null, runner: null}], count: 1, error: null};
  const result = await readReportHistory({}); expect(result.success).toBe(true); expect(result.data).toMatchObject({rows: [{report: null, runner: null}]});
});
it.each(["no-role", "suspended", "password"])("%s is denied before any database read", async kind => {
  if (kind === "no-role") state.permissions = []; if (kind === "suspended") state.active = false; if (kind === "password") state.password = true;
  expect((await readReportHistory({})).error).toBe("Permission denied"); expect((await readReportHistory({mode: "detail", recordId: 3})).error).toBe("Permission denied"); expect(state.calls).toHaveLength(0);
});
it.each([{page: 0}, {page: 100001}, {pageSize: 101}, {sortKey: "report"}, {sortDir: "desc"}, {sorting: [{id: "filters_json", desc: false}]}, {sorting: [{id: "id", desc: true}]}, {sorting: [{id: "report", desc: "false"}]}, {sorting: [{id: "report", desc: false, nullsFirst: true}]}, {sorting: [{id: "report", desc: true}, {id: "report", desc: false}]}, {sorting: Array.from({length: 8}, () => ({id: "report", desc: false}))}, {search: "x".repeat(201)}, {columnFilters: {owner_company_id: "1"}}, {columnFilters: {started_at: "2026-02-30"}}, {columnFilters: {row_count: "1.5"}}, {columnFilters: {duration: "2147483648"}}, {mode: "detail", recordId: 0}, {mode: "detail", recordId: 3, context: {admin: true}}])("rejects unreviewed criteria before auth: %j", async bad => {
  expect((await readReportHistory(bad)).success).toBe(false); expect(state.authReads).toBe(0); expect(state.calls).toHaveLength(0);
});
it.each([{data: [], count: null}, {data: [], count: 1}, {data: [row, row], count: 2}, {data: [{id: 3}], count: 1}, {data: [row], count: -1}, {data: [], count: 0, error: {code: "57014"}}])("never converts incomplete or failed history to successful empty data: %j", async result => {
  state.result = result; expect((await readReportHistory({})).success).toBe(false);
});
it("only verified zero counts are accepted, and null baseline values are not fabricated", async () => {
  state.result = {data: [], count: 0, error: null}; expect((await readReportHistory({})).data).toMatchObject({rows: [], totalCount: 0});
  state.result = {data: [{...row, started_at: null, row_count: null, duration_ms: null, run_by: null, report: null, runner: null, run_status: null}], count: 1};
  expect((await readReportHistory({})).data).toMatchObject({rows: [{run_by: null, started_at: null, run_status: null}]});
});
it("forwards the exact request AbortSignal to list and detail reads", async () => {
  const signal = new AbortController().signal;
  state.result = {data: [], count: 0, error: null}; await readReportHistory({}, undefined, signal);
  state.result = {data: detail, error: null}; await readReportHistory({mode: "detail", recordId: 3}, undefined, signal);
  expect(state.calls.filter(c => c[0] === "abortSignal")).toEqual([["abortSignal", signal], ["abortSignal", signal]]);
});
it("a 416 recount preserves projection/search/filter predicates without requesting all rows", async () => {
  state.queue = [{data: null, status: 416, error: {code: "PGRST103"}}, {data: null, count: 1107, error: null}];
  const result = await readReportHistory({page: 13, pageSize: 100, search: "report_%", columnFilters: {run_status: "success"}});
  expect(result.data).toMatchObject({rows: [], totalCount: 1107});
  const selects = state.calls.filter(c => c[0] === "select"); expect(selects).toHaveLength(2); expect(selects[0][1]).toBe(selects[1][1]); expect(selects[1][2]).toEqual({head: true, count: "exact"});
  expect(state.calls.filter(c => c[0] === "eq")).toEqual([["eq", "run_status", "success"], ["eq", "run_status", "success"]]); expect(state.calls.filter(c => c[0] === "range")).toHaveLength(1);
});
it.each([null, -1, 1201, 1.5])("rejects unverified recount %j", async count => {
  state.queue = [{data: null, status: 416, error: {code: "PGRST103"}}, {data: null, count, error: null}];
  expect((await readReportHistory({page: 13, pageSize: 100})).success).toBe(false);
});
it.each([{page: 1, status: 416, code: "PGRST103"}, {page: 13, status: 503, code: "57014"}, {page: 13, status: 416, code: "OTHER"}])("does not retry unrelated failure via a successful recount: %j", async ({page, status, code}) => {
  state.result = {data: null, status, error: {code}}; expect((await readReportHistory({page})).success).toBe(false); expect(state.calls.filter(c => c[0] === "select")).toHaveLength(1);
});
it("loads exactly one selected complete detail without filters or unrelated stored data", async () => {
  state.result = {data: {...detail, filters_json: {private: "PRIVATE_FILTER"}, unexpected: "PRIVATE_COLUMN"}, error: null};
  const result = await readReportHistory({mode: "detail", recordId: 3}); expect(result.data).toEqual({mode: "detail", record: detail});
  expect(state.calls).toContainEqual(["eq", "id", 3]); expect(state.calls).toContainEqual(["maybeSingle"]); expect(JSON.stringify(result)).not.toContain("PRIVATE_");
  expect(state.calls.filter(c => c[0] === "from")).toEqual([["from", "erp_report_runs"]]);
});
it.each([null, {...detail, id: 4}, {...detail, redaction_summary_json: {wasRedacted: "false"}}, {...detail, completed_at: "not-a-date"}])("unavailable or malformed detail does not masquerade as complete: %j", async data => {
  state.result = {data, error: null}; expect((await readReportHistory({mode: "detail", recordId: 3})).success).toBe(false);
});
it("the route keeps reads uncached/correlated and error details opaque", async () => {
  state.result = {data: null, count: null, error: {message: "PRIVATE_DATABASE_ERROR"}};
  const response = await POST(new Request("http://localhost/api/reads/report-history", {method: "POST", headers: {"Content-Type": "application/json"}, body: "{}"}));
  expect(response.status).toBe(503); expect(response.headers.get("Cache-Control")).toContain("no-store"); expect(response.headers.get("Vary")).toContain("Cookie"); expect(response.headers.get("X-ERP-Correlation")).toBeTruthy(); expect(await response.text()).not.toContain("PRIVATE_DATABASE_ERROR");
  const large = await POST(new Request("http://localhost/api/reads/report-history", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({search: "x".repeat(5000)})})); expect(large.status).toBe(400);
});
it("schema defaults and row completeness are explicit contracts", () => {
  expect(REPORT_HISTORY_ORDER_CONTRACT).toBe("RH-NATURAL-ICU-UTF8-V1");
  expect(reportHistoryCriteriaSchema.parse({})).toEqual({mode: "list", page: 1, pageSize: 25, search: "", sorting: [{id: "started_at", desc: true}], columnFilters: {}});
  expect(reportHistoryPageSchema.safeParse({mode: "list", page: 1, pageSize: 1, totalCount: 2, rows: [row, {...row, id: 4}]}).success).toBe(false);
});
it("all seven unique sorts preserve request priority/directions and append the ID tie only once", async () => {
  const sorting = REPORT_HISTORY_SORT_KEYS.map((id, index) => ({id, desc: index % 2 === 0}));
  state.result = {data: [], count: 0, error: null}; expect((await readReportHistory({sorting})).success).toBe(true);
  const orderedColumns = ["report_sort", "output_format", "run_status", "row_count", "duration_sort", "runner_sort", "started_at"];
  expect(state.calls.filter(c => c[0] === "order")).toEqual([...orderedColumns.map((column, index) => ["order", column, {ascending: index % 2 !== 0, nullsFirst: false}]), ["order", "id", {ascending: true}]]);
});
it("explicitly clearing all column sorts still orders the full result by stable ID", async () => {
  state.result = {data: [], count: 0, error: null}; expect((await readReportHistory({sorting: []})).success).toBe(true);
  expect(state.calls.filter(c => c[0] === "order")).toEqual([["order", "id", {ascending: true}]]);
});
it.each([" ", "  ", "\t", "\n", "  Report2  ", "تقرير 12", "0", "12", "null", "2026-10", 'x_%\\(),"', "A".repeat(200)])("literal global input %j is not trimmed, tokenized, truncated or limited to currently loaded values", async search => {
  state.result = {data: [], count: 0, error: null}; expect((await readReportHistory({search})).success).toBe(true);
  expect(reportHistoryCriteriaSchema.parse({search}).search).toBe(search);
  const or = state.calls.filter(c => c[0] === "or"); expect(or).toHaveLength(1);
  expect(or[0][1]).toBe(["report_display", "format_search", "status_search", "rows_search", "duration_search", "runner_display", "started_search", "code_search", "reference_search"].map(key => `${key}.ilike.${literalContains(search)}`).join(","));
});
it("only empty global input disables search", async () => {
  state.result = {data: [], count: 0, error: null}; await readReportHistory({search: ""}); expect(state.calls.some(c => c[0] === "or")).toBe(false);
});
it.each(["0", "-1", "2147483647"])("duration filter %s targets the null-as-zero accessor without rewriting the displayed raw duration", async duration => {
  state.result = {data: [{...row, duration_ms: null}], count: 1, error: null}; const result = await readReportHistory({columnFilters: {duration}});
  expect(state.calls).toContainEqual(["eq", "duration_sort", Number(duration)]); expect(result.data).toMatchObject({rows: [{duration_ms: null}]});
});
it.each(["42P01", "42703", "42501", "PGRST205", "57014"])("missing, incompatible, denied or unavailable read model %s never falls back or invents an empty page", async code => {
  state.result = {data: [], count: 0, error: {code, message: "PRIVATE_NATIVE_MODEL"}}; const result = await readReportHistory({});
  expect(result.success).toBe(false); expect(JSON.stringify(result)).not.toContain("PRIVATE_NATIVE_MODEL"); expect(state.calls.filter(c => c[0] === "from")).toEqual([["from", "perf_report_history_read"]]);
});
