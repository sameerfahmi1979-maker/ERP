// @vitest-environment jsdom
import "../remediation/f05/setup";
import React, {useLayoutEffect} from "react";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {act, cleanup, render, renderHook, waitFor} from "@testing-library/react";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import type {AuthContext} from "@/lib/rbac/check";
import {WorkspaceUiMemoryProvider} from "@/hooks/use-persistent-ui-state";
import {useHrComplianceRecords} from "@/hooks/use-hr-compliance-records";
import {complianceFixture, complianceFixtureReply} from "./fixtures/compliance-record-fixture";
import {ReadError} from "@/lib/reads/client";
import {complianceReadIdentity, DEPENDENT_MEDICAL_FIELDS, type ComplianceKind} from "@/lib/reads/hr-compliance-records-schema";

const state = vi.hoisted(() => ({read: vi.fn()}));
vi.mock("@/lib/reads/client", async original => ({...await original<typeof import("@/lib/reads/client")>(), readJson: state.read}));
const auth = {profile: {id: 7, auth_user_id: "synthetic-compliance-lifetime-a", must_change_password: false}, isAccountActive: true, accountStatus: "active",
  permissionCodes: ["hr.employees.view", "hr.compliance.view", "hr.compliance.manage"], roleCodes: [], roleAssignments: []} as unknown as AuthContext;
