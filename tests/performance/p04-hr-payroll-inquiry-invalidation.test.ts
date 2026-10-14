import {afterEach, expect, it, vi} from "vitest";
import {QueryClient, QueryObserver} from "@tanstack/react-query";
import * as invalidation from "@/lib/query/invalidation";

type Kind = "salary" | "wps";
const prefixes = {salary: "global-salary-profiles", wps: "global-wps-readiness"} as const;
const inquiry = (kind: Kind, owner = "owner-a") => ["hr", "payroll", prefixes[kind], owner, "counted-page", "{}"];
const unrelated = [["hr", "payroll", "profile", 99], ["hr", "employees", "document-browser", "owner-a"], ["report-history", "owner-a"], ["workspace", "draft", 7]];
const clients: QueryClient[] = [];
function client() {const q = new QueryClient({defaultOptions: {queries: {retry: false, staleTime: Infinity}}}); clients.push(q); return q;}
const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));
afterEach(() => {clients.splice(0).forEach(q => q.clear());});

const cases: Array<{name: string; run: (q: QueryClient) => void; kinds: Kind[]; old: unknown[][]}> = [
  {name: "payroll profile", run: q => invalidation.invalidateHrEmployeePayroll(q, 7), kinds: ["salary", "wps"], old: [["hr", "payroll", "profile", 7], ["hr", "payroll", "summary", 7]]},
  {name: "salary components", run: q => invalidation.invalidateHrEmployeeSalaryComponents(q, 7), kinds: ["salary", "wps"], old: [["hr", "payroll", "salary-components", 7], ["hr", "payroll", "gross-salary", 7]]},
  {name: "payroll holds", run: q => invalidation.invalidateHrEmployeePayrollHolds(q, 7), kinds: ["wps"], old: [["hr", "payroll", "holds", 7], ["hr", "payroll", "wps-readiness", 7]]},
  {name: "WPS profile", run: q => invalidation.invalidateHrEmployeeWps(q, 7), kinds: ["wps"], old: [["hr", "payroll", "wps-profile", 7], ["hr", "payroll", "wps-readiness", 7]]},
  {name: "global salary", run: invalidation.invalidateHrGlobalPayroll, kinds: ["salary"], old: []},
  {name: "global WPS", run: invalidation.invalidateHrGlobalWpsReadiness, kinds: ["wps"], old: []},
  {name: "payroll group labels", run: invalidation.invalidateHrPayrollGroups, kinds: ["salary"], old: [["hr", "settings", "payroll-groups"]]},
  {name: "salary component type calculations", run: invalidation.invalidateHrSalaryComponentTypes, kinds: ["salary", "wps"], old: [["hr", "settings", "salary-component-types"]]},
];
it.each(cases)("$name refreshes only affected inquiry prefixes and preserves old helper keys", async ({name, run, kinds, old}) => {
  const q = client(), keys = (["salary", "wps"] as Kind[]).flatMap(kind => [inquiry(kind), inquiry(kind, "owner-b")]);
  for (const key of [...keys, ...old, ...unrelated]) q.setQueryData(key, {key, revision: 1});
  run(q); await settle();
  for (const kind of ["salary", "wps"] as Kind[]) for (const owner of ["owner-a", "owner-b"]) expect(q.getQueryState(inquiry(kind, owner))?.isInvalidated).toBe(kinds.includes(kind));
  for (const key of old) expect(q.getQueryState(key)?.isInvalidated).toBe(true);
  for (const key of unrelated) {
    // Payroll-group settings now intentionally affect employee profiles too;
    // employee-specific operations for employee 7 must still leave 99 alone.
    const newlyAffectedProfile = name === "payroll group labels" && key[0] === "hr" && key[1] === "payroll" && key[2] === "profile" && key[3] === 99;
    expect(q.getQueryState(key)?.isInvalidated).toBe(newlyAffectedProfile);
  }
  for (const key of [...keys, ...old, ...unrelated]) expect(q.getQueryData(key)).toEqual({key, revision: 1});
});
it.each(["list", "detail"] as const)("employee %s changes retire both affected inquiry views without touching unrelated drafts", async mode => {
  const q = client(), keys = (["salary", "wps"] as Kind[]).flatMap(kind => [inquiry(kind), inquiry(kind, "owner-b")]);
  const draft = ["workspace", "draft", 7];
  for (const key of [...keys, draft]) q.setQueryData(key, {revision: 1});
  if (mode === "list") invalidation.invalidateHrEmployees(q); else invalidation.invalidateHrEmployee(q, 7);
  await settle();
  for (const key of keys) {expect(q.getQueryState(key)?.isInvalidated).toBe(true); expect(q.getQueryData(key)).toEqual({revision: 1});}
  expect(q.getQueryState(draft)?.isInvalidated).toBe(false); expect(q.getQueryData(draft)).toEqual({revision: 1});
});
it("a revision that has not applied components leaves both global inquiries unchanged", () => {
  const q = client();
  for (const kind of ["salary", "wps"] as Kind[]) q.setQueryData(inquiry(kind), {revision: 1});
  invalidation.invalidateHrEmployeeSalaryRevisions(q, 7);
  for (const kind of ["salary", "wps"] as Kind[]) expect(q.getQueryState(inquiry(kind))?.isInvalidated).toBe(false);
});
it.each(["salary", "wps"] as const)("%s same-tick success notifications coalesce without fetching another principal", async kind => {
  const q = client(), key = inquiry(kind), inactive = inquiry(kind, "owner-b"), read = vi.fn(async () => ({owner: "a", revision: 2}));
  q.setQueryData(key, {owner: "a", revision: 1}); q.setQueryData(inactive, {owner: "b", revision: 1});
  const observer = new QueryObserver(q, {queryKey: key, queryFn: read, staleTime: Infinity}), stop = observer.subscribe(() => {});
  try {
    invalidation.invalidateHrEmployeePayroll(q, 7); invalidation.invalidateHrEmployeeSalaryComponents(q, 7); invalidation.invalidateHrEmployeePayrollHolds(q, 7);
    await settle();
    expect(read).toHaveBeenCalledTimes(1); expect(q.getQueryData(key)).toEqual({owner: "a", revision: 2});
    expect(q.getQueryData(inactive)).toEqual({owner: "b", revision: 1}); expect(q.getQueryState(inactive)?.fetchStatus).toBe("idle");
  } finally {stop();}
});
it.each(["salary", "wps"] as const)("%s a later mutation supersedes an older in-flight refreshed result", async kind => {
  const q = client(), key = inquiry(kind); q.setQueryData(key, {revision: 1});
  let revision = 2, finishOld!: () => void, oldSignal!: AbortSignal;
  const read = vi.fn(({signal}: {signal: AbortSignal}) => {
    const captured = revision;
    return captured === 2 ? new Promise<{revision: number}>(resolve => {oldSignal = signal; finishOld = () => resolve({revision: captured});}) : Promise.resolve({revision: captured});
  });
  const observer = new QueryObserver(q, {queryKey: key, queryFn: read, staleTime: Infinity}), stop = observer.subscribe(() => {});
  try {
    invalidation.invalidateHrEmployeePayroll(q, 7); await settle(); expect(read).toHaveBeenCalledTimes(1);
    revision = 3; invalidation.invalidateHrEmployeeSalaryComponents(q, 7); await settle();
    finishOld(); await settle();
    expect(oldSignal.aborted).toBe(true); expect(q.getQueryData(key)).toEqual({revision: 3}); expect(read).toHaveBeenCalledTimes(2);
  } finally {stop();}
});
it.each(["salary", "wps"] as const)("%s successful mutation also retires an initial read with no data", async kind => {
  const q = client(), key = inquiry(kind); let revision = 1, finishOld!: () => void, oldSignal!: AbortSignal;
  const read = vi.fn(({signal}: {signal: AbortSignal}) => {
    const captured = revision;
    return captured === 1 ? new Promise<{revision: number}>(resolve => {oldSignal = signal; finishOld = () => resolve({revision: captured});}) : Promise.resolve({revision: captured});
  });
  const observer = new QueryObserver(q, {queryKey: key, queryFn: read, staleTime: Infinity}), stop = observer.subscribe(() => {});
  try {
    expect(read).toHaveBeenCalledTimes(1); revision = 2; invalidation.invalidateHrEmployeePayroll(q, 7); await settle();
    finishOld(); await settle();
    expect(oldSignal.aborted).toBe(true); expect(q.getQueryData(key)).toEqual({revision: 2}); expect(read).toHaveBeenCalledTimes(2);
  } finally {stop();}
});

