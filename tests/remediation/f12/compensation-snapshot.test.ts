import {describe, expect, it} from "vitest";
import {readSalarySnapshot} from "@/server/reads/salary-snapshot";
import {salaryDisplayNumber} from "@/lib/hr/payroll/salary-as-of";

const profile = {employee_id: 8, workspace_revision:1, effective_date: "2026-01-01", currency: "USD", payroll_status: "active"};
const component = (id = 1) => ({id, employee_id: 8, workspace_revision:1, component_type_id: id, amount: "0.10", effective_from: "2026-01-01", effective_to: null, is_active: true, deleted_at: null, component_type: {component_kind: "earning", is_basic: true,workspace_revision:1}});
function client(options: {profile?: unknown; profileError?: unknown; pages?: Array<{data: unknown; count: number | null; error: unknown}>; effects?: {data: unknown; count: number | null; error: unknown}} = {}) {
  let pageIndex=0;const calls: unknown[][] = [], pages = [...(options.pages ?? [{data: [component()], count: 1, error: null}])];
  const db = {from(table: string) {
    calls.push(["from", table]);
    const query: Record<string, unknown> = {then(resolve: (v: unknown) => unknown) {return Promise.resolve(table === "employee_payroll_profiles" ? {data: "profile" in options ? options.profile : profile, error: options.profileError ?? null} : table === "employee_salary_revision_effects" ? options.effects ?? {data: [], count: 0, error: null} : pages[pageIndex++ % pages.length]).then(resolve);}};
    for (const method of ["select", "eq", "is", "order", "range", "maybeSingle"]) query[method] = (...args: unknown[]) => {calls.push([table, method, ...args]); return query;};
    return query;
  }} as unknown as Parameters<typeof readSalarySnapshot>[0];
  return {db, calls};
}
describe("F12-04 scoped salary source adapter", () => {
  it('changing component/type versions or amounts across collection cannot issue mixed salary facts',async()=>{
   for(const changed of [{...component(),amount:'0.20'},{...component(),workspace_revision:2},{...component(),component_type:{...component().component_type,workspace_revision:2}}]){
    const {db}=client({pages:[{data:[component()],count:1,error:null},{data:[changed],count:1,error:null}]});await expect(readSalarySnapshot(db,8,'2026-10-23')).rejects.toThrow('source changed');
   }
  });
  it("keeps exact decimals/currency and only reads the supplied client", async () => {
    const {db, calls} = client();
    expect(await readSalarySnapshot(db, 8, "2026-10-23")).toMatchObject({gross: "0.10", basic: "0.10", currency: "USD", payrollStatus: "active"});
    expect(calls.filter(c => c[0] === "from")).toEqual(Array.from({length:2},()=>[["from", "employee_payroll_profiles"], ["from", "employee_salary_components"], ["from", "employee_salary_revision_effects"]]).flat());
    expect(calls.filter(c => c[1] === "eq")).toEqual(Array.from({length:2},()=>[["employee_payroll_profiles", "eq", "employee_id", 8], ["employee_salary_components", "eq", "employee_id", 8], ["employee_salary_revision_effects", "eq", "employee_id", 8]]).flat());
  });
  it.each([null, {}, {...profile, employee_id: 9}, {...profile, currency: ""}, {...profile, effective_date: "2026-11-01"}])("never defaults unavailable historical profile/currency to AED", async p => expect(readSalarySnapshot(client({profile: p}).db, 8, "2026-10-23")).rejects.toThrow());
  it("never converts a failed profile query to zero pay", async () => expect(readSalarySnapshot(client({profileError: {message: "failure"}}).db, 8, "2026-10-23")).rejects.toThrow());
  it("checks complete pages beyond the native cap", async () => {
    const {db, calls} = client({pages: [500, 500, 1].map((n, page) => ({data: Array.from({length: n}, (_, i) => component(page * 500 + i + 1)), count: 1001, error: null}))});
    expect((await readSalarySnapshot(db, 8, "2026-10-23")).gross).toBe("100.10");
    expect(calls.filter(c => c[0] === "employee_salary_components" && c[1] === "range")).toEqual(Array.from({length:2},()=>[["employee_salary_components", "range", 0, 499], ["employee_salary_components", "range", 500, 999], ["employee_salary_components", "range", 1000, 1499]]).flat());
  });
  it.each([
    {data: null, count: null, error: {message: "failure"}},
    {data: [], count: 1, error: null},
    {data: [component(), component()], count: 2, error: null},
    {data: [{...component(), employee_id: 9}], count: 1, error: null},
    {data: [{...component(), amount: null}], count: 1, error: null},
  ])("rejects failed, partial, duplicate, foreign-subject or unknown pay sources", async page => expect(readSalarySnapshot(client({pages: [page]}).db, 8, "2026-10-23")).rejects.toThrow());
  it("validates employee/date before querying", async () => {
    const {db, calls} = client(); await expect(readSalarySnapshot(db, 0, "2026-10-23")).rejects.toThrow(); await expect(readSalarySnapshot(db, 8, "2026-02-29")).rejects.toThrow(); expect(calls).toEqual([]);
  });
  it("does not silently lose numeric UI precision", () => {
    expect(salaryDisplayNumber("0.30")).toBe(0.3); expect(salaryDisplayNumber("10000000000.00")).toBe(10000000000); expect(() => salaryDisplayNumber("99999999999900.00")).toThrow();
    expect(salaryDisplayNumber("35184372088831.99").toFixed(2)).toBe("35184372088831.99");expect(()=>salaryDisplayNumber("35184372088832.00")).toThrow();
  });
  it("includes only the current employee's complete applied timeline", async () => {
    const effect = {id: 1, revision_id: 3, employee_id: 8, effective_date: "2026-10-23", new_basic: "0.20", currency: "USD"};
    expect((await readSalarySnapshot(client({effects: {data: [effect], count: 1, error: null}}).db, 8, "2026-10-23")).basic).toBe("0.20");
    for (const effects of [{data: [{...effect, employee_id: 9}], count: 1, error: null}, {data: [], count: 1, error: null}, {data: null, count: null, error: {message: "Unavailable"}}]) await expect(readSalarySnapshot(client({effects}).db, 8, "2026-10-23")).rejects.toThrow();
  });
});