const clients: QueryClient[] = [];
const reply = (input: Record<string, unknown>) => complianceFixtureReply(input, [complianceFixture("identity", 17, Number(input.employeeId))]);
beforeEach(() => {state.read.mockImplementation(async (_resource: string, input: Record<string, unknown>) => reply(input));});
afterEach(() => {cleanup(); clients.splice(0).forEach(client => client.clear()); state.read.mockReset();});
function mountRead(kind: ComplianceKind = "identity", onDenied = () => {}) {
  const client = new QueryClient({defaultOptions: {queries: {retry: false, retryDelay: 0}}}); clients.push(client);
  const wrapper = ({children}: {children: React.ReactNode}) => <QueryClientProvider client={client}><WorkspaceUiMemoryProvider>{children}</WorkspaceUiMemoryProvider></QueryClientProvider>;
  const hook = renderHook(({id, context}) => useHrComplianceRecords(kind, id, context, onDenied), {wrapper, initialProps: {id: 7, context: auth}});
  return {...hook, client};
}
it.each(["subject", "principal", "account-state"])("retained Compliance read/detail/refresh callbacks stay retired after %s A→B→A", async change => {
  const hook = mountRead(); await waitFor(() => expect(hook.result.current.rows.length).toBe(1));
  await act(async () => {await hook.result.current.loadDetail(17);}); await waitFor(() => expect(hook.result.current.detailQuery.isSuccess).toBe(true));
  const old = hook.result.current;
  hook.rerender({id: change === "subject" ? 8 : 7, context: change === "principal" ? {...auth, profile: {...auth.profile!, id: 8, auth_user_id: "synthetic-compliance-lifetime-b"}} : change === "account-state" ? {...auth, isAccountActive: false, accountStatus: "suspended"} as AuthContext : auth});
  await act(async () => {});
  hook.rerender({id: 7, context: auth}); await waitFor(() => expect(hook.result.current.rows.length).toBe(1));
  const before = state.read.mock.calls.length;
  await act(async () => {await old.query.refetch(); await old.detailQuery.refetch(); await old.refresh(); await old.loadDetail(17); old.closeDetail();});
  expect(state.read.mock.calls.length).toBe(before); expect(old.isDetailCurrent(17)).toBe(false);
});
it("a parent layout before passive unmount cannot trigger old Compliance reads", async () => {
  const client = new QueryClient({defaultOptions: {queries: {retry: false, retryDelay: 0}}}); clients.push(client);
  let current: ReturnType<typeof useHrComplianceRecords<"identity">> | undefined;
  function Child() {current = useHrComplianceRecords("identity", 7, auth, () => {}); return null;}
  function Parent({show}: {show: boolean}) {
    useLayoutEffect(() => {if (!show) {void current?.query.refetch(); void current?.detailQuery.refetch(); void current?.refresh(); void current?.loadDetail(17);}}, [show]);
    return show ? <Child /> : null;
  }
  const tree = (show: boolean) => <QueryClientProvider client={client}><WorkspaceUiMemoryProvider><Parent show={show} /></WorkspaceUiMemoryProvider></QueryClientProvider>;
  const view = render(tree(true)); await waitFor(() => expect(current?.rows.length).toBe(1)); const before = state.read.mock.calls.length;
  view.rerender(tree(false)); await act(async () => {});
  expect(state.read.mock.calls.length).toBe(before); expect(client.getQueryCache().findAll({queryKey: ["hr", "compliance-records", 7]})).toEqual([]);
});
it("an old Compliance detail close/retry cannot replace a newer opening of the same record", async () => {
  const hook = mountRead(); await waitFor(() => expect(hook.result.current.rows.length).toBe(1));
  await act(async () => {await hook.result.current.loadDetail(17);}); await waitFor(() => expect(hook.result.current.isDetailCurrent(17)).toBe(true));
  const old = hook.result.current; act(() => old.closeDetail());
  await act(async () => {await hook.result.current.loadDetail(17);}); await waitFor(() => expect(hook.result.current.isDetailCurrent(17)).toBe(true));
  const before = state.read.mock.calls.length;
  await act(async () => {old.closeDetail(); await old.detailQuery.refetch();});
  expect(state.read.mock.calls.length).toBe(before); expect(hook.result.current.isDetailCurrent(17)).toBe(true); expect(old.isDetailCurrent(17)).toBe(false);
});
it("a retained valid retry cannot send an old Compliance filter after immediate criteria became invalid", async () => {
  const hook = mountRead(); await waitFor(() => expect(hook.result.current.rows.length).toBe(1)); const oldRetry = hook.result.current.query.refetch;
  act(() => hook.result.current.serverRead.onGlobalFilterChange("x".repeat(201)));
  await waitFor(() => expect(hook.result.current.invalid).toBe(true)); const before = state.read.mock.calls.length;
  await act(async () => {await oldRetry();}); expect(state.read.mock.calls.length).toBe(before);
  act(() => hook.result.current.serverRead.onGlobalFilterChange("SYNTHETIC"));
  await waitFor(() => expect(state.read.mock.calls.some(([, p]) => p.search === "SYNTHETIC")).toBe(true));
});
it("current ordinary-error retry still succeeds without discarding a selected lifetime", async () => {
  const hook = mountRead(); await waitFor(() => expect(hook.result.current.rows.length).toBe(1));
  state.read.mockRejectedValue(new ReadError("Temporary failure", 503));
  await act(async () => {await hook.result.current.query.refetch();}); await waitFor(() => expect(hook.result.current.query.isError).toBe(true));
  state.read.mockImplementation(async (_resource: string, input: Record<string, unknown>) => reply(input));
  await act(async () => {await hook.result.current.query.refetch();}); await waitFor(() => expect(hook.result.current.rows.length).toBe(1));
  expect(hook.result.current.denied).toBe(false);
});
const fullAccess = {canManage: true, medicalView: true, medicalManage: true};
const maskedAccess = {...fullAccess, medicalView: false, medicalManage: false};
const detailKey = (kind: ComplianceKind, id = 17) => ["hr", "compliance-records", 7, kind, complianceReadIdentity(auth), "detail", id];
const maskedDependent = (id = 17) => complianceFixture("dependents", id, 7, Object.fromEntries(DEPENDENT_MEDICAL_FIELDS.map(field => [field, null])));
function heldReply() {
  let resolve!: (value: ReturnType<typeof complianceFixtureReply>) => void, reject!: (error: Error) => void;
  const promise = new Promise<ReturnType<typeof complianceFixtureReply>>((done, fail) => {resolve = done; reject = fail;});
  return {promise, resolve, reject};
}
function expectNoMedical(client: QueryClient) {
  const data = client.getQueryCache().findAll({queryKey: detailKey("dependents").slice(0, -1)}).map(query => query.state.data);
  expect(JSON.stringify(data)).not.toMatch(/SENSITIVE (PROVIDER|POLICY|CARD)/);
  for (const envelope of data as Array<{data?: {row?: Record<string, unknown>; access?: typeof fullAccess}} | undefined>) {
    if (!envelope?.data?.row) continue;
    for (const field of DEPENDENT_MEDICAL_FIELDS) expect(envelope.data.row[field]).toBeNull();
    expect(envelope.data.access).toMatchObject(maskedAccess);
  }
}
it.each(["cold", "warm"] as const)("DL-C %s pending dependent promise and cache retire on a page-only medical loss", async temperature => {
  state.read.mockImplementation(async (_: string, input: Record<string, unknown>) => complianceFixtureReply(input, [complianceFixture("dependents")]));
  const hook = mountRead("dependents"); await waitFor(() => expect(hook.result.current.rows).toHaveLength(1));
  if (temperature === "warm") await act(async () => {await hook.result.current.loadDetail(17);});
  const held = heldReply(); let signal: AbortSignal | undefined;
  state.read.mockImplementation(async (_: string, input: Record<string, unknown>, requestSignal: AbortSignal) => {
    if (input.operation === "detail") {signal = requestSignal; return held.promise;}
    return complianceFixtureReply(input, [maskedDependent()], maskedAccess);
  });
  let saved!: ReturnType<typeof hook.result.current.loadDetail>;
  act(() => {saved = hook.result.current.loadDetail(17);});
  await waitFor(() => expect(signal).toBeTruthy()); expect(signal!.aborted).toBe(false);
  await act(async () => {await hook.result.current.query.refetch();});
  await waitFor(() => expect(hook.result.current.access.medicalView).toBe(false));
  expect(signal!.aborted).toBe(true);
  // This await happens before transport resolution: warm cancellation may fulfill with reverted cache.
  await act(async () => {expect(await saved).toBeNull();});
  expectNoMedical(hook.client);
  await act(async () => {held.resolve(complianceFixtureReply({operation: "detail", kind: "dependents", employeeId: 7, recordId: 17}, [complianceFixture("dependents")]));});
  expectNoMedical(hook.client); expect(hook.result.current.access.medicalView).toBe(false);
});
it("DL-R inactive imperative detail is still live before selected unavailable cancels and scrubs it", async () => {
  const old = heldReply(), loss = heldReply(), denied = vi.fn(); let signal: AbortSignal | undefined;
  state.read.mockImplementation(async (_: string, input: Record<string, unknown>, requestSignal: AbortSignal) => {
    if (input.operation === "detail") {if (input.recordId === 17) {signal = requestSignal; return old.promise;} return loss.promise;}
    return reply(input);
  });
  const hook = mountRead("identity", denied); await waitFor(() => expect(hook.result.current.rows).toHaveLength(1));
  const sibling = ["hr", "compliance-records", 8, "identity", "synthetic-other", "detail", 17]; hook.client.setQueryData(sibling, {marker: "OTHER_EMPLOYEE"});
  let first!: ReturnType<typeof hook.result.current.loadDetail>, second!: ReturnType<typeof hook.result.current.loadDetail>;
  act(() => {first = hook.result.current.loadDetail(17); second = hook.result.current.loadDetail(18);});
  await waitFor(() => expect(state.read.mock.calls.filter(([, input]) => input.operation === "detail")).toHaveLength(2));
  const inactive = hook.client.getQueryCache().find({queryKey: detailKey("identity"), exact: true});
  expect(inactive?.getObserversCount()).toBe(0); expect(signal!.aborted).toBe(false);
  await act(async () => {loss.resolve(complianceFixtureReply({operation: "detail", kind: "identity", employeeId: 7, recordId: 18}, [])); expect(await second).toBeNull();});
  await waitFor(() => expect(hook.result.current.detailUnavailable).toBe(true));
  expect(signal!.aborted).toBe(true); await act(async () => {expect(await first).toBeNull();});
  await act(async () => {old.resolve(reply({operation: "detail", kind: "identity", employeeId: 7, recordId: 17}));});
  expect(JSON.stringify([hook.client.getQueryData(detailKey("identity"))])).not.toContain("INITIAL_PRIVATE_NOTE");
  expect(hook.client.getQueryData(detailKey("identity", 18))).toMatchObject({data: {availability: "unavailable"}});
  expect(hook.client.getQueryData(sibling)).toEqual({marker: "OTHER_EMPLOYEE"}); expect(denied).not.toHaveBeenCalled();
});
it("DL-R a verified page restriction retires pending detail without fabricating an employee denial or zero count", async () => {
  const hook = mountRead(); await waitFor(() => expect(hook.result.current.rows).toHaveLength(1));
  const held = heldReply(); let signal: AbortSignal | undefined;
  state.read.mockImplementation(async (_: string, input: Record<string, unknown>, requestSignal: AbortSignal) => {
    if (input.operation === "detail") {signal = requestSignal; return held.promise;}
    return {success: true, data: {operation: "page", kind: "identity", employeeId: 7, availability: "restricted"}};
  });
  let saved!: ReturnType<typeof hook.result.current.loadDetail>; act(() => {saved = hook.result.current.loadDetail(17);});
  await waitFor(() => expect(signal).toBeTruthy());
  await act(async () => {await hook.result.current.query.refetch();});
  await waitFor(() => expect(hook.result.current.restricted).toBe(true));
  expect(signal!.aborted).toBe(true); await act(async () => {expect(await saved).toBeNull(); held.resolve(reply({operation: "detail", kind: "identity", employeeId: 7, recordId: 17}));});
  expect(hook.result.current.denied).toBe(false); expect(hook.result.current.serverRead.totalCount).toBeNull();
  expect(JSON.stringify([hook.client.getQueryData(detailKey("identity"))])).not.toContain("INITIAL_PRIVATE_NOTE");
  expect(hook.result.current.query.data).toMatchObject({data: {availability: "restricted"}});
});
it("DL-G synchronous cancellation notification can start a new same-query generation that old cleanup cannot scrub", async () => {
  state.read.mockImplementation(async (_: string, input: Record<string, unknown>) => complianceFixtureReply(input, [complianceFixture("dependents")]));
  const hook = mountRead("dependents"); await waitFor(() => expect(hook.result.current.rows).toHaveLength(1));
  await act(async () => {await hook.result.current.loadDetail(17);});
  const old = heldReply(), fresh = heldReply(); let signal: AbortSignal | undefined, detailCalls = 0, next: ReturnType<typeof hook.result.current.loadDetail> | undefined;
  state.read.mockImplementation(async (_: string, input: Record<string, unknown>, requestSignal: AbortSignal) => {
    if (input.operation === "detail") {detailCalls++; if (detailCalls === 1) {signal = requestSignal; return old.promise;} return fresh.promise;}
    return complianceFixtureReply(input, [maskedDependent()], maskedAccess);
  });
  let first!: ReturnType<typeof hook.result.current.loadDetail>; act(() => {first = hook.result.current.loadDetail(17);});
  await waitFor(() => expect(signal).toBeTruthy()); const originalQuery = hook.client.getQueryCache().find({queryKey: detailKey("dependents"), exact: true})!;
  const unsubscribe = hook.client.getQueryCache().subscribe(event => {
    if (!next && event.type === "updated" && event.query === originalQuery && event.query.state.fetchStatus === "idle") next = hook.result.current.loadDetail(17);
  });
  try {
    await act(async () => {await hook.result.current.query.refetch();});
    await waitFor(() => expect(detailCalls).toBe(2));
    expect(signal!.aborted).toBe(true); await act(async () => {expect(await first).toBeNull();});
    await act(async () => {fresh.resolve(complianceFixtureReply({operation: "detail", kind: "dependents", employeeId: 7, recordId: 17}, [maskedDependent(17)], maskedAccess)); expect((await next)?.notes).toBe("INITIAL_PRIVATE_NOTE");});
    await act(async () => {old.resolve(complianceFixtureReply({operation: "detail", kind: "dependents", employeeId: 7, recordId: 17}, [complianceFixture("dependents", 17, 7, {notes: "RETIRED_OLD_GENERATION"})]));});
    expect(hook.client.getQueryCache().find({queryKey: detailKey("dependents"), exact: true})).toBe(originalQuery);
    expect(hook.client.getQueryData(detailKey("dependents"))).toMatchObject({data: {row: {notes: "INITIAL_PRIVATE_NOTE"}}}); expectNoMedical(hook.client);
  } finally {unsubscribe();}
});
it.each(["503", "malformed", "cancel"] as const)("fresh-opening %s cannot treat a retained unavailable cache as a new receipt and can recover without GC", async failure => {
  const hook = mountRead(); await waitFor(() => expect(hook.result.current.rows).toHaveLength(1));
  state.read.mockImplementation(async (_: string, input: Record<string, unknown>) => input.operation === "detail" ? complianceFixtureReply(input, []) : reply(input));
  await act(async () => {expect(await hook.result.current.loadDetail(17)).toBeNull();});
  await waitFor(() => expect(hook.result.current.detailUnavailable).toBe(true));
  act(() => hook.result.current.closeDetail()); await waitFor(() => expect(hook.result.current.rows).toHaveLength(1));
  const query = hook.client.getQueryCache().find({queryKey: detailKey("identity"), exact: true})!, oldData = query.state.data;
  const held = heldReply(); let signal: AbortSignal | undefined;
  state.read.mockImplementation(async (_: string, input: Record<string, unknown>, requestSignal: AbortSignal) => {if (input.operation === "detail") {signal = requestSignal; return held.promise;} return reply(input);});
  let saved!: ReturnType<typeof hook.result.current.loadDetail>; act(() => {saved = hook.result.current.loadDetail(17);});
  await waitFor(() => expect(signal).toBeTruthy()); expect(query.state.data).toBe(oldData);
  expect(hook.result.current.detailUnavailable).toBe(false); expect(hook.result.current.detailQuery.isSuccess).toBe(false);
  await act(async () => {
    if (failure === "503") held.reject(new ReadError("Temporary failure", 503));
    else if (failure === "malformed") held.resolve({success: true, data: {kind: "identity"}} as never);
    else await hook.client.cancelQueries({queryKey: detailKey("identity"), exact: true});
    expect(await saved).toBeNull();
  });
  expect(hook.result.current.detailUnavailable).toBe(false); expect(hook.result.current.detailQuery.isSuccess).toBe(false);
  if (failure !== "cancel") await waitFor(() => expect(hook.result.current.detailError).toBeTruthy());
  expect(hook.client.getQueryCache().find({queryKey: detailKey("identity"), exact: true})).toBe(query);
  state.read.mockImplementation(async (_: string, input: Record<string, unknown>) => reply(input));
  await act(async () => {expect((await hook.result.current.loadDetail(17))?.notes).toBe("INITIAL_PRIVATE_NOTE");});
  expect(hook.result.current.detailQuery.isSuccess).toBe(true);
  if (failure === "cancel") await act(async () => {held.resolve(reply({operation: "detail", kind: "identity", employeeId: 7, recordId: 17}));});
});
it("a structurally identical but freshly verified unavailable response retires only its new opening", async () => {
  const denied = vi.fn(); state.read.mockImplementation(async (_: string, input: Record<string, unknown>) => input.operation === "detail" ? complianceFixtureReply(input, []) : reply(input));
  const hook = mountRead("identity", denied); await waitFor(() => expect(hook.result.current.rows).toHaveLength(1));
  await act(async () => {await hook.result.current.loadDetail(17);}); await waitFor(() => expect(hook.result.current.detailUnavailable).toBe(true));
  const query = hook.client.getQueryCache().find({queryKey: detailKey("identity"), exact: true})!;
  act(() => hook.result.current.closeDetail()); await waitFor(() => expect(hook.result.current.rows).toHaveLength(1));
  const held = heldReply(); state.read.mockImplementation(async (_: string, input: Record<string, unknown>) => input.operation === "detail" ? held.promise : reply(input));
  let saved!: ReturnType<typeof hook.result.current.loadDetail>; act(() => {saved = hook.result.current.loadDetail(17);}); await act(async () => {});
  expect(hook.result.current.detailUnavailable).toBe(false);
  await act(async () => {held.resolve(complianceFixtureReply({operation: "detail", kind: "identity", employeeId: 7, recordId: 17}, [])); expect(await saved).toBeNull();});
  await waitFor(() => expect(hook.result.current.detailUnavailable).toBe(true));
  expect(hook.client.getQueryCache().find({queryKey: detailKey("identity"), exact: true})).toBe(query);
  expect(state.read.mock.calls.filter(([, input]) => input.operation === "detail")).toHaveLength(2); expect(denied).not.toHaveBeenCalled();
});
it.each(["restricted", "401", "403"] as const)("retained-unavailable reopening still yields to a fresh page %s", async outcome => {
  state.read.mockImplementation(async (_: string, input: Record<string, unknown>) => input.operation === "detail" ? complianceFixtureReply(input, []) : reply(input));
  const denied = vi.fn(), hook = mountRead("identity", denied); await waitFor(() => expect(hook.result.current.rows).toHaveLength(1));
  await act(async () => {await hook.result.current.loadDetail(17);}); await waitFor(() => expect(hook.result.current.detailUnavailable).toBe(true));
  act(() => hook.result.current.closeDetail()); await waitFor(() => expect(hook.result.current.rows).toHaveLength(1));
  const held = heldReply(); let signal: AbortSignal | undefined;
  state.read.mockImplementation(async (_: string, input: Record<string, unknown>, requestSignal: AbortSignal) => {
    if (input.operation === "detail") {signal = requestSignal; return held.promise;}
    if (outcome !== "restricted") throw new ReadError("Synthetic denied", Number(outcome));
    return {success: true, data: {operation: "page", kind: "identity", employeeId: 7, availability: "restricted"}};
  });
  let saved!: ReturnType<typeof hook.result.current.loadDetail>; act(() => {saved = hook.result.current.loadDetail(17);});
  await waitFor(() => expect(signal).toBeTruthy());
  await act(async () => {await hook.result.current.query.refetch();});
  await waitFor(() => expect(outcome === "restricted" ? hook.result.current.restricted : hook.result.current.denied).toBe(true));
  expect(signal!.aborted).toBe(true);
  await act(async () => {expect(await saved).toBeNull(); held.resolve(reply({operation: "detail", kind: "identity", employeeId: 7, recordId: 17}));});
  expect(JSON.stringify([hook.client.getQueryData(detailKey("identity"))])).not.toContain("INITIAL_PRIVATE_NOTE");
  if (outcome === "restricted") expect(denied).not.toHaveBeenCalled(); else expect(denied).toHaveBeenCalledTimes(1);
});
it("retained-unavailable reopen cannot outrun a new medical loss and a later masked request recovers without GC", async () => {
  state.read.mockImplementation(async (_: string, input: Record<string, unknown>) => complianceFixtureReply(input, input.operation === "detail" ? [] : [complianceFixture("dependents")]));
  const hook = mountRead("dependents"); await waitFor(() => expect(hook.result.current.rows).toHaveLength(1));
  await act(async () => {await hook.result.current.loadDetail(17);}); await waitFor(() => expect(hook.result.current.detailUnavailable).toBe(true));
  act(() => hook.result.current.closeDetail()); await waitFor(() => expect(hook.result.current.rows).toHaveLength(1));
  const retained = hook.client.getQueryCache().find({queryKey: detailKey("dependents"), exact: true})!, held = heldReply(); let signal: AbortSignal | undefined, count = 0;
  state.read.mockImplementation(async (_: string, input: Record<string, unknown>, requestSignal: AbortSignal) => {
    if (input.operation === "detail") {count++; signal = requestSignal; return held.promise;}
    return complianceFixtureReply(input, [maskedDependent()], maskedAccess);
  });
  let saved!: ReturnType<typeof hook.result.current.loadDetail>; act(() => {saved = hook.result.current.loadDetail(17);});
  await waitFor(() => expect(signal).toBeTruthy()); expect(signal!.aborted).toBe(false);
  await act(async () => {await hook.result.current.query.refetch();});
  await waitFor(() => expect(hook.result.current.access.medicalView).toBe(false)); expect(signal!.aborted).toBe(true);
  await act(async () => {expect(await saved).toBeNull(); held.resolve(complianceFixtureReply({operation: "detail", kind: "dependents", employeeId: 7, recordId: 17}, [complianceFixture("dependents")]));});
  expectNoMedical(hook.client);
  state.read.mockImplementation(async (_: string, input: Record<string, unknown>) => {if (input.operation === "detail") count++; return complianceFixtureReply(input, [maskedDependent()], maskedAccess);});
  await act(async () => {const row = await hook.result.current.loadDetail(17); expect(row?.notes).toBe("INITIAL_PRIVATE_NOTE");});
  expect(count).toBe(2); expectNoMedical(hook.client); expect(hook.client.getQueryCache().find({queryKey: detailKey("dependents"), exact: true})).toBe(retained);
});
it("an older positive page cannot restore medical authority after a newer detail verifies loss", async () => {
  state.read.mockImplementation(async (_: string, input: Record<string, unknown>) => complianceFixtureReply(input, [complianceFixture("dependents")]));
  const hook = mountRead("dependents"); await waitFor(() => expect(hook.result.current.rows).toHaveLength(1));
  const held = heldReply(); let pageSignal: AbortSignal | undefined;
  state.read.mockImplementation(async (_: string, input: Record<string, unknown>, signal: AbortSignal) => {
    if (input.operation === "page") {pageSignal = signal; return held.promise;}
    return complianceFixtureReply(input, [maskedDependent()], maskedAccess);
  });
  let oldPage!: ReturnType<typeof hook.result.current.query.refetch>;
  act(() => {oldPage = hook.result.current.query.refetch();}); await waitFor(() => expect(pageSignal).toBeTruthy());
  await act(async () => {await hook.result.current.loadDetail(17);});
  await waitFor(() => expect(hook.result.current.access.medicalView).toBe(false)); expect(pageSignal!.aborted).toBe(true);
  await act(async () => {await oldPage; held.resolve(complianceFixtureReply({operation: "page", kind: "dependents", employeeId: 7, page: 1, pageSize: 25}, [complianceFixture("dependents")]));});
  expect(hook.result.current.access.medicalView).toBe(false); expectNoMedical(hook.client);
});
it("an owner A→B→A pending receipt cannot replace the new lifetime's actual verified row", async () => {
  const hook = mountRead(); await waitFor(() => expect(hook.result.current.rows).toHaveLength(1));
  const held = heldReply(); let signal: AbortSignal | undefined;
  state.read.mockImplementation(async (_: string, input: Record<string, unknown>, requestSignal: AbortSignal) => {if (input.operation === "detail") {signal = requestSignal; return held.promise;} return reply(input);});
  let old!: ReturnType<typeof hook.result.current.loadDetail>; act(() => {old = hook.result.current.loadDetail(17);});
  await waitFor(() => expect(signal).toBeTruthy());
  hook.rerender({id: 8, context: auth}); await waitFor(() => expect(hook.result.current.rows).toHaveLength(1));
  hook.rerender({id: 7, context: auth}); await waitFor(() => expect(hook.result.current.rows).toHaveLength(1));
  state.read.mockImplementation(async (_: string, input: Record<string, unknown>) => complianceFixtureReply(input, [complianceFixture("identity", 17, Number(input.employeeId), {notes: "NEW_LIFETIME_NOTE"})]));
  await act(async () => {expect((await hook.result.current.loadDetail(17))?.notes).toBe("NEW_LIFETIME_NOTE"); expect(await old).toBeNull(); held.resolve(reply({operation: "detail", kind: "identity", employeeId: 7, recordId: 17}));});
  expect(signal!.aborted).toBe(true); expect(hook.client.getQueryData(detailKey("identity"))).toMatchObject({data: {row: {notes: "NEW_LIFETIME_NOTE"}}});
});
it.each(["cold", "warm"] as const)("retry episode: a %s imperative opening accepts the verified successful automatic attempt", async temperature => {
  const hook = mountRead(); await waitFor(() => expect(hook.result.current.rows).toHaveLength(1));
  if (temperature === "warm") await act(async () => {await hook.result.current.loadDetail(17);});
  const held = heldReply(); let attempts = 0; const episodes: Array<Promise<unknown> | undefined> = [];
  state.read.mockImplementation(async (_: string, input: Record<string, unknown>) => {
    if (input.operation !== "detail") return reply(input);
    attempts++; episodes.push(hook.client.getQueryCache().find({queryKey: detailKey("identity"), exact: true})?.promise);
    if (attempts === 1) throw new ReadError("Transient first attempt", 503);
    return held.promise;
  });
  let saved!: ReturnType<typeof hook.result.current.loadDetail>; act(() => {saved = hook.result.current.loadDetail(17);});
  await waitFor(() => expect(attempts).toBe(2));
  expect(episodes[0]).toBeDefined(); expect(episodes[1]).toBe(episodes[0]); expect(hook.result.current.detailQuery.isSuccess).toBe(false);
  await act(async () => {
    held.resolve(complianceFixtureReply({operation: "detail", kind: "identity", employeeId: 7, recordId: 17}, [complianceFixture("identity", 17, 7, {notes: "VERIFIED_RETRY_ROW"})]));
    expect((await saved)?.notes).toBe("VERIFIED_RETRY_ROW");
  });
  await waitFor(() => expect(hook.result.current.detailQuery.isSuccess).toBe(true)); expect(attempts).toBe(2);
});
it.each(["cold", "warm"] as const)("retry episode: page privacy loss still retires a %s pending retry before a masked new episode", async temperature => {
  state.read.mockImplementation(async (_: string, input: Record<string, unknown>) => complianceFixtureReply(input, [complianceFixture("dependents")]));
  const hook = mountRead("dependents"); await waitFor(() => expect(hook.result.current.rows).toHaveLength(1));
  if (temperature === "warm") await act(async () => {await hook.result.current.loadDetail(17);});
  const held = heldReply(); let attempts = 0, signal: AbortSignal | undefined;
  state.read.mockImplementation(async (_: string, input: Record<string, unknown>, requestSignal: AbortSignal) => {
    if (input.operation !== "detail") return complianceFixtureReply(input, [maskedDependent()], maskedAccess);
    attempts++;
    if (attempts === 1) throw new ReadError("Transient first attempt", 503);
    if (attempts === 2) {signal = requestSignal; return held.promise;}
    return complianceFixtureReply(input, [maskedDependent()], maskedAccess);
  });
  let saved!: ReturnType<typeof hook.result.current.loadDetail>; act(() => {saved = hook.result.current.loadDetail(17);});
  await waitFor(() => expect(attempts).toBe(2)); expect(signal!.aborted).toBe(false);
  const query = hook.client.getQueryCache().find({queryKey: detailKey("dependents"), exact: true})!, oldEpisode = query.promise;
  await act(async () => {await hook.result.current.query.refetch(); expect(await saved).toBeNull();});
  expect(signal!.aborted).toBe(true); expectNoMedical(hook.client); expect(attempts).toBe(2);
  await act(async () => {expect((await hook.result.current.loadDetail(17))?.notes).toBe("INITIAL_PRIVATE_NOTE");});
  expect(query.promise).not.toBe(oldEpisode); expect(attempts).toBe(3);
  await act(async () => {held.resolve(complianceFixtureReply({operation: "detail", kind: "dependents", employeeId: 7, recordId: 17}, [complianceFixture("dependents", 17, 7, {notes: "RETIRED_RETRY_NOTE"})]));});
  expectNoMedical(hook.client); expect(hook.client.getQueryData(detailKey("dependents"))).toMatchObject({data: {row: {notes: "INITIAL_PRIVATE_NOTE"}}});
});
it("retry episode: pending retry stays retired across owner A→B→A without borrowing the new receipt", async () => {
  const hook = mountRead(); await waitFor(() => expect(hook.result.current.rows).toHaveLength(1));
  const held = heldReply(); let attempts = 0, signal: AbortSignal | undefined;
  state.read.mockImplementation(async (_: string, input: Record<string, unknown>, requestSignal: AbortSignal) => {
    if (input.operation !== "detail") return reply(input);
    attempts++;
    if (attempts === 1) throw new ReadError("Transient first attempt", 503);
    if (attempts === 2) {signal = requestSignal; return held.promise;}
    return complianceFixtureReply(input, [complianceFixture("identity", 17, Number(input.employeeId), {notes: "CURRENT_OWNER_RETRY_NOTE"})]);
  });
  let saved!: ReturnType<typeof hook.result.current.loadDetail>; act(() => {saved = hook.result.current.loadDetail(17);});
  await waitFor(() => expect(attempts).toBe(2)); expect(signal!.aborted).toBe(false);
  hook.rerender({id: 8, context: auth}); await waitFor(() => expect(hook.result.current.rows).toHaveLength(1));
  hook.rerender({id: 7, context: auth}); await waitFor(() => expect(hook.result.current.rows).toHaveLength(1));
  await act(async () => {expect(await saved).toBeNull(); expect((await hook.result.current.loadDetail(17))?.notes).toBe("CURRENT_OWNER_RETRY_NOTE");});
  expect(signal!.aborted).toBe(true); expect(attempts).toBe(3);
  await act(async () => {held.resolve(reply({operation: "detail", kind: "identity", employeeId: 7, recordId: 17}));});
  expect(hook.client.getQueryData(detailKey("identity"))).toMatchObject({data: {row: {notes: "CURRENT_OWNER_RETRY_NOTE"}}});
});
it("retry episode: an independent same-key replacement fetch cannot lend its successful receipt to the old opening", async () => {
  const hook = mountRead(); await waitFor(() => expect(hook.result.current.rows).toHaveLength(1));
  await act(async () => {await hook.result.current.loadDetail(17);});
  const fetchCall = vi.spyOn(hook.client, "fetchQuery");
  const held = heldReply(); let attempts = 0, signal: AbortSignal | undefined;
  state.read.mockImplementation(async (_: string, input: Record<string, unknown>, requestSignal: AbortSignal) => {
    if (input.operation !== "detail") return reply(input);
    attempts++;
    if (attempts === 1) throw new ReadError("Transient first attempt", 503);
    if (attempts === 2) {signal = requestSignal; return held.promise;}
    return complianceFixtureReply(input, [complianceFixture("identity", 17, 7, {notes: "INDEPENDENT_EPISODE_NOTE"})]);
  });
  let saved!: ReturnType<typeof hook.result.current.loadDetail>; act(() => {saved = hook.result.current.loadDetail(17);});
  await waitFor(() => expect(attempts).toBe(2)); const opening = hook.result.current;
  const query = hook.client.getQueryCache().find({queryKey: detailKey("identity"), exact: true})!, oldEpisode = query.promise;
  expect(signal!.aborted).toBe(false);
  // Actual QueryObserver refetch silently cancels the warm prior episode. Its
  // old fetch may fulfill by piggybacking on this replacement: latest receipt
  // alone is therefore insufficient, even without a selection/owner change.
  await act(async () => {
    await opening.detailQuery.refetch();
    expect(await fetchCall.mock.results[0].value).toMatchObject({data: {row: {notes: "INDEPENDENT_EPISODE_NOTE"}}});
    expect(await saved).toBeNull();
  });
  expect(query.promise).not.toBe(oldEpisode); expect(signal!.aborted).toBe(true); expect(attempts).toBe(3);
  expect(opening.isDetailCurrent(17)).toBe(true); expect(hook.result.current.owner).toBe(opening.owner);
  expect(hook.result.current.access.canManage).toBe(true);
  expect(hook.client.getQueryData(detailKey("identity"))).toMatchObject({data: {row: {notes: "INDEPENDENT_EPISODE_NOTE"}}});
  await act(async () => {held.resolve(reply({operation: "detail", kind: "identity", employeeId: 7, recordId: 17}));});
  expect(hook.client.getQueryData(detailKey("identity"))).toMatchObject({data: {row: {notes: "INDEPENDENT_EPISODE_NOTE"}}});
  expect(fetchCall).toHaveBeenCalledTimes(1); fetchCall.mockRestore();
});