const counted = (revision: number) => ({rows: [`employee revision ${revision}`], totalCount: revision});
const notifyInquiry = (q: QueryClient, kind: Kind) => kind === "salary"
  ? invalidation.invalidateHrGlobalPayroll(q) : invalidation.invalidateHrGlobalWpsReadiness(q);
it.each((["salary", "wps"] as const).flatMap(kind => [false, true].map(seeded => ({kind, seeded}))))(
  "$kind cancels an attached-disabled pending read (seeded=$seeded), retaining rows/count until admitted",
  async ({kind, seeded}) => {
    const q = client(), key = inquiry(kind), seed = counted(7), fresh = counted(2);
    if (seeded) q.setQueryData(key, seed);
    let finish!: (value: ReturnType<typeof counted>) => void, oldSignal!: AbortSignal;
    const pending = new Promise<ReturnType<typeof counted>>(resolve => {finish = resolve;});
    const read = vi.fn(({signal}: {signal: AbortSignal}) => {
      if (read.mock.calls.length === 1) {oldSignal = signal; return pending;}
      return Promise.resolve(fresh);
    });
    const options = {queryKey: key, queryFn: read, staleTime: Infinity};
    const observer = new QueryObserver(q, options), stop = observer.subscribe(() => {});
    try {
      if (seeded) void observer.refetch();
      expect(read).toHaveBeenCalledOnce();
      observer.setOptions({...options, enabled: false});
      const query = q.getQueryCache().find({queryKey: key, exact: true})!;
      expect(query.getObserversCount()).toBe(1); expect(query.isActive()).toBe(false);
      expect(query.state.fetchStatus).toBe("fetching");
      notifyInquiry(q, kind); await settle();
      expect(oldSignal.aborted).toBe(true); expect(read).toHaveBeenCalledOnce();
      expect(query.state.isInvalidated).toBe(true);
      expect(query.state.data).toEqual(seeded ? seed : undefined);
      // The old transport deliberately ignores abort and supplies a stale page/count.
      finish(counted(99)); await settle();
      expect(q.getQueryCache().find({queryKey: key, exact: true})).toBe(query);
      expect(query.state.data).toEqual(seeded ? seed : undefined);
      expect(query.state.isInvalidated).toBe(true); expect(query.state.fetchStatus).toBe("idle");
      observer.setOptions({...options, enabled: true}); await settle();
      expect(read).toHaveBeenCalledTimes(2); expect(query.state.data).toEqual(fresh);
      expect(query.state.isInvalidated).toBe(false);
    } finally {stop();}
  },
);
it.each(["salary", "wps"] as const)("%s stays stale when its retryer fulfills before the queued notification but success publishes later", async kind => {
  const q = client(), key = inquiry(kind);
  let finish!: (value: ReturnType<typeof counted>) => void, signal!: AbortSignal;
  const pending = new Promise<ReturnType<typeof counted>>(resolve => {finish = resolve;});
  const read = vi.fn((context: {signal: AbortSignal}) => {
    signal = context.signal;
    return read.mock.calls.length === 1 ? pending : Promise.resolve(counted(2));
  });
  const options = {queryKey: key, queryFn: read, staleTime: Infinity};
  const observer = new QueryObserver(q, options), stop = observer.subscribe(() => {});
  try {
    observer.setOptions({...options, enabled: false});
    const query = q.getQueryCache().find({queryKey: key, exact: true})!;
    expect(query.getObserversCount()).toBe(1); expect(query.isActive()).toBe(false);
    expect(query.state.fetchStatus).toBe("fetching"); expect(signal.aborted).toBe(false);
    // No await between these calls: retryer fulfillment precedes the helper microtask.
    finish(counted(99)); notifyInquiry(q, kind);
    await settle();
    expect(query.state.isInvalidated).toBe(true); expect(read).toHaveBeenCalledOnce();
    expect(query.getObserversCount()).toBe(1); expect(query.state.fetchStatus).toBe("idle");
    // Once fulfilled, cancellation need not abort; it must order final invalidation after publication.
    observer.setOptions({...options, enabled: true}); await settle();
    expect(read).toHaveBeenCalledTimes(2); expect(query.state.data).toEqual(counted(2));
  } finally {stop();}
});
it.each(["salary", "wps"] as const)("%s cancels an observerless pending read without starting another transport", async kind => {
  const q = client(), key = inquiry(kind);
  let finish!: (value: ReturnType<typeof counted>) => void, signal!: AbortSignal;
  const read = vi.fn((context: {signal: AbortSignal}) => {signal = context.signal; return new Promise<ReturnType<typeof counted>>(resolve => {finish = resolve;});});
  const pending = q.fetchQuery({queryKey: key, queryFn: read}).catch(() => undefined);
  const query = q.getQueryCache().find({queryKey: key, exact: true})!;
  expect(query.getObserversCount()).toBe(0); expect(query.state.fetchStatus).toBe("fetching");
  notifyInquiry(q, kind); await settle();
  expect(signal.aborted).toBe(true); expect(query.state.isInvalidated).toBe(true);
  finish(counted(99)); await pending; await settle();
  expect(read).toHaveBeenCalledOnce(); expect(query.state.data).toBeUndefined();
  expect(query.state.isInvalidated).toBe(true); expect(query.state.fetchStatus).toBe("idle");
});
it.each(["salary", "wps"] as const)("%s retains a fully settled inactive page/count and does not fetch it until re-enabled", async kind => {
  const q = client(), key = inquiry(kind), old = counted(7), read = vi.fn(async () => counted(2));
  q.setQueryData(key, old);
  const options = {queryKey: key, queryFn: read, staleTime: Infinity};
  const observer = new QueryObserver(q, {...options, enabled: false}), stop = observer.subscribe(() => {});
  try {
    notifyInquiry(q, kind); await settle();
    expect(q.getQueryData(key)).toEqual(old); expect(q.getQueryState(key)?.isInvalidated).toBe(true);
    expect(read).not.toHaveBeenCalled();
    observer.setOptions({...options, enabled: true}); await settle();
    expect(read).toHaveBeenCalledOnce(); expect(q.getQueryData(key)).toEqual(counted(2));
  } finally {stop();}
});
it.each(["salary", "wps"] as const)("%s queued delivery after original-client removal cannot recreate A or refresh replacement B", async kind => {
  const a = client(), b = client(), key = inquiry(kind), readB = vi.fn(async () => counted(2));
  let finish!: (value: ReturnType<typeof counted>) => void, signal!: AbortSignal;
  const readA = vi.fn((context: {signal: AbortSignal}) => {signal = context.signal; return new Promise<ReturnType<typeof counted>>(resolve => {finish = resolve;});});
  const pending = a.fetchQuery({queryKey: key, queryFn: readA}).catch(() => undefined);
  b.setQueryData(key, counted(7));
  const observerB = new QueryObserver(b, {queryKey: key, queryFn: readB, staleTime: Infinity}), stop = observerB.subscribe(() => {});
  try {
    notifyInquiry(a, kind); a.clear();
    finish(counted(99)); await pending; await settle();
    expect(signal.aborted).toBe(true); expect(a.getQueryCache().getAll()).toHaveLength(0);
    expect(readA).toHaveBeenCalledOnce(); expect(readB).not.toHaveBeenCalled();
    expect(b.getQueryData(key)).toEqual(counted(7)); expect(b.getQueryState(key)?.isInvalidated).toBe(false);
  } finally {stop();}
});
