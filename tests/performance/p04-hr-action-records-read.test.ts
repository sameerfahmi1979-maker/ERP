import {afterEach, expect, it, vi} from "vitest";
const s = vi.hoisted(() => ({grant: true as boolean | null, active: true, password: false, permissions: ["hr.actions.view", "hr.eos.view", "hr.confidential.view"], authReads: 0, calls: [] as unknown[][], result: {} as unknown, queue: [] as unknown[], subject: {data: {id: 100}, error: null} as {data: {id: number} | null; error: unknown}}));
vi.mock("@/lib/rbac/check", async () => ({...await import("@/lib/rbac/scope"), getAuthContext: async () => {s.authReads++; return {profile: {id: 6, must_change_password: s.password}, isAccountActive: s.active, permissionCodes: s.permissions, roleCodes: [], roleAssignments: []};}}));
vi.mock("@/lib/supabase/server", () => ({createClient: async () => ({rpc: async () => ({data:s.grant,error:null}),from: (...v: unknown[]) => {if (v[0] === "employees") {const q: Record<string, unknown> = {maybeSingle: async () => s.subject}; for (const name of ["select", "eq", "is"]) q[name] = () => q; return q;} s.calls.push(["from", ...v]); const q: Record<string, unknown> = {then: (resolve: (r: unknown) => unknown) => Promise.resolve(s.queue.length ? s.queue.shift() : s.result).then(resolve)}; for (const name of ["select", "is", "or", "ilike", "eq", "gte", "lt", "order", "range", "maybeSingle"]) q[name] = (...args: unknown[]) => {s.calls.push([name, ...args]); return q;}; return q;}})}));
import {readHrActionRecords, readHrActionRecordDetail} from "@/server/reads/hr-action-records";
import {POST as pagePost} from "@/app/api/reads/hr-action-records/route";
import {POST as detailPost} from "@/app/api/reads/hr-action-record-detail/route";
import {HR_ACTION_RECORD_KINDS, HR_ACTION_RECORD_CONFIG, hrActionRecordRowSchemas, hrActionRecordDetailSchemas, hrActionRecordCriteriaSchema, type HrActionRecordKind} from "@/lib/reads/hr-action-records-schema";
import type {HrOperationsField} from "@/lib/reads/hr-operations-schema";
import {actionRecordDetail} from "./hr-action-record-fixtures";

