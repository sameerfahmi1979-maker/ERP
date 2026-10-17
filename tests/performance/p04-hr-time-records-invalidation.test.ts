import {afterEach, expect, it, vi} from "vitest";
import {QueryClient, QueryObserver} from "@tanstack/react-query";
import * as invalidate from "@/lib/query/invalidation";
import {TIME_RECORD_KINDS, type TimeRecordKind} from "@/lib/reads/hr-time-records-schema";

const clients: QueryClient[] = [];
const key = (kind: TimeRecordKind, employee = 7, owner = "synthetic-a", operation = "page", scope = "[null,null]") => ["hr", "time-records", employee, kind, owner, scope, operation, operation === "page" ? '{"search":"علي"}' : 111];
const optionKey = (kind: string, owner = "synthetic-a", calendar?: number) => ["hr", "time-records-options", owner, kind, ...(calendar === undefined ? [] : [calendar])];
const settle = () => new Promise<void>(done => setTimeout(done, 0));
function client() {const qc = new QueryClient({defaultOptions: {queries: {retry: false, staleTime: Infinity}}}); clients.push(qc); return qc;}
afterEach(() => clients.splice(0).forEach(qc => qc.clear()));
const changes: {name: string; run: (q: QueryClient) => void; kinds: readonly TimeRecordKind[]; employee?: number}[] = [
  {name: "all employee time", run: q => invalidate.invalidateHrEmployeeTime(q, 7), kinds: TIME_RECORD_KINDS, employee: 7},
  {name: "attendance and correction history", run: q => invalidate.invalidateHrEmployeeAttendance(q, 7), kinds: ["daily", "punches", "corrections"], employee: 7},
  {name: "employee shift assignments", run: q => invalidate.invalidateHrEmployeeShiftAssignments(q, 7), kinds: ["shifts"], employee: 7},
  {name: "employee leave and balances", run: q => invalidate.invalidateHrEmployeeLeave(q, 7), kinds: ["leave", "balances"], employee: 7},
  {name: "employee overtime", run: q => invalidate.invalidateHrEmployeeOvertime(q, 7), kinds: ["overtime"], employee: 7},
  {name: "employee admission", run: q => invalidate.invalidateHrEmployee(q, 7), kinds: TIME_RECORD_KINDS, employee: 7},
  {name: "employee status", run: q => invalidate.invalidateHrEmployeeStatusHistory(q, 7), kinds: TIME_RECORD_KINDS, employee: 7},
  {name: "leave-type labels", run: invalidate.invalidateHrLeaveTypes, kinds: ["leave", "balances"]},
  {name: "all HR settings", run: invalidate.invalidateHrSettings, kinds: ["leave", "balances"]},
  {name: "calendar and shift labels", run: q => invalidate.invalidateCommonMdWorkCalendars(q, 9), kinds: ["shifts"]},
];
it.each(changes)("$name refreshes dependent pages and details without retiring other drafts", async ({run, kinds, employee}) => {
  const qc = client(), all: unknown[][] = [];
  for (const kind of TIME_RECORD_KINDS) for (const person of [7, 8]) for (const owner of ["synthetic-a", "synthetic-b"]) for (const op of ["page", "detail"]) for (const scope of ["[null,null]", "[111,2026]"]) {
    const k = key(kind, person, owner, op, scope); all.push(k); qc.setQueryData(k, {revision: 1});
  }
  const draft = ["workspace", "draft", 7], unrelated = ["hr", "payroll", 7]; qc.setQueryData(draft, {keep: true}); qc.setQueryData(unrelated, {keep: true});
  run(qc); await settle();
  for (const k of all) {expect(qc.getQueryState(k)?.isInvalidated).toBe(kinds.includes(k[3] as TimeRecordKind) && (employee === undefined || k[2] === employee)); expect(qc.getQueryData(k)).toEqual({revision: 1});}
  expect(qc.getQueryState(draft)?.isInvalidated).toBe(false); expect(qc.getQueryState(unrelated)?.isInvalidated).toBe(false);
});
it.each([
  {name: "leave types", run: invalidate.invalidateHrLeaveTypes, expected: ["leave-types"], calendar: undefined},
  {name: "all HR settings", run: invalidate.invalidateHrSettings, expected: ["leave-types"], calendar: undefined},
  {name: "one calendar", run: (q: QueryClient) => invalidate.invalidateCommonMdWorkCalendars(q, 9), expected: ["calendars", "shifts"], calendar: 9},
  {name: "all calendars", run: (q: QueryClient) => invalidate.invalidateCommonMdWorkCalendars(q), expected: ["calendars", "shifts"], calendar: undefined},
])("$name refreshes only matching owner-qualified options", async ({run, expected, calendar}) => {
  const qc = client(), keys = [optionKey("leave-types"), optionKey("calendars"), optionKey("shifts", "synthetic-a", 9), optionKey("shifts", "synthetic-a", 10), optionKey("shifts", "synthetic-b", 9), optionKey("unrelated")];
  for (const k of keys) qc.setQueryData(k, {revision: 1});
  run(qc); await settle();
  for (const k of keys) expect(qc.getQueryState(k)?.isInvalidated).toBe(expected.includes(k[3] as string) && (k[3] !== "shifts" || calendar === undefined || k[4] === calendar));
});
it("summary-only notifications preserve explicit child refresh ownership", async () => {
  const qc = client(), k = key("daily"); qc.setQueryData(k, {revision: 1}); invalidate.invalidateHrEmployeeTimeSummary(qc, 7); await settle(); expect(qc.getQueryState(k)?.isInvalidated).toBe(false);
});
it("same-tick leave/all/type signals coalesce and never refetch an inactive principal", async () => {
  const qc = client(), k = key("leave"), inactive = key("leave", 7, "former"), read = vi.fn(async () => ({revision: 2}));
  qc.setQueryData(k, {revision: 1}); qc.setQueryData(inactive, {revision: 1});
  const observer = new QueryObserver(qc, {queryKey: k, queryFn: read, staleTime: Infinity}), stop = observer.subscribe(() => {});
  try {invalidate.invalidateHrEmployeeLeave(qc, 7); invalidate.invalidateHrEmployeeTime(qc, 7); invalidate.invalidateHrLeaveTypes(qc); await settle();
    expect(read).toHaveBeenCalledTimes(1); expect(qc.getQueryData(inactive)).toEqual({revision: 1}); expect(qc.getQueryData(k)).toEqual({revision: 2});
  } finally {stop();}
});
it.each([false, true])("a later confirmed write retires initial or warm detail, cached=%s", async cached => {
  const qc = client(), k = key("corrections", 7, "current", "detail", "[111,null]"); if (cached) qc.setQueryData(k, {revision: 0});
  let revision = 1, signal!: AbortSignal, finish!: () => void;
  const read = vi.fn(({signal: current}: {signal: AbortSignal}) => revision === 1 ? new Promise(resolve => {signal = current; finish = () => resolve({revision: 1});}) : Promise.resolve({revision}));
  const observer = new QueryObserver(qc, {queryKey: k, queryFn: read, staleTime: Infinity}), stop = observer.subscribe(() => {});
  try {if (cached) {invalidate.invalidateHrEmployeeAttendance(qc, 7); await settle();} expect(read).toHaveBeenCalledTimes(1);
    revision = 2; invalidate.invalidateHrEmployeeAttendance(qc, 7); await settle(); expect(signal.aborted).toBe(true); finish(); await settle();
    expect(read).toHaveBeenCalledTimes(2); expect(qc.getQueryData(k)).toEqual({revision: 2});
  } finally {stop();}
});
it("observerless old detail cannot repopulate after a confirmed leave mutation", async () => {
  const qc = client(), k = key("leave", 7, "former", "detail"); let signal!: AbortSignal, finish!: () => void;
  const read = vi.fn(({signal: current}: {signal: AbortSignal}) => new Promise(resolve => {signal = current; finish = () => resolve({private: "synthetic"});}));
  const pending = qc.fetchQuery({queryKey: k, queryFn: read}).catch(() => null);
  invalidate.invalidateHrEmployeeLeave(qc, 7); await settle(); expect(signal.aborted).toBe(true); finish(); await pending; await settle();
  expect(read).toHaveBeenCalledTimes(1); expect(qc.getQueryData(k)).toBeUndefined();
});
it("queued invalidation never re-creates removed or disabled employee queries", async () => {
  const qc = client(), removed = key("balances"), disabled = key("balances", 8), read = vi.fn(async () => ({revision: 2}));
  qc.setQueryData(removed, {revision: 1}); qc.setQueryData(disabled, {revision: 1});
  const observer = new QueryObserver(qc, {queryKey: disabled, queryFn: read, enabled: false}), stop = observer.subscribe(() => {});
  try {invalidate.invalidateHrLeaveTypes(qc); qc.removeQueries({queryKey: removed, exact: true}); await settle(); expect(read).not.toHaveBeenCalled(); expect(qc.getQueryData(removed)).toBeUndefined();}
  finally {stop();}
});
it("calendar option refresh coalesces and cancels an observerless pre-write lookup", async () => {
  const qc = client(), old = optionKey("shifts", "former", 9), current = optionKey("shifts", "synthetic-a", 9), read = vi.fn(async () => ({revision: 2}));
  let signal!: AbortSignal, finish!: () => void;
  const pending = qc.fetchQuery({queryKey: old, queryFn: ({signal: s}) => new Promise(resolve => {signal = s; finish = () => resolve({revision: 1});})}).catch(() => null);
  qc.setQueryData(current, {revision: 1}); const observer = new QueryObserver(qc, {queryKey: current, queryFn: read, staleTime: Infinity}), stop = observer.subscribe(() => {});
  try {invalidate.invalidateCommonMdWorkCalendars(qc, 9); invalidate.invalidateCommonMdWorkCalendars(qc); await settle(); expect(signal.aborted).toBe(true); finish(); await pending; await settle();
    expect(read).toHaveBeenCalledTimes(1); expect(qc.getQueryData(old)).toBeUndefined(); expect(qc.getQueryData(current)).toEqual({revision: 2});
  } finally {stop();}
});
