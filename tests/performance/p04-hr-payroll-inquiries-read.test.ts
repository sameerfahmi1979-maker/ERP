import {afterEach, expect, it, vi} from "vitest";
import {PAYROLL_INQUIRY_KINDS, PAYROLL_INQUIRY_CONFIG, PAYROLL_INQUIRY_MAX_GROSS, payrollInquiryCriteriaSchema, payrollInquiryPageSchema, salaryInquiryRowSchema, canReadPayrollInquiry} from "@/lib/reads/hr-payroll-inquiries-schema";
import {payrollInquiryContext as context, payrollInquiryPage, payrollInquiryRow} from "./hr-payroll-inquiry-fixtures";
const state = vi.hoisted(() => ({auth: vi.fn(), rpc: vi.fn(), abort: vi.fn(), calls: [] as unknown[][], result: {} as {data?: unknown; error?: {code?: string; message?: string} | null}}));
vi.mock("@/lib/rbac/check", () => ({getAuthContext: state.auth}));
vi.mock("@/lib/supabase/server", () => ({createClient: async () => ({rpc: (...args: unknown[]) => {state.rpc(...args); return {abortSignal: (signal: AbortSignal) => {state.abort(signal); return Promise.resolve(state.result);}};}, from: () => {throw Error("Direct raw payroll reads forbidden in inquiry service");}})}));
vi.mock("@/lib/supabase/admin", () => ({createAdminClient: () => {throw Error("No admin business reader");}}));
import {readPayrollInquiry} from "@/server/reads/hr-payroll-inquiries";
import {POST} from "@/app/api/reads/hr-payroll-inquiries/route";
afterEach(() => {state.auth.mockReset(); state.rpc.mockReset(); state.abort.mockReset(); state.result = {};});
it.each(PAYROLL_INQUIRY_KINDS)("%s uses one bounded invoker RPC with every complete-result criterion", async kind => {
  state.auth.mockResolvedValue(context); state.result = {data: payrollInquiryPage({kind, page: 12, pageSize: 100}), error: null};
  const input = {kind, page: 12, pageSize: 100, search: " اختبار_% ", employeeSearch: " PAY- ", ownerCompanyId: 880101, branchId: 880201, status: "active", activeHoldOnly: kind === "wps", sorting: [{id: PAYROLL_INQUIRY_CONFIG[kind].fields[3].id, desc: true}, {id: "full_name_en", desc: false}], columnFilters: {full_name_en: " Payroll%_ "}};
  const result = await readPayrollInquiry(input); expect(result.success).toBe(true); expect(result.data?.rows).toHaveLength(7); expect(result.data?.totalCount).toBe(1107);
  expect(state.auth).toHaveBeenCalledTimes(1); expect(state.rpc).toHaveBeenCalledTimes(1);
  expect(state.rpc).toHaveBeenCalledWith("perf_hr_payroll_inquiry", {p_kind: kind, p_page: 12, p_page_size: 100, p_search: " اختبار_% ", p_employee_search: " PAY- ", p_owner_company_id: 880101, p_branch_id: 880201, p_status: "active", p_active_hold_only: kind === "wps", p_sorting: input.sorting, p_column_filters: input.columnFilters});
  expect(state.abort.mock.calls[0][0]).toBeInstanceOf(AbortSignal);
});
it("internal SSR composition reuses request-local auth without inventing subject grants", async () => {
  state.result = {data: payrollInquiryPage({kind: "salary"}, {count: 0})}; expect((await readPayrollInquiry({kind: "salary"}, context)).success).toBe(true); expect(state.auth).not.toHaveBeenCalled();
  expect(Object.keys(state.rpc.mock.calls[0][1])).not.toContain("permissionCodes");
});
it("Salary does not require banking, while WPS requires both capabilities before RPC", async () => {
  const payrollOnly = {...context, permissionCodes: ["hr.payroll.view"], roleAssignments: []}; state.auth.mockResolvedValue(payrollOnly);
  state.result = {data: payrollInquiryPage({kind: "salary"}, {count: 0})}; expect((await readPayrollInquiry({kind: "salary"})).success).toBe(true);
  state.rpc.mockClear(); expect((await readPayrollInquiry({kind: "wps"})).error).toBe("Permission denied"); expect(state.rpc).not.toHaveBeenCalled();
  const bankOnly = {...context, permissionCodes: ["hr.banking.view"], roleAssignments: []}; expect(canReadPayrollInquiry(bankOnly, "salary")).toBe(false); expect(canReadPayrollInquiry(bankOnly, "wps")).toBe(false);
});
it.each(["self", "team"])("%s capabilities do not become row authority or scope parameters", async suffix => {
  state.auth.mockResolvedValue({...context, permissionCodes: [`hr.payroll.view.${suffix}`, `hr.banking.view.${suffix}`]}); state.result = {data: payrollInquiryPage({kind: "wps"}, {count: 0})};
  expect((await readPayrollInquiry({kind: "wps"})).success).toBe(true); expect(state.rpc.mock.calls[0][1]).toMatchObject({p_owner_company_id: null, p_branch_id: null});
  state.result = {data: null, error: {code: "42501", message: "Private native rejection"}}; expect((await readPayrollInquiry({kind: "wps"})).error).toBe("Permission denied");
});
it.each(["none", "suspended", "password", "misleading-role"])("%s access cannot become empty or Not Enrolled", async mode => {
  state.auth.mockResolvedValue(mode === "suspended" ? {...context, isAccountActive: false} : mode === "password" ? {...context, profile: {...context.profile!, must_change_password: true}} : {...context, permissionCodes: [], roleAssignments: [], roleCodes: mode === "misleading-role" ? ["system_admin"] : []});
  for (const kind of PAYROLL_INQUIRY_KINDS) expect((await readPayrollInquiry({kind})).error).toBe("Permission denied"); expect(state.rpc).not.toHaveBeenCalled();
});
it("invalid inputs fail before auth and cannot carry table names, authority or expressions", async () => {
  for (const change of [{page: 0}, {pageSize: 101}, {search: "x".repeat(201)}, {search: "\u0000"}, {search: "\ud800"}, {ownerCompanyId: -1}, {branchId: Number.MAX_SAFE_INTEGER + 1}, {status: "bad"}, {activeHoldOnly: true}, {sortKey: "iban"}, {columnFilters: {account_number: "secret"}}, {columnFilters: {currency: 5}}, {authContext: context}, {table: "employees"}]) expect((await readPayrollInquiry({kind: "salary", ...change})).error).toMatch(/^Invalid /);
  expect(state.auth).not.toHaveBeenCalled(); expect(state.rpc).not.toHaveBeenCalled();
});
it("Unicode search counts literal spaces within its bounded scalar length", () => {
  const literal = "  " + "😀".repeat(196) + "  ";
  expect(payrollInquiryCriteriaSchema.parse({kind: "salary", search: literal}).search).toBe(literal);
  expect(payrollInquiryCriteriaSchema.safeParse({kind: "salary", search: " " + "😀".repeat(200)}).success).toBe(false);
  expect(payrollInquiryCriteriaSchema.safeParse({kind: "salary", search: "😀".repeat(201)}).success).toBe(false);
});
it.each([" ", "\t\n", "\u00a0", " Doe ", "أحمد  علي", "%_\\"])('search/filter phrase %j is literal across all criteria', literal => {
  const p = payrollInquiryCriteriaSchema.parse({kind: "salary", search: literal, employeeSearch: literal, columnFilters: {full_name_en: literal}});
  expect([p.search, p.employeeSearch, p.columnFilters.full_name_en]).toEqual([literal, literal, literal]);
});
it("combined Unicode criteria obey the private transport byte budget before auth", async () => {
  const search = "😀".repeat(200);
  const input = {kind: "salary", search, employeeSearch: search, columnFilters: Object.fromEntries(PAYROLL_INQUIRY_CONFIG.salary.fields.map(f => [f.id, search]))};
  expect(new TextEncoder().encode(JSON.stringify(input)).byteLength).toBeGreaterThan(4000);
  expect((await readPayrollInquiry(input)).error).toMatch(/^Invalid /);
  expect(state.auth).not.toHaveBeenCalled(); expect(state.rpc).not.toHaveBeenCalled();
});
it.each(PAYROLL_INQUIRY_KINDS)("%s accepts every displayed scalar filter/sort and exact status", kind => {
  for (const field of PAYROLL_INQUIRY_CONFIG[kind].fields) for (const desc of [false, true]) expect(payrollInquiryCriteriaSchema.safeParse({kind, sorting: [{id: field.id, desc}], columnFilters: {[field.id]: "0.1_%"}}).success).toBe(true);
  for (const status of PAYROLL_INQUIRY_CONFIG[kind].statuses) expect(payrollInquiryCriteriaSchema.safeParse({kind, status}).success).toBe(true);
});
it.each(PAYROLL_INQUIRY_KINDS)("%s preserves 0–5 unique ordered sort priorities without hidden truncation", kind => {
  const sorting = PAYROLL_INQUIRY_CONFIG[kind].fields.map((field, i) => ({id: field.id, desc: i % 2 === 1}));
  for (let count = 0; count <= 5; count++) expect(payrollInquiryCriteriaSchema.parse({kind, sorting: sorting.slice(0, count)}).sorting).toEqual(sorting.slice(0, count));
  expect(payrollInquiryCriteriaSchema.parse({kind, sorting: [...sorting].reverse()}).sorting).toEqual([...sorting].reverse());
  for (const invalid of [[...sorting, sorting[0]], [sorting[0], sorting[0]], [{id: "full_name_en", desc: "false"}], [{id: "full_name_en"}], [{id: "full_name_en", desc: false, extra: "unsafe"}], [{id: kind === "salary" ? "readiness_status" : "gross_salary", desc: false}], [{id: "iban", desc: false}], null]) expect(payrollInquiryCriteriaSchema.safeParse({kind, sorting: invalid}).success).toBe(false);
});
it.each(PAYROLL_INQUIRY_KINDS)("%s rejects incomplete, duplicate, hidden-field and wrong-envelope results", async kind => {
  state.auth.mockResolvedValue(context); const good = payrollInquiryPage({kind}, {count: 1});
  for (const data of [null, {...good, totalCount: 10}, {...good, totalCount: null}, {...good, totalCount: Number.MAX_SAFE_INTEGER + 1}, {...good, contractVersion: 2}, {...good, page: 2}, {...good, pageSize: 50}, {...good, rows: [good.rows[0], good.rows[0]], totalCount: 2}, {...good, rows: [{...good.rows[0], iban: "PRIVATE_IBAN"}]}, {...good, rows: [{...good.rows[0], employee_id: 0}]}, {...good, rows: [{...good.rows[0], ...(kind === "salary" ? {gross_salary: Infinity} : {readiness_status: "unknown"})}]}]) {
    state.result = {data, error: null}; const result = await readPayrollInquiry({kind}); expect(result.success).toBe(false); expect(result.data).toBeUndefined(); expect(JSON.stringify(result)).not.toContain("PRIVATE_IBAN");
  }
});
it.each(PAYROLL_INQUIRY_KINDS)("%s preserves exact nonzero count for an empty out-of-range page", async kind => {
  state.auth.mockResolvedValue(context); state.result = {data: payrollInquiryPage({kind, page: 99}, {count: 1107})}; const result = await readPayrollInquiry({kind, page: 99}); expect(result.data).toMatchObject({rows: [], totalCount: 1107}); expect(state.rpc).toHaveBeenCalledTimes(1);
});
it.each(["PGRST202", "57014", "08006"])("native error %s is unavailable without raw details, false zero or fallback", async code => {
  state.auth.mockResolvedValue(context); state.result = {data: null, error: {code, message: "PRIVATE_DB_DETAILS"}}; const result = await readPayrollInquiry({kind: "wps"}); expect(result.success).toBe(false); expect(result.error).not.toBe("Permission denied"); expect(result.data).toBeUndefined(); expect(JSON.stringify(result)).not.toContain("PRIVATE_DB_DETAILS"); expect(state.rpc).toHaveBeenCalledTimes(1);
});
it("caller cancellation is composed into the one bounded RPC signal", async () => {
  state.auth.mockResolvedValue(context); state.result = {data: payrollInquiryPage({kind: "salary"}, {count: 0})}; const controller = new AbortController(); controller.abort(); await readPayrollInquiry({kind: "salary"}, undefined, controller.signal); expect(state.abort.mock.calls[0][0].aborted).toBe(true);
});
it("route is private/no-store, rejects unknown JSON authority and exposes sanitized failures", async () => {
  const request = (input: unknown) => new Request("http://localhost/api/reads/hr-payroll-inquiries", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(input)});
  state.auth.mockResolvedValue(context); state.result = {data: payrollInquiryPage({kind: "salary"}, {count: 0})}; const ok = await POST(request({kind: "salary"})); expect(ok.status).toBe(200); expect(ok.headers.get("cache-control")).toContain("private, no-store"); expect(ok.headers.get("vary")).toBe("Cookie");
  expect((await POST(request({kind: "salary", owner: "forged"}))).status).toBe(400);
  state.result = {error: {code: "42501"}}; expect((await POST(request({kind: "salary"}))).status).toBe(403);
  state.result = {error: {code: "PGRST202", message: "PRIVATE_RPC"}}; const unavailable = await POST(request({kind: "salary"})); expect(unavailable.status).toBe(503); expect(await unavailable.text()).not.toContain("PRIVATE_RPC");
});
it("only authorized minimal salary/WPS projections are accepted", () => {
  expect(payrollInquiryPageSchema.safeParse({contractVersion: 1, kind: "wps", page: 1, pageSize: 25, totalCount: 1, rows: [{...payrollInquiryRow("wps"), account_number_masked: "**1234"}]}).success).toBe(false);
});
it("the JSON-number gross limit preserves distinct adjacent cents and exact two-decimal display", () => {
  expect(PAYROLL_INQUIRY_MAX_GROSS).toBe(35184372088831);
  expect(PAYROLL_INQUIRY_MAX_GROSS).toBeLessThan(2 ** 45);
  const hundred = BigInt(100), maxCents = BigInt(PAYROLL_INQUIRY_MAX_GROSS) * hundred;
  for (const negative of [false, true]) {
    const numbers: number[] = [];
    for (let offset = BigInt(0); offset <= BigInt(300); offset++) {
      const cents = maxCents - offset;
      const decimal = `${negative ? "-" : ""}${cents / hundred}.${String(cents % hundred).padStart(2, "0")}`;
      const gross_salary = Number(decimal); numbers.push(gross_salary);
      expect(salaryInquiryRowSchema.safeParse({...payrollInquiryRow("salary"), gross_salary}).success).toBe(true);
      expect(gross_salary.toFixed(2)).toBe(decimal);
      expect(gross_salary.toLocaleString("en-AE", {minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false})).toBe(decimal);
    }
    expect(new Set(numbers).size).toBe(numbers.length);
  }
});
it("values above the representational limit fail closed instead of silently losing cents", async () => {
  const oldA = Number("90071992547409.90"), oldB = Number("90071992547409.91");
  expect(oldA).toBe(oldB);
  state.auth.mockResolvedValue(context);
  const good = payrollInquiryPage({kind: "salary"}, {count: 1});
  for (const gross_salary of [PAYROLL_INQUIRY_MAX_GROSS + 0.01, -PAYROLL_INQUIRY_MAX_GROSS - 0.01, 2 ** 45, -(2 ** 45), oldA, oldB]) {
    state.result = {data: {...good, rows: [{...good.rows[0], gross_salary}]}};
    const reply = await readPayrollInquiry({kind: "salary"});
    expect(reply.success).toBe(false); expect(reply.data).toBeUndefined();
  }
});
