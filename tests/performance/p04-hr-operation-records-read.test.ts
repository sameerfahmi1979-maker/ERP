import {afterEach, expect, it, vi} from "vitest";
const s = vi.hoisted(() => ({grant: true as boolean | null, active: true, password: false, permitted: true, authReads: 0, calls: [] as unknown[][], result: {} as unknown, queue: [] as unknown[], subject: {data: {id: 100}, error: null} as {data: {id: number} | null; error: unknown}, subjectCalls: [] as unknown[][]}));
vi.mock("@/lib/rbac/check", async () => ({...await import("@/lib/rbac/scope"), getAuthContext: async () => {s.authReads++; return {profile: {id: 6, must_change_password: s.password}, isAccountActive: s.active, permissionCodes: s.permitted ? ["hr.assignments.view"] : [], roleCodes: [], roleAssignments: []};}}));
vi.mock("@/lib/supabase/server", () => ({createClient: async () => ({rpc: async () => ({data:s.grant,error:null}),from: (...v: unknown[]) => {if (v[0] === "employees") {const q: Record<string, unknown> = {maybeSingle: async () => s.subject}; for (const name of ["select", "eq", "is"]) q[name] = (...args: unknown[]) => {s.subjectCalls.push([name, ...args]); return q;}; return q;} s.calls.push(["from", ...v]); const q: Record<string, unknown> = {then: (resolve: (r: unknown) => unknown) => Promise.resolve(s.queue.length ? s.queue.shift() : s.result).then(resolve)}; for (const n of ["select", "is", "or", "ilike", "eq", "gte", "lt", "order", "range", "maybeSingle"]) q[n] = (...v: unknown[]) => {s.calls.push([n, ...v]); return q;}; return q;}})}));
import {readHrOperationRecords, readHrOperationRecordDetail} from "@/server/reads/hr-operation-records";
import {POST as pagePost} from "@/app/api/reads/hr-operation-records/route";
import {POST as detailPost} from "@/app/api/reads/hr-operation-record-detail/route";
import {HR_OPERATION_RECORD_KINDS, HR_OPERATION_RECORD_CONFIG, hrOperationRecordRowSchemas, hrOperationRecordDetailSchemas, hrOperationRecordCriteriaSchema} from "@/lib/reads/hr-operation-records-schema";
import type {HrOperationsField} from "@/lib/reads/hr-operations-schema";
import {operationRecordRow, operationRecordDetail} from "./hr-operation-record-fixtures";

