import {afterEach, expect, it, vi} from "vitest";
import {QueryClient, QueryObserver} from "@tanstack/react-query";
import * as invalidation from "@/lib/query/invalidation";
import {REPORT_CRITERION_KEYS, type ReportCriterionKey} from "@/lib/reads/report-criteria-schema";

const clients: QueryClient[] = [];
function client() {const q = new QueryClient({defaultOptions: {queries: {retry: false, staleTime: Infinity}}}); clients.push(q); return q;}
const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));
const key = (criterion: ReportCriterionKey, owner = "owner-a", report = "HR_TEST", params = "{}") => ["reports", "criteria", owner, report, criterion, params];
const unrelated = [["workspace", "draft", 7], ["reports", "run", 9], ["reports", "templates"], ["report-history", "owner-a"], ["reports", "criteria-other", "owner-a"]];
afterEach(() => {clients.splice(0).forEach(q => q.clear());});

const cases: {name: string; run: (q: QueryClient) => void; fields: readonly ReportCriterionKey[]}[] = [
  {name: "employee list", run: invalidation.invalidateHrEmployees, fields: ["employee_id"]},
  {name: "employee detail", run: q => invalidation.invalidateHrEmployee(q, 7), fields: ["employee_id"]},
  {name: "employee status", run: q => invalidation.invalidateHrEmployeeStatusHistory(q, 7), fields: ["employee_id"]},
  {name: "organizations and branches", run: invalidation.invalidateOrganizations, fields: REPORT_CRITERION_KEYS},
  {name: "departments", run: invalidation.invalidateCommonMdDepartments, fields: ["department_id", "designation_id", "employee_id"]},
  {name: "designations", run: invalidation.invalidateCommonMdDesignations, fields: ["designation_id"]},
  {name: "work sites", run: invalidation.invalidateCommonMdWorkSites, fields: ["work_site_id"]},
  {name: "registry applicability", run: invalidation.invalidateReportsRegistry, fields: REPORT_CRITERION_KEYS},
];
it.each(cases)("$name marks only its criterion families stale across owner/report/search/selection variants", async ({run, fields}) => {
  const q = client();
  for (const field of REPORT_CRITERION_KEYS) for (const owner of ["owner-a", "owner-b"]) for (const report of ["HR_TEST", "OTHER_TEST"]) for (const params of ["{}", '{"selectedId":7}', '{"search":"علي","page":4}'])
    q.setQueryData(key(field, owner, report, params), {owner, revision: 1});
  for (const item of unrelated) q.setQueryData(item, {keep: true});
  run(q); await settle();
  for (const field of REPORT_CRITERION_KEYS) for (const owner of ["owner-a", "owner-b"]) for (const report of ["HR_TEST", "OTHER_TEST"]) for (const params of ["{}", '{"selectedId":7}', '{"search":"علي","page":4}']) {
    const queryKey = key(field, owner, report, params);
    expect(q.getQueryState(queryKey)?.isInvalidated).toBe(fields.includes(field));
    expect(q.getQueryData(queryKey)).toEqual({owner, revision: 1});
    expect(q.getQueryState(queryKey)?.fetchStatus).toBe("idle");
  }
  for (const item of unrelated) {expect(q.getQueryState(item)?.isInvalidated).toBe(false); expect(q.getQueryData(item)).toEqual({keep: true});}
});

it("same-tick successful list/detail/department notifications coalesce and never fetch an inactive principal", async () => {
  const q = client(), active = key("employee_id"), inactive = key("employee_id", "owner-b"), read = vi.fn(async () => ({revision: 2}));
  q.setQueryData(active, {revision: 1}); q.setQueryData(inactive, {revision: 1});
  const observer = new QueryObserver(q, {queryKey: active, queryFn: read, staleTime: Infinity}), stop = observer.subscribe(() => {});
  try {
    invalidation.invalidateHrEmployees(q); invalidation.invalidateHrEmployee(q, 7); invalidation.invalidateCommonMdDepartments(q);
    await settle(); expect(read).toHaveBeenCalledTimes(1); expect(q.getQueryData(active)).toEqual({revision: 2});
    expect(q.getQueryData(inactive)).toEqual({revision: 1}); expect(q.getQueryState(inactive)?.fetchStatus).toBe("idle");
  } finally {stop();}
});

it.each([false, true])("successful mutation replaces an earlier in-flight lookup, cached=%s", async cached => {
  const q = client(), queryKey = key("employee_id"); if (cached) q.setQueryData(queryKey, {revision: 0});
  let revision = 1, oldSignal!: AbortSignal, finishOld!: () => void;
  const read = vi.fn(({signal}: {signal: AbortSignal}) => revision === 1 ? new Promise<{revision: number}>(resolve => {oldSignal = signal; finishOld = () => resolve({revision: 1});}) : Promise.resolve({revision}));
  const observer = new QueryObserver(q, {queryKey, queryFn: read, staleTime: Infinity}), stop = observer.subscribe(() => {});
  try {
    if (cached) {invalidation.invalidateHrEmployees(q); await settle();}
    expect(read).toHaveBeenCalledTimes(1); revision = 2; invalidation.invalidateHrEmployee(q, 7); await settle();
    expect(oldSignal.aborted).toBe(true); finishOld(); await settle();
    expect(read).toHaveBeenCalledTimes(2); expect(q.getQueryData(queryKey)).toEqual({revision: 2});
  } finally {stop();}
});

it("an observerless lookup request is canceled without fetching that inactive principal", async () => {
  const q = client(), queryKey = key("department_id", "inactive-owner"); let signal!: AbortSignal, finish!: () => void;
  const read = vi.fn(({signal: current}: {signal: AbortSignal}) => new Promise<{revision: number}>(resolve => {signal = current; finish = () => resolve({revision: 1});}));
  const pending = q.fetchQuery({queryKey, queryFn: read}).catch(() => null);
  invalidation.invalidateCommonMdDepartments(q); await settle(); expect(signal.aborted).toBe(true);
  finish(); await pending; await settle(); expect(read).toHaveBeenCalledTimes(1); expect(q.getQueryData(queryKey)).toBeUndefined();
  expect(q.getQueryState(queryKey)?.isInvalidated).toBe(true);
});

it("queued invalidation cannot resurrect a retired owner or issue a disabled-role lookup", async () => {
  const q = client(), retired = key("employee_id", "old-owner"), disabled = key("employee_id", "denied-owner"), read = vi.fn(async () => ({secret: "synthetic"}));
  q.setQueryData(retired, {revision: 1}); q.setQueryData(disabled, {revision: 1});
  const observer = new QueryObserver(q, {queryKey: disabled, queryFn: read, enabled: false}), stop = observer.subscribe(() => {});
  try {
    invalidation.invalidateHrEmployees(q); q.removeQueries({queryKey: retired, exact: true}); await settle();
    expect(read).not.toHaveBeenCalled(); expect(q.getQueryData(retired)).toBeUndefined(); expect(q.getQueryData(disabled)).toEqual({revision: 1});
  } finally {stop();}
});

it("an unrelated failed/salary-only operation does not invalidate criterion labels", async () => {
  const q = client(); for (const field of REPORT_CRITERION_KEYS) q.setQueryData(key(field), {revision: 1});
  invalidation.invalidateHrEmployeeSalaryRevisions(q, 7); await settle();
  for (const field of REPORT_CRITERION_KEYS) expect(q.getQueryState(key(field))?.isInvalidated).toBe(false);
});