it.each([false,null])("does not turn denied or unverifiable employee capability %s into empty action success",async grant=>{
  s.grant=grant;s.result={data:[],count:0,error:null};
  expect((await readHrActionRecords({kind:"pro",employeeId:100})).success).toBe(false);
  expect((await readHrActionRecordDetail({kind:"pro",employeeId:100,recordId:1})).success).toBe(false);
  expect(s.calls).toHaveLength(0);
});
const criteria = (kind: HrActionRecordKind) => ({kind, employeeId: 100, ...(kind === "clearance" ? {eosCaseId: 300} : {})});
const parent = () => ({data: {id: 300, employee_id: 100}, error: null});
const parentFor = (kind: HrActionRecordKind) => {if (kind === "clearance") s.queue.push(parent());};
afterEach(() => {Object.assign(s, {grant:true, active: true, password: false, permissions: ["hr.actions.view", "hr.eos.view", "hr.confidential.view"], authReads: 0, calls: [], result: {}, queue: [], subject: {data: {id: 100}, error: null}});});
it.each(HR_ACTION_RECORD_KINDS)("%s returns bounded exact pages with no private wording or unallowlisted columns", async kind => {
  parentFor(kind); s.result = {data: [{...actionRecordDetail(kind), salary: "SYNTHETIC_PRIVATE_SALARY"}], count: 1101, error: null};
  const r = await readHrActionRecords({...criteria(kind), page: 12, pageSize: 100}); expect(r.success, r.error).toBe(true);
  expect(r.data).toMatchObject({...criteria(kind), rows: [hrActionRecordRowSchemas[kind].parse(actionRecordDetail(kind))], totalCount: 1101, page: 12, pageSize: 100});
  expect(s.calls).toContainEqual(["eq", "employee_id", 100]); expect(s.calls).toContainEqual(["is", "deleted_at", null]); expect(s.calls).toContainEqual(["range", 1100, 1199]);
  expect(s.calls).toContainEqual(["order", HR_ACTION_RECORD_CONFIG[kind].sort, {ascending: false, nullsFirst: false}]); expect(s.calls).toContainEqual(["order", "id", {ascending: true}]);
  expect(s.calls.filter(c => c[0] === "from")).toHaveLength(kind === "clearance" ? 2 : 1);
  expect(s.calls.filter(c => c[0] === "select").every(c => !String(c[1]).includes("*"))).toBe(true);
  expect(JSON.stringify(r)).not.toContain("SYNTHETIC_PRIVATE"); expect(s.authReads).toBe(1);
  if (kind === "clearance") {expect(s.calls).toContainEqual(["eq", "id", 300]); expect(s.calls).toContainEqual(["eq", "eos_case_id", 300]);}
});
it.each(HR_ACTION_RECORD_KINDS)("%s full-result bilingual literal search and allowed filters are applied before paging", async kind => {
  const fields: readonly HrOperationsField[] = HR_ACTION_RECORD_CONFIG[kind].fields;
  const filters = Object.fromEntries(fields.map(f => [f.id, f.type === "date" ? "2026-01-02" : f.type === "select" ? f.options![0].value : "موارد_%"]));
  parentFor(kind); s.result = {data: [], count: 0, error: null}; expect((await readHrActionRecords({...criteria(kind), search: "اختبار_%", columnFilters: filters})).success).toBe(true);
  expect(String(s.calls.find(c => c[0] === "or")?.[1])).toContain("\\\\_\\\\%");
  for (const field of fields) expect(s.calls.some(c => ["eq", "ilike", "gte"].includes(String(c[0])) && c[1] === field.id)).toBe(true);
  expect(s.calls.findIndex(c => c[0] === "range")).toBeGreaterThan(s.calls.findLastIndex(c => ["eq", "ilike", "gte", "lt", "or"].includes(String(c[0]))));
  for (const body of HR_ACTION_RECORD_CONFIG[kind].bodySearch) expect(String(s.calls.find(c => c[0] === "or")?.[1])).toContain(`${body}.ilike.`);
});
it.each(HR_ACTION_RECORD_KINDS)("%s every visible sort remains native and gets a unique tie-breaker", async kind => {
  s.result = {data: [], count: 0, error: null};
  for (const field of HR_ACTION_RECORD_CONFIG[kind].fields) {s.calls = []; parentFor(kind); expect((await readHrActionRecords({...criteria(kind), sortKey: field.id, sortDir: "asc"})).success).toBe(true); expect(s.calls).toContainEqual(["order", field.id, {ascending: true, nullsFirst: false}]); expect(s.calls).toContainEqual(["order", "id", {ascending: true}]);}
});
it("rejects unsafe criteria before authentication or database work", async () => {
  expect(hrActionRecordCriteriaSchema.parse(criteria("pro")).pageSize).toBe(25);
  for (const bad of [{kind: "auth.users"}, {table: "employees"}, {employeeId: 0}, {employeeId: 1.5}, {employeeId: Number.MAX_SAFE_INTEGER + 1}, {page: 0}, {pageSize: 101}, {page: 100001}, {sortKey: "notes"}, {search: "x".repeat(201)}, {columnFilters: {notes: "secret"}}, {columnFilters: {request_date: "2026-02-30"}}, {columnFilters: {process_status: "sometimes"}}, {eosCaseId: 300}]) expect((await readHrActionRecords({...criteria("pro"), ...bad})).success).toBe(false);
  expect((await readHrActionRecords({kind: "clearance", employeeId: 100})).success).toBe(false);
  expect((await readHrActionRecordDetail({kind: "clearance", employeeId: 100, recordId: 1})).success).toBe(false);
  expect(s.calls).toHaveLength(0); expect(s.authReads).toBe(0);
});
it.each(["2026-02-30", "2026-13-01", "0000-01-01"])("invalid date-shaped search %s is literal text, not a native date error", async search => {
  s.result = {data: [], count: 0, error: null};
  for (const kind of HR_ACTION_RECORD_KINDS) {s.calls = []; parentFor(kind); expect((await readHrActionRecords({...criteria(kind), search})).success).toBe(true); const clauses = String(s.calls.find(c => c[0] === "or")?.[1]); expect(clauses).not.toMatch(/(?:date|_at)\.(?:eq|gte|lt)\./); expect(clauses).toContain("ilike");}
});
it.each(["inactive", "forced-password", "no-role"])("%s cannot read any page or detail", async condition => {
  s.active = condition !== "inactive"; s.password = condition === "forced-password"; if (condition === "no-role") s.permissions = [];
  for (const kind of HR_ACTION_RECORD_KINDS) {expect((await readHrActionRecords(criteria(kind))).error).toBe("Permission denied"); expect((await readHrActionRecordDetail({...criteria(kind), recordId: 1})).error).toBe("Permission denied");}
  expect(s.calls).toHaveLength(0);
});
it.each(["performance", "disciplinary", "notes"] as const)("%s requires separate confidential capability for pages AND complete detail", async kind => {
  s.permissions = ["hr.actions.view"];
  expect((await readHrActionRecords(criteria(kind))).error).toBe("Permission denied"); expect((await readHrActionRecordDetail({...criteria(kind), recordId: 1})).error).toBe("Permission denied"); expect(s.calls).toHaveLength(0);
});
it("EOS-only access does not confer ordinary HR Actions or confidential access", async () => {
  s.permissions = ["hr.eos.view", "hr.confidential.view"]; s.result = {data: [], count: 0, error: null};
  for (const kind of HR_ACTION_RECORD_KINDS.filter(k => k !== "eos" && k !== "clearance")) expect((await readHrActionRecords(criteria(kind))).error).toBe("Permission denied");
  expect(s.calls).toHaveLength(0); expect((await readHrActionRecords(criteria("eos"))).success).toBe(true); parentFor("clearance"); expect((await readHrActionRecords(criteria("clearance"))).success).toBe(true);
});
it.each(HR_ACTION_RECORD_KINDS)("%s complete point detail retains original editor wording and labels", async kind => {
  parentFor(kind); s.result = {data: {...actionRecordDetail(kind), salary: "SYNTHETIC_PRIVATE_SALARY"}, error: null};
  const r = await readHrActionRecordDetail({...criteria(kind), recordId: 1}); expect(r.success, r.error).toBe(true);
  expect(r.data?.row).toEqual(hrActionRecordDetailSchemas[kind].parse(actionRecordDetail(kind)));
  expect(s.calls).toContainEqual(["eq", "id", 1]); expect(s.calls).toContainEqual(["eq", "employee_id", 100]); expect(s.calls).toContainEqual(["maybeSingle"]); expect(JSON.stringify(r)).not.toContain("SYNTHETIC_PRIVATE_SALARY");
});
it.each([null, {id: 300, employee_id: 101}, {id: 301, employee_id: 100}])("unavailable or mismatched EOS parent never permits clearance reads", async data => {
  for (const read of [readHrActionRecords, readHrActionRecordDetail]) {s.calls = []; s.result = {data, error: null}; const r = await read({...criteria("clearance"), ...(read === readHrActionRecordDetail ? {recordId: 1} : {})}); expect(r.success).toBe(false); expect(s.calls.filter(c => c[0] === "from")).toEqual([["from", "employee_eos_cases"]]);}
});
it.each(HR_ACTION_RECORD_KINDS)("%s 416 recovery verifies the identical full-result count", async kind => {
  parentFor(kind); s.queue.push({data: null, count: null, status: 416, error: {code: "PGRST103"}}, {data: null, count: 1107, error: null});
  const r = await readHrActionRecords({...criteria(kind), page: 13, pageSize: 100, search: "test_%"}); expect(r.data).toMatchObject({rows: [], totalCount: 1107});
  const selects = s.calls.filter(c => c[0] === "select" && (c[2] as {count?: string})?.count); expect(selects).toHaveLength(2); expect(selects[0][1]).toBe(selects[1][1]); expect(selects[1][2]).toEqual({count: "exact", head: true});
});
it.each([null, -1, 1201, 1.5, Number.MAX_SAFE_INTEGER + 1])("unverified reconciliation count %s remains failed", async count => {
  s.queue = [{data: null, count: null, status: 416, error: {code: "PGRST103"}}, {data: null, count, error: null}]; expect((await readHrActionRecords({...criteria("pro"), page: 13, pageSize: 100})).success).toBe(false);
});
it.each([null, [], [{id: 1}], [actionRecordDetail("pro"), actionRecordDetail("pro")], [actionRecordDetail("pro", 1, 101)]])("missing, incomplete, duplicate or wrong-employee page rows remain failed", async data => {
  s.result = {data, count: Array.isArray(data) ? Math.max(1, data.length) : 0, error: null}; expect((await readHrActionRecords(criteria("pro"))).success).toBe(false);
});
it.each([null, {id: 1}, actionRecordDetail("pro", 2), actionRecordDetail("pro", 1, 101)])("missing/incomplete/mismatched complete detail stays unavailable", async data => {
  s.result = {data, error: null}; expect((await readHrActionRecordDetail({...criteria("pro"), recordId: 1})).success).toBe(false);
});
it("clearance page and detail responses must also match the exact EOS subject", async () => {
  parentFor("clearance"); s.result = {data: [{...actionRecordDetail("clearance"), eos_case_id: 301}], count: 1, error: null}; expect((await readHrActionRecords(criteria("clearance"))).success).toBe(false);
  parentFor("clearance"); s.result = {data: {...actionRecordDetail("clearance"), eos_case_id: 301}, error: null}; expect((await readHrActionRecordDetail({...criteria("clearance"), recordId: 1})).success).toBe(false);
});
it("failed native queries are not empty and route errors are private and correlated", async () => {
  s.result = {data: null, count: null, status: 500, error: {code: "57014", message: "SYNTHETIC_PRIVATE_ERROR"}};
  const r = await readHrActionRecords({...criteria("pro"), page: 13}); expect(r.success).toBe(false); expect(s.calls.filter(c => c[0] === "select")).toHaveLength(1);
  for (const [post, input] of [[pagePost, criteria("pro")], [detailPost, {...criteria("pro"), recordId: 1}]] as const) {const response = await post(new Request("http://localhost/api/reads/hr-action-records", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(input)})); expect(response.status).toBe(503); expect(response.headers.get("Cache-Control")).toContain("no-store"); expect(response.headers.get("X-ERP-Correlation")).toBeTruthy(); expect(await response.text()).not.toContain("SYNTHETIC_PRIVATE_ERROR");}
});
it("denies HR action list and details before reading children of an invisible employee", async () => {
 s.subject = {data:null,error:null};
 expect((await readHrActionRecords({kind:"pro",employeeId:100})).error).toBe("Permission denied");
 expect((await readHrActionRecordDetail({kind:"pro",employeeId:100,recordId:1})).error).toBe("Permission denied");
 expect(s.calls).toEqual([]);
});
