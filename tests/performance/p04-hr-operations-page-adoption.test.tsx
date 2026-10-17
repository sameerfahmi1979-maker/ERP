// @vitest-environment jsdom
import "../remediation/f05/setup";
import React from "react";
import {afterEach, expect, it, vi} from "vitest";
import {act, cleanup, fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {WorkspaceUiMemoryProvider} from "@/hooks/use-persistent-ui-state";
import type {AuthContext} from "@/lib/rbac/check";
import {HR_OPERATIONS_KINDS, HR_OPERATIONS_CONFIG, hrOperationsReadIdentity, type HrOperationsKind, type HrOperationsCriteria, type HrOperationsPage, type HrOperationsRow} from "@/lib/reads/hr-operations-schema";
import {HrAssignmentsPageClient} from "@/features/hr/operations/assignments/hr-assignments-page-client";
import {HrBlocksPageClient} from "@/features/hr/operations/blocks/hr-blocks-page-client";
import {HrReadinessPageClient} from "@/features/hr/operations/readiness/hr-readiness-page-client";
import {ReadError} from "@/lib/reads/client";
const state = vi.hoisted(() => ({read: vi.fn()}));
vi.mock("@/lib/reads/client", async original => ({...await original<typeof import("@/lib/reads/client")>(), readJson: state.read}));
vi.mock("next/navigation", () => ({usePathname: () => "/admin/hr/operations"}));
const context = {profile: {id: 1, auth_user_id: "owned-synthetic-admin", must_change_password: false}, accountStatus: "active", isAccountActive: true, permissionCodes: [], roleCodes: ["system_admin"], roleAssignments: [{roleId: 880101, roleCode: "system_admin", ownerCompanyId: null, branchId: null, permissionCodes: []}]} as unknown as AuthContext;
function row(kind: HrOperationsKind, id: number): HrOperationsRow {
  const common = {id, employee_id: id, employee: {id, full_name_en: "Synthetic employee " + id, full_name_ar: null, employee_code: "PERF-E" + id}};
  if (kind === "assignments") return {...common, assignment_type: "primary", assignment_status: "active", effective_from: "2026-01-01", effective_to: null, company: null, department: null, designation: null, site: null};
  if (kind === "blocks") return {...common, block_type: "other", block_status: "active", block_reason: "Synthetic reason " + id, effective_from: "2026-01-01", effective_to: null, created_at: "2026-01-01T00:00:00Z"};
  return {...common, readiness_status: "ready", checked_at: "2026-01-01T00:00:00Z", site: null};
}
const envelope = (p: HrOperationsCriteria, first = 26, count = 1107) => ({success: true, data: {kind: p.kind, page: p.page, pageSize: p.pageSize, totalCount: count, rows: Array.from({length: Math.min(p.pageSize, Math.max(0, count - (p.page - 1) * p.pageSize))}, (_, i) => row(p.kind, first + i))}});
function page(kind: HrOperationsKind, options: {context?: AuthContext; seedIdentity?: string; count?: number; first?: number; masked?: boolean} = {}) {
  const count = options.count ?? 1107, ctx = options.context ?? context, rows = Array.from({length: Math.min(25, count)}, (_, i) => ({...row(kind, (options.first ?? 1) + i), ...(options.masked ? {employee: null} : {})}));
  const common = {authContext: ctx, initialPage: {kind, rows, totalCount: count, page: 1, pageSize: 25} as HrOperationsPage, initialReadIdentity: options.seedIdentity ?? hrOperationsReadIdentity(context), initialUpdatedAt: Date.now()};
  return kind === "assignments" ? <HrAssignmentsPageClient {...common} /> : kind === "blocks" ? <HrBlocksPageClient {...common} canManage={false} /> : <HrReadinessPageClient {...common} />;
}
const clients: QueryClient[] = [];
function mount(children: React.ReactNode) {
  const client = new QueryClient({defaultOptions: {queries: {retry: false, retryDelay: 0}}}); clients.push(client);
  const wrap = (node: React.ReactNode) => <QueryClientProvider client={client}><WorkspaceUiMemoryProvider>{node}</WorkspaceUiMemoryProvider></QueryClientProvider>;
  const view = render(wrap(children)); return {...view, client, replace: (node: React.ReactNode) => view.rerender(wrap(node))};
}
const ready = (id: number) => screen.findAllByText(`Synthetic employee ${id}`), absent = (id: number) => screen.queryAllByText(`Synthetic employee ${id}`), lastParams = () => state.read.mock.calls.at(-1)?.[1] as HrOperationsCriteria;
afterEach(() => {cleanup(); clients.splice(0).forEach(c => c.clear()); state.read.mockReset();});
it.each(HR_OPERATIONS_KINDS)("%s exact default SSR payload is usable with no duplicate initial read", async kind => {
  mount(page(kind)); await ready(1); await act(async () => {}); expect(state.read).not.toHaveBeenCalled(); expect(screen.getByText("1107 permitted records")).toBeTruthy(); expect(screen.getAllByText("01 Jan 2026").length).toBeGreaterThan(0);
});
// All nine original mounted failures are independently covered against the
// actual migrated clients/real controls, not repaired by weakening the baseline.
it.each(HR_OPERATIONS_KINDS)("%s search masks old rows and requests complete beyond-cap matches", async kind => {
  state.read.mockImplementation((_resource, p) => Promise.resolve(envelope(p, 1101, 1))); mount(page(kind)); await ready(1);
  fireEvent.change(screen.getByPlaceholderText("Search all permitted operational records…"), {target: {value: "موارد_%"}}); expect(absent(1)).toHaveLength(0); expect(state.read).not.toHaveBeenCalled();
  await ready(1101); expect(state.read).toHaveBeenCalledTimes(1); expect(lastParams()).toMatchObject({kind, search: "موارد_%", page: 1});
});
it.each(HR_OPERATIONS_KINDS)("%s sort requests full-result ordering and resets the page", async kind => {
  state.read.mockImplementation((_resource, p) => Promise.resolve(envelope(p, 1101, 1))); mount(page(kind)); await ready(1);
  fireEvent.click(screen.getByRole("button", {name: /^Employee$/})); await ready(1101); expect(lastParams()).toMatchObject({kind, sortKey: "employee_name", page: 1}); expect(lastParams().sortDir).toMatch(/^(asc|desc)$/);
});
it.each(HR_OPERATIONS_KINDS)("%s missing count is rejected, not displayed as valid rows or zero", async kind => {
  state.read.mockImplementation((_resource, p) => Promise.resolve({...envelope(p, 1, 1), data: {...envelope(p, 1, 1).data, totalCount: null}})); mount(page(kind, {count: 1, seedIdentity: "wrong-principal"}));
  await screen.findByRole("alert"); expect(absent(1)).toHaveLength(0); expect(screen.queryByText("0 permitted records")).toBeNull();
});
it.each(HR_OPERATIONS_KINDS)("%s page2 requests page2 and never reseeds page1", async kind => {
  state.read.mockImplementation((_resource, p) => Promise.resolve(envelope(p))); mount(page(kind)); await ready(1);
  fireEvent.click(screen.getByRole("button", {name: "Next"})); await ready(26); expect(lastParams()).toMatchObject({kind, page: 2, pageSize: 25}); expect(absent(1)).toHaveLength(0);
});
it.each(HR_OPERATIONS_KINDS)("%s filter dialog supplies complete-result AND criteria", async kind => {
  state.read.mockImplementation((_resource, p) => Promise.resolve(envelope(p, 1101, 1))); mount(page(kind)); await ready(1);
  fireEvent.click(screen.getByRole("button", {name: /^Edit filters/})); const dialog = await screen.findByRole("dialog"); fireEvent.change(within(dialog).getByLabelText("Employee ID"), {target: {value: "1101"}}); fireEvent.change(within(dialog).getByLabelText("Employee"), {target: {value: "موظف_%"}}); fireEvent.click(within(dialog).getByRole("button", {name: "Apply"}));
  await ready(1101); expect(lastParams().columnFilters).toEqual({employee_id: "1101", employee_name: "موظف_%"});
});
it.each(HR_OPERATIONS_KINDS)("%s outer status changes read full results rather than silently filter loaded rows", async kind => {
  state.read.mockImplementation((_resource, p) => Promise.resolve(envelope(p, 51, 1))); mount(page(kind)); await ready(1);
  const nextStatus = kind === "readiness" ? "blocked" : "cancelled"; fireEvent.change(screen.getByLabelText("Status"), {target: {value: nextStatus}}); await ready(51); expect(lastParams()).toMatchObject({kind, page: 1, status: nextStatus});
});
it.each(HR_OPERATIONS_KINDS)("%s scoped account switch removes old seed, rows and cached principal", async kind => {
  let complete!: (r: unknown) => void; state.read.mockImplementation(() => new Promise(r => {complete = r;})); const view = mount(page(kind, {count: 1})); await ready(1);
  const changed = {...context, profile: {...context.profile!, id: 2, auth_user_id: "owned-other-synthetic"}} as AuthContext; view.replace(page(kind, {count: 1, context: changed})); await waitFor(() => expect(state.read).toHaveBeenCalledTimes(1)); expect(absent(1)).toHaveLength(0); expect(view.client.getQueryCache().getAll().some(q => q.queryKey.includes(hrOperationsReadIdentity(context)))).toBe(false);
  await act(async () => complete(envelope(lastParams(), 51, 1))); await ready(51); expect(absent(1)).toHaveLength(0);
});
it.each([401, 403])("denied%s warm refresh clears data and never silently retries", async status => {
  state.read.mockRejectedValue(new ReadError("Denied synthetic read", status)); const view = mount(page("blocks", {count: 1})); await ready(1); fireEvent.click(screen.getByRole("button", {name: "Refresh records"})); await screen.findByRole("alert"); expect(absent(1)).toHaveLength(0); expect(state.read).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(view.client.getQueryCache().getAll().some(q => q.queryKey.includes(hrOperationsReadIdentity(context)) && q.state.data !== undefined)).toBe(false));
});
it.each(["suspended", "password", "signed-out", "revoked-capability"] as const)("%s context cannot reuse warm records or begin a business read", async mode => {
  const view = mount(page("assignments", {count: 1})); await ready(1); const changed = mode === "suspended" ? {...context, isAccountActive: false, accountStatus: "suspended"} : mode === "password" ? {...context, profile: {...context.profile!, must_change_password: true}} : mode === "signed-out" ? {...context, profile: null, isAccountActive: false} : {...context, roleCodes: [], roleAssignments: [], permissionCodes: []};
  view.replace(page("assignments", {count: 1, context: changed as AuthContext})); await screen.findByRole("alert"); expect(absent(1)).toHaveLength(0); expect(state.read).not.toHaveBeenCalled();
});
it.each(HR_OPERATIONS_KINDS)("%s masked related employee has no invalid or unauthorized record link", async kind => {
  mount(page(kind, {count: 1, masked: true})); await screen.findByText("1 permitted records"); expect(screen.queryAllByRole("link")).toHaveLength(0); expect(absent(1)).toHaveLength(0); expect(state.read).not.toHaveBeenCalled();
});
it("late ignored-abort response cannot resurrect retired identity rows", async () => {
  const pending: {params: HrOperationsCriteria; signal: AbortSignal; resolve: (v: unknown) => void}[] = []; state.read.mockImplementation((_resource, params, signal) => new Promise(resolve => {pending.push({params, signal, resolve});}));
  const view = mount(page("readiness", {count: 1})); await ready(1); fireEvent.change(screen.getByPlaceholderText("Search all permitted operational records…"), {target: {value: "Old principal"}}); await waitFor(() => expect(pending).toHaveLength(1));
  const changed = {...context, profile: {...context.profile!, id: 2, auth_user_id: "owned-other-synthetic"}} as AuthContext; view.replace(page("readiness", {count: 1, context: changed})); await waitFor(() => expect(pending).toHaveLength(2)); expect(pending[0].signal.aborted).toBe(true);
  await act(async () => pending[0].resolve(envelope(pending[0].params, 91, 1))); expect(absent(91)).toHaveLength(0); await act(async () => pending[1].resolve(envelope(pending[1].params, 51, 1))); await ready(51); expect(absent(91)).toHaveLength(0);
});
it("a failed warm read is explicit and retry recovers without stale rows or false zero", async () => {
  state.read.mockRejectedValue(new ReadError("Synthetic sustained outage", 503)); mount(page("blocks", {count: 1})); await ready(1); fireEvent.click(screen.getByRole("button", {name: "Refresh records"})); await screen.findByRole("alert"); expect(absent(1)).toHaveLength(0); expect(screen.queryByText("0 permitted records")).toBeNull(); expect(state.read).toHaveBeenCalledTimes(2);
  state.read.mockImplementation((_resource, p) => Promise.resolve(envelope(p, 51, 1)));
  fireEvent.click(screen.getByRole("button", {name: "Retry loading records"})); await ready(51); expect(state.read).toHaveBeenCalledTimes(3);
});
it("one transient outage recovers automatically within the existing one-retry limit", async () => {
  state.read.mockRejectedValueOnce(new ReadError("Synthetic transient outage", 503)).mockImplementation((_resource, p) => Promise.resolve(envelope(p, 51, 1))); mount(page("blocks", {count: 1})); await ready(1); fireEvent.click(screen.getByRole("button", {name: "Refresh records"})); await waitFor(() => expect(absent(1)).toHaveLength(0));
  await ready(51); expect(state.read).toHaveBeenCalledTimes(2); expect(screen.queryByRole("alert")).toBeNull(); expect(absent(1)).toHaveLength(0);
});