it.each([false,null])("does not turn denied or unverifiable employee capability %s into an empty success",async grant=>{
  s.grant=grant;s.result={data:[],count:0,error:null};
  expect((await readHrOperationRecords({kind:"assets",employeeId:100})).success).toBe(false);
  expect((await readHrOperationRecordDetail({kind:"assets",employeeId:100,recordId:1})).success).toBe(false);
  expect(s.calls).toHaveLength(0);
});
afterEach(() => {Object.assign(s, {grant:true, active: true, password: false, permitted: true, authReads: 0, calls: [], result: {}, queue: [], subject: {data: {id: 100}, error: null}, subjectCalls: []});});
it.each(HR_OPERATION_RECORD_KINDS)("%s bounds the native employee-scoped read, strips private editor data and verifies complete page", async kind => {
  s.result = {data: [{...operationRecordRow(kind), notes: "PRIVATE-SYNTHETIC", search_work_sites: {id: 1}}], count: 1101, error: null};
  const r = await readHrOperationRecords({kind, employeeId: 100, page: 12, pageSize: 100}); expect(r.success, r.error).toBe(true);
  expect(r.data).toMatchObject({kind, employeeId: 100, rows: [hrOperationRecordRowSchemas[kind].parse(operationRecordRow(kind))], totalCount: 1101, page: 12, pageSize: 100});
  expect(s.calls).toContainEqual(["eq", "employee_id", 100]); expect(s.calls).toContainEqual(["is", "deleted_at", null]); expect(s.calls).toContainEqual(["range", 1100, 1199]);
  expect(s.calls).toContainEqual(["order", HR_OPERATION_RECORD_CONFIG[kind].sort, {ascending: false, nullsFirst: false}]); expect(s.calls).toContainEqual(["order", "id", {ascending: true}]);
  expect(s.calls.filter(c => c[0] === "from")).toHaveLength(1); const projection = String(s.calls.find(c => c[0] === "select")?.[1]); expect(projection).not.toContain("*"); expect(projection).not.toContain("notes"); expect(projection).not.toContain("missing_requirements_json"); expect(JSON.stringify(r)).not.toContain("PRIVATE-SYNTHETIC"); expect(JSON.stringify(r)).not.toContain("search_work_sites"); expect(s.authReads).toBe(1);
});
it.each(HR_OPERATION_RECORD_KINDS)("%s every allowed filter intersects the complete native result before paging", async kind => {
  const fields: readonly HrOperationsField[] = HR_OPERATION_RECORD_CONFIG[kind].fields;
  const filters = Object.fromEntries(fields.map(f => [f.id, f.type === "date" ? "2026-01-02" : f.type === "number" ? "1.5" : f.type === "select" ? f.options![0].value : "موارد_%"]));
  s.result = {data: [], count: 0, error: null}; const r = await readHrOperationRecords({kind, employeeId: 100, columnFilters: filters}); expect(r.success, r.error).toBe(true);
  expect(s.calls.filter(c => ["eq", "ilike", "gte"].includes(String(c[0])))).toHaveLength(fields.length + 1);
  expect(s.calls.findIndex(c => c[0] === "range")).toBeGreaterThan(s.calls.findLastIndex(c => ["eq", "ilike", "gte", "lt"].includes(String(c[0]))));
  if (kind === "assignments" || kind === "readiness") expect(String(s.calls.find(c => c[0] === "select")?.[1])).toContain("!inner(");
});
it.each(HR_OPERATION_RECORD_KINDS)("%s bilingual literal search and every visible sort are server-owned, never loaded-page filters", async kind => {
  s.result = {data: [], count: 0, error: null}; expect((await readHrOperationRecords({kind, employeeId: 100, search: "اختبار_%"})).success).toBe(true);
  expect(s.calls.filter(c => c[0] === "or").some(c => String(c[1]).includes("\\\\_\\\\%"))).toBe(true);
  expect(s.calls.findIndex(c => c[0] === "or")).toBeLessThan(s.calls.findIndex(c => c[0] === "range"));
  for (const field of HR_OPERATION_RECORD_CONFIG[kind].fields) {s.calls = []; expect((await readHrOperationRecords({kind, employeeId: 100, sortKey: field.id, sortDir: "asc"})).success).toBe(true); const alias = field.id === "site_name" ? "work_sites" : field.id === "department_name" ? "departments" : field.id === "designation_name" ? "designations" : null; expect(s.calls).toContainEqual(["order", alias ? `${alias}(name_en)` : field.id, {ascending: true, nullsFirst: false}]); expect(s.calls).toContainEqual(["order", "id", {ascending: true}]);}
});
it("rejects unsafe or unsupported criteria before authentication or database work", async () => {
  expect(hrOperationRecordCriteriaSchema.parse({kind: "assignments", employeeId: 100}).pageSize).toBe(25);
  for (const bad of [{kind: "auth.users"}, {table: "employees"}, {employeeId: 0}, {employeeId: 1.5}, {employeeId: Number.MAX_SAFE_INTEGER + 1}, {page: 0}, {pageSize: 101}, {page: 100001}, {sortKey: "notes"}, {sortKey: "work_sites(site_name)"}, {search: "x".repeat(201)}, {status: "active"}, {columnFilters: {notes: "secret"}}, {columnFilters: {effective_from: "2026-02-30"}}, {columnFilters: {assignment_status: "sometimes"}}]) expect((await readHrOperationRecords({kind: "assignments", employeeId: 100, ...bad})).success).toBe(false);
  for (const quantity of ["0", "-1", "Infinity", "1e4", "1;delete"]) expect((await readHrOperationRecords({kind: "ppe", employeeId: 100, columnFilters: {quantity}})).success).toBe(false);
  expect(s.calls).toHaveLength(0); expect(s.authReads).toBe(0);
});
it.each(["2026-02-30", "2026-13-01", "0000-01-01"])("invalid date-shaped search %s stays literal text, never an invalid native date predicate",async search=>{s.result={data:[],count:0,error:null};for(const kind of HR_OPERATION_RECORD_KINDS){s.calls=[];expect((await readHrOperationRecords({kind,employeeId:100,search})).success).toBe(true);const clauses=String(s.calls.find(c=>c[0]==='or')?.[1]);expect(clauses).not.toMatch(/(?:effective_from|effective_to|expiry_date|issued_date|returned_date|assigned_from|assigned_to)\.eq\./);expect(clauses).not.toMatch(/(?:checked_at|created_at)\.(?:gte|lt)\./);expect(clauses).toContain('ilike');}});
it.each(["inactive", "forced-password", "no-role"])("%s cannot read pages or complete detail", async condition => {
  s.active = condition !== "inactive"; s.password = condition === "forced-password"; s.permitted = condition !== "no-role";
  expect((await readHrOperationRecords({kind: "assets", employeeId: 100})).error).toBe("Permission denied"); expect((await readHrOperationRecordDetail({kind: "assets", employeeId: 100, recordId: 1})).error).toBe("Permission denied"); expect(s.calls).toHaveLength(0);
});
it.each(HR_OPERATION_RECORD_KINDS)("%s complete editor detail retains original fields with exact record and employee predicates", async kind => {
  s.result = {data: {...operationRecordDetail(kind), salary: "PRIVATE-SYNTHETIC"}, error: null}; const r = await readHrOperationRecordDetail({kind, employeeId: 100, recordId: 1}); expect(r.success, r.error).toBe(true);
  expect(r.data).toMatchObject({kind, employeeId: 100, row: hrOperationRecordDetailSchemas[kind].parse(operationRecordDetail(kind))}); expect(s.calls).toContainEqual(["eq", "employee_id", 100]); expect(s.calls).toContainEqual(["eq", "id", 1]); expect(s.calls).toContainEqual(["is", "deleted_at", null]); expect(s.calls).toContainEqual(["maybeSingle"]); expect(JSON.stringify(r)).not.toContain("PRIVATE-SYNTHETIC");
});
it.each(HR_OPERATION_RECORD_KINDS)("%s 416 recovery must prove the identical full-result count", async kind => {
  s.queue = [{data: null, count: null, status: 416, error: {code: "PGRST103"}}, {data: null, count: 1107, error: null}]; const r = await readHrOperationRecords({kind, employeeId: 100, page: 13, pageSize: 100, search: "test_%"}); expect(r.data).toMatchObject({rows: [], totalCount: 1107}); expect(s.calls.filter(c => c[0] === "eq")).toEqual([["eq", "employee_id", 100], ["eq", "employee_id", 100]]); const selects = s.calls.filter(c => c[0] === "select"); expect(selects[0][1]).toBe(selects[1][1]); expect(selects[1][2]).toEqual({count: "exact", head: true});
});
it.each([null, -1, 1201, 1.5, Number.MAX_SAFE_INTEGER + 1])("unverified reconciliation count %s remains failed", async count => {s.queue = [{data: null, count: null, status: 416, error: {code: "PGRST103"}}, {data: null, count, error: null}]; expect((await readHrOperationRecords({kind: "ppe", employeeId: 100, page: 13, pageSize: 100})).success).toBe(false);});
it.each([{data: null, count: 0, error: null}, {data: [], count: null, error: null}, {data: [], count: 1, error: null}, {data: [{id: 1}], count: 1, error: null}, {data: [operationRecordRow("ppe"), operationRecordRow("ppe")], count: 2, error: null}, {data: [operationRecordRow("ppe")], count: 1, error: {code: "57014", message: "PRIVATE-SYNTHETIC"}}])("incomplete or failed pages are never successful empty", async result => {s.result = result; const r = await readHrOperationRecords({kind: "ppe", employeeId: 100}); expect(r.success).toBe(false); expect(r.data).toBeUndefined(); expect(JSON.stringify(r)).not.toContain("PRIVATE-SYNTHETIC");});
it.each([null, {id: 1}, operationRecordDetail("assets", 2)])("missing/incomplete/mismatched point detail never opens a partial editor", async data => {s.result = {data, error: null}; expect((await readHrOperationRecordDetail({kind: "assets", employeeId: 100, recordId: 1})).success).toBe(false);});
it("native faults have no implicit recovery; both read routes fail privately", async () => {
  s.result = {data: null, count: null, status: 500, error: {code: "57014", message: "PRIVATE-SYNTHETIC"}}; await readHrOperationRecords({kind: "assignments", employeeId: 100, page: 13}); expect(s.calls.filter(c => c[0] === "select")).toHaveLength(1);
  for (const [post, criteria] of [[pagePost, {kind: "assignments", employeeId: 100}], [detailPost, {kind: "assets", employeeId: 100, recordId: 1}]] as const) {const response = await post(new Request("http://localhost/api/reads/hr-operation-records", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(criteria)})); expect(response.status).toBe(503); expect(response.headers.get("Cache-Control")).toContain("no-store"); expect(response.headers.get("X-ERP-Correlation")).toBeTruthy(); expect(await response.text()).not.toContain("PRIVATE-SYNTHETIC");}
});
it.each(["page", "detail"] as const)("%s denies an invisible/deleted employee before child reads", async operation => {
  s.subject = {data: null, error: null};
  const result = operation === "page"
    ? await readHrOperationRecords({kind: "assets", employeeId: 100})
    : await readHrOperationRecordDetail({kind: "assets", employeeId: 100, recordId: 1});
  expect(result.error).toBe("Permission denied"); expect(s.calls).toEqual([]);
  expect(s.subjectCalls).toContainEqual(["eq", "id", 100]);
  expect(s.subjectCalls).toContainEqual(["is", "deleted_at", null]);
});
it.each([{data: null, error: {message: "PRIVATE-SYNTHETIC"}}, {data: {id: 999}, error: null}])("does not treat unavailable or mismatched subject authorization as empty records", async subject => {
  s.subject = subject;
  const result = await readHrOperationRecords({kind: "assets", employeeId: 100});
  expect(result.success).toBe(false); expect(result.data).toBeUndefined();
  expect(s.calls).toEqual([]); expect(JSON.stringify(result)).not.toContain("PRIVATE-SYNTHETIC");
});
