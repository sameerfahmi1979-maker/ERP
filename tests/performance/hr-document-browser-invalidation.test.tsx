// @vitest-environment jsdom
// Actual invalidation helpers/QueryClient and employee save controller; explicit
// UI, workspace context and mutation transport doubles, not native/browser proof.
import "../remediation/f05/setup";
import React from "react";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {act, cleanup, fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {QueryClient, QueryClientProvider, QueryObserver, type QueryKey} from "@tanstack/react-query";
import {FluentProvider, webLightTheme} from "@fluentui/react-components";
import type {ERPRecordWorkspaceFormProps} from "@/components/workspace/erp-record-workspace-form";
import type {AuthContext} from "@/lib/rbac/check";
import type {EmployeeListRow} from "@/server/actions/hr/employees";
import {createWorkspaceDraftStore} from "@/lib/workspace/workspace-draft-store";
import {hrDocumentBrowserCriteriaSchema, hrDocumentBrowserIdentity, hrBrowserEmployeesPage, hrBrowserDocumentsPage, type HrDocumentBrowserCriteria} from "@/lib/reads/hr-document-browser-schema";
import {canonicalReadParams} from "@/hooks/use-server-page";
import {WorkspaceUiMemoryProvider} from "@/hooks/use-persistent-ui-state";
import * as invalidate from "@/lib/query/invalidation";

const m = vi.hoisted(() => ({active: "owner", path: "/admin/hr/employees/record/new", store: null as ReturnType<typeof createWorkspaceDraftStore> | null,
  shell: null as ERPRecordWorkspaceFormProps | null, create: vi.fn(), update: vi.fn(), refresh: vi.fn(), replace: vi.fn(), close: vi.fn(), dirty: vi.fn(), route: vi.fn(), dispatch: vi.fn(), read: vi.fn(), openTab: vi.fn(),
  documents: null as null | {authContext: AuthContext; entityType: string; entityId: number}}));
vi.mock("next/navigation", () => ({usePathname: () => m.path, useRouter: () => ({refresh: m.refresh, replace: m.replace})}));
vi.mock("@/components/workspace/workspace-provider", () => ({useWorkspaceContext: () => ({state: {activeTabId: m.active, tabs: [{id: "owner", route: m.path}]}, dispatch: m.dispatch})}));
vi.mock("@/components/workspace/workspace-draft-provider", () => ({useWorkspaceDraftStoreContext: () => m.store}));
vi.mock("@/hooks/use-workspace", () => ({useWorkspace: () => ({closeTab: m.close, markDirty: m.dirty, updateTabRoute: m.route, isTabActive: (id: string) => id === m.active, openTab: m.openTab})}));
vi.mock("@/lib/reads/client", async () => ({...await vi.importActual("@/lib/reads/client"), readJson: m.read}));
// Fault injection only: the compact production picker intentionally has no search
// toolbar. Keep exercising the real parent's invalid-criteria/cache retirement
// boundary without reintroducing that toolbar into the shipped UI.
vi.mock("@/features/hr/document-browser/hr-doc-browser-doc-list", async original => {
  const actual = await original<typeof import("@/features/hr/document-browser/hr-doc-browser-doc-list")>();
  return { HrDocBrowserDocList: (props: React.ComponentProps<typeof actual.HrDocBrowserDocList>) => <>
    <input aria-label="Synthetic document criteria fault" value={props.serverRead.globalFilter} onChange={event => props.serverRead.onGlobalFilterChange(event.target.value)} />
    <actual.HrDocBrowserDocList {...props} />
  </> };
});
// The real document RecordCollection has no exportConfig; file generation is outside this boundary.
vi.mock("@/components/erp/export/erp-export-menu", () => ({ERPExportMenu: () => null}));
vi.mock("sonner", () => ({toast: {error: vi.fn(), success: vi.fn()}}));
vi.mock("@/server/actions/hr/employees", () => ({createEmployee: m.create, updateEmployee: m.update}));
vi.mock("@/components/workspace/erp-record-workspace-form", () => ({ERPRecordWorkspaceForm: (props: ERPRecordWorkspaceFormProps) => {m.shell = props; return <div>{props.children}</div>;}, ERPRecordSectionPanel: ({children}: {children: React.ReactNode}) => <div>{children}</div>}));
vi.mock("@/features/hr/employees/tabs/employee-profile-tab", () => ({EmployeeProfileTab: ({form, setForm}: {form: {full_name_en: string}; setForm: (fn: (old: typeof form) => typeof form) => void}) =>
  <><input aria-label="Synthetic employee name" required name="full_name_en" value={form.full_name_en} onChange={e => setForm(old => ({...old, full_name_en: e.target.value}))} />
    <button type="button" onClick={() => setForm(old => ({...old, owner_company_id: 1, gender: "female", employee_category_id: 1,
      date_of_birth: "1990-01-01", mobile_number: "synthetic-mobile", joining_date: "2026-01-01",
      emergency_contact_name: "Synthetic contact", emergency_contact_mobile: "synthetic-contact-mobile"}))}>Fill synthetic selections</button></>}));
vi.mock("@/features/dms/entity-documents", () => ({DmsEntityDocumentsTab: (props: NonNullable<typeof m.documents>) => {m.documents = props; return null;}}));
vi.mock("@/features/hr/ai/hr-ai-review-tab", () => ({HrAiReviewTab: () => null}));
vi.mock("@/features/hr/employees/employee-letters-forms", () => ({EmployeeLettersForms: () => null}));
vi.mock("@/features/hr/employees/tabs/employee-compliance-tab", () => ({EmployeeComplianceTab: () => null}));
vi.mock("@/features/hr/employees/tabs/employee-hr-actions-tab", () => ({EmployeeHrActionsTab: () => null}));
vi.mock("@/features/hr/employees/tabs/employee-operations-tab", () => ({EmployeeOperationsTab: () => null}));
vi.mock("@/features/hr/employees/tabs/employee-overview-tab", () => ({EmployeeOverviewTab: () => null}));
vi.mock("@/features/hr/employees/tabs/employee-payroll-tab", () => ({EmployeePayrollTab: () => null}));
vi.mock("@/features/hr/employees/tabs/employee-placeholder-tab", () => ({EmployeePlaceholderTab: () => null}));
vi.mock("@/features/hr/employees/tabs/employee-time-tab", () => ({EmployeeTimeTab: () => null}));
// Employment-history transport is independently covered by F11. This suite
// isolates the real parent save and query-invalidation boundary, not that tab.
vi.mock("@/features/hr/employees/employee-employment-history", () => ({EmployeeEmploymentHistory: () => null}));
import {EmployeeWorkspaceForm} from "@/features/hr/employees/employee-workspace-form";
import {HrDocBrowserPageClient} from "@/features/hr/document-browser/hr-doc-browser-page-client";

const clients: QueryClient[] = [];
function client() {const value = new QueryClient({defaultOptions: {queries: {retry: false, staleTime: Infinity}}}); clients.push(value); return value;}
const browser = (identity: string, operation: HrDocumentBrowserCriteria["operation"] = "documents") => ["hr", "employees", "document-browser", identity, operation,
  canonicalReadParams(hrDocumentBrowserCriteriaSchema.parse(operation === "employees" ? {operation} : operation === "dependents" ? {operation, employeeId: 7}
    : {operation, entityType: "employee", entityId: 7, ...(operation === "files" ? {documentId: 11} : {})}))] as const;
const unrelated = [["hr", "employees", "overview", 77], ["hr", "payroll", "summary", 7], ["reports", "history", "owner-a"], ["read", "unrelated"], ["custom", "draft", 7]];
const payrollInquiries = ["global-salary-profiles", "global-wps-readiness"].map(prefix => ["hr", "payroll", prefix, "owner-a", "counted-page", "{}"]);
type Case = {name: string; run: (qc: QueryClient) => void; old: QueryKey[]};
const cases: Case[] = [
  {name: "employee list", run: invalidate.invalidateHrEmployees, old: [["hr", "employees", "list"], ["read", "employees"]]},
  {name: "employee detail", run: q => invalidate.invalidateHrEmployee(q, 7), old: [["hr", "employees", "detail", 7]]},
  {name: "employee status", run: q => invalidate.invalidateHrEmployeeStatusHistory(q, 7), old: [["hr", "employees", "status-history", 7]]},
  {name: "all compliance", run: q => invalidate.invalidateHrEmployeeCompliance(q, 7), old: ["identity-documents", "medical-insurances", "dependents", "access-cards", "training-certificates", "medical-records", "summary", "alerts"].map(k => ["hr", "compliance", k, 7]).concat([["hr", "employees", "overview", 7]])},
  {name: "direct compliance summary", run: q => invalidate.invalidateHrEmployeeComplianceSummary(q, 7), old: [["hr", "compliance", "summary", 7], ["hr", "employees", "overview", 7]]},
  {name: "identity documents", run: q => invalidate.invalidateHrEmployeeIdentityDocuments(q, 7), old: [["hr", "compliance", "identity-documents", 7], ["hr", "compliance", "summary", 7], ["hr", "employees", "overview", 7]]},
  {name: "dependents", run: q => invalidate.invalidateHrEmployeeDependents(q, 7), old: [["hr", "compliance", "dependents", 7], ["hr", "compliance", "summary", 7], ["hr", "employees", "overview", 7]]},
  {name: "all HR lookup settings", run: invalidate.invalidateHrSettings, old: [["hr", "settings"]]},
  {name: "identity type labels", run: invalidate.invalidateHrIdentityDocumentTypes, old: [["hr", "settings", "identity-document-types"]]},
  {name: "relationship labels", run: invalidate.invalidateHrRelationshipTypes, old: [["hr", "settings", "relationship-types"]]},
  {name: "DMS type labels", run: invalidate.invalidateDmsDocumentTypes, old: [["dms", "admin", "document-types"], ["dms", "admin", "overview"]]},
  {name: "all DMS admin", run: invalidate.invalidateAllDmsAdmin, old: [["dms", "admin"]]},
  {name: "DMS documents", run: invalidate.invalidateDmsDocuments, old: [["dms", "documents"], ["read", "dms-documents"]]},
  {name: "DMS document", run: q => invalidate.invalidateDmsDocument(q, 11), old: [["dms", "documents", 11]]},
  {name: "DMS record", run: q => invalidate.invalidateDmsDocumentRecord(q, 11), old: [["dms", "documents", 11], ["dms", "documents"], ["read", "dms-documents"]]},
  {name: "DMS files", run: q => invalidate.invalidateDmsDocumentFiles(q, 11), old: [["dms", "documents", 11, "files"]]},
  {name: "DMS versions", run: q => invalidate.invalidateDmsDocumentVersions(q, 11), old: [["dms", "documents", 11, "versions"]]},
  {name: "DMS file storage", run: q => invalidate.invalidateDmsDocumentFileStorage(q, 11), old: [["dms", "documents", 11, "files"], ["dms", "documents", 11, "versions"], ["dms", "documents", 11], ["dms", "documents"], ["read", "dms-documents"]]},
  ...["employee", "employee_dependent"].map(entityType => ({name: `DMS ${entityType} links`, run: (q: QueryClient) => invalidate.invalidateDmsEntityDocuments(q, entityType, 7), old: ["entity-documents", "entity-document-compliance", "attachable-documents"].map(k => ["dms", k, entityType, 7])})),
  {name: "DMS expiry", run: q => invalidate.invalidateDmsDocumentExpiry(q, 11), old: [["dms", "expiry", "reminders", "doc", 11], ["dms", "expiry", "stats"], ["dms", "documents", 11]]},
];
beforeEach(() => {vi.clearAllMocks(); m.read.mockReset(); m.active = "owner"; m.store = createWorkspaceDraftStore(); m.shell = null; m.create.mockResolvedValue({success: true, data: {id: 7001, revision: "2", replayed: false}}); m.update.mockResolvedValue({success: true, data: {id: 7, revision: "2", replayed: false}});});
afterEach(() => {cleanup(); clients.splice(0).forEach(q => q.clear());});

it.each(cases)("$name invalidates browser variants and retains every previous helper key without global invalidation", ({run, old}) => {
  const q = client(), variants = (["employees", "dependents", "documents", "files"] as const).flatMap(kind => [browser("owner-a", kind), browser("owner-b", kind)]);
  for (const key of [...variants, ...old, ...unrelated]) q.setQueryData(key, {owner: JSON.stringify(key), unchanged: true});
  run(q);
  for (const key of [...variants, ...old]) expect(q.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(true);
  for (const key of unrelated) expect(q.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(false);
  // Invalidating stale reads cannot replace private data or merge identities.
  for (const key of [...variants, ...old, ...unrelated]) expect(q.getQueryData(key)).toEqual({owner: JSON.stringify(key), unchanged: true});
});
it.each([
  ["unrelated party link", (q: QueryClient) => invalidate.invalidateDmsEntityDocuments(q, "party", 7)],
  ["candidate link", (q: QueryClient) => invalidate.invalidateDmsEntityDocuments(q, "hr_candidate", 7)],
  ["upload processing", invalidate.invalidateDmsUploadSessions], ["DMS tags", invalidate.invalidateDmsTags],
  ["DMS categories", invalidate.invalidateDmsCategories], ["HR grades", invalidate.invalidateHrGrades],
  ["HR payroll", (q: QueryClient) => invalidate.invalidateHrEmployeePayroll(q, 7)],
  ["HR time", (q: QueryClient) => invalidate.invalidateHrEmployeeTimeSummary(q, 7)],
  ["generic lookup", (q: QueryClient) => invalidate.invalidateLookupCategory(q, "unrelated")],
  ["geography", invalidate.invalidateGeography],
] as const)("%s does not invalidate the browser", (_name, run) => {const q = client(), key = browser("owner-a"); q.setQueryData(key, {unchanged: true}); run(q); expect(q.getQueryState(key)?.isInvalidated).toBe(false);});

it("overlapping relevant helper calls coalesce the active read and never fetch or replace an inactive identity", async () => {
  const q = client(), a = browser("owner-a"), b = browser("owner-b"), read = vi.fn();
  q.setQueryData(a, {owner: "a", revision: 1}); q.setQueryData(b, {owner: "b", revision: 1});
  let complete!: (value: {owner: string; revision: number}) => void;
  read.mockImplementation(() => new Promise(resolve => {complete = resolve;}));
  const observer = new QueryObserver(q, {queryKey: a, queryFn: read, staleTime: Infinity}), stop = observer.subscribe(() => {});
  try {
    invalidate.invalidateHrEmployeeComplianceSummary(q, 7); invalidate.invalidateHrEmployeeIdentityDocuments(q, 7); invalidate.invalidateDmsEntityDocuments(q, "employee", 7);
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    expect(read).toHaveBeenCalledTimes(1);
    complete({owner: "a", revision: 2}); await new Promise<void>(resolve => setTimeout(resolve, 0));
    expect(q.getQueryData(a)).toEqual({owner: "a", revision: 2}); expect(q.getQueryData(b)).toEqual({owner: "b", revision: 1});
    expect(q.getQueryState(b)?.fetchStatus).toBe("idle"); expect(read).toHaveBeenCalledTimes(1);
  } finally {stop();}
});
it("a later independent mutation cannot be overwritten by a refresh that began before it", async () => {
  const q = client(), key = browser("owner-a"); q.setQueryData(key, {revision: 1});
  let serverRevision = 2, completeOld!: () => void;
  const read = vi.fn(({signal}: {signal: AbortSignal}) => {
    const captured = serverRevision;
    void signal.aborted;
    return captured === 2 ? new Promise<{revision: number}>(resolve => {completeOld = () => resolve({revision: captured});}) : Promise.resolve({revision: captured});
  });
  const observer = new QueryObserver(q, {queryKey: key, queryFn: read, staleTime: Infinity}), stop = observer.subscribe(() => {});
  try {
    invalidate.invalidateHrEmployeeComplianceSummary(q, 7); await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    expect(read).toHaveBeenCalledTimes(1);
    serverRevision = 3; invalidate.invalidateDmsDocumentFiles(q, 11); await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    completeOld(); await new Promise<void>(resolve => setTimeout(resolve, 0));
    expect(q.getQueryData(key)).toEqual({revision: 3}); expect(read).toHaveBeenCalledTimes(2);
  } finally {stop();}
});
it("a successful mutation also retires an initial in-flight read with no cached rows", async () => {
  const q = client(), key = browser("owner-a"); let serverRevision = 1, completeOld!: () => void, oldSignal!: AbortSignal;
  const read = vi.fn(({signal}: {signal: AbortSignal}) => {
    const captured = serverRevision;
    return captured === 1 ? new Promise<{revision: number}>(resolve => {oldSignal = signal; completeOld = () => resolve({revision: captured});}) : Promise.resolve({revision: captured});
  });
  const observer = new QueryObserver(q, {queryKey: key, queryFn: read, staleTime: Infinity}), stop = observer.subscribe(() => {});
  try {
    expect(read).toHaveBeenCalledTimes(1); expect(q.getQueryData(key)).toBeUndefined();
    serverRevision = 2; invalidate.invalidateHrEmployees(q);
    await new Promise<void>(resolve => setTimeout(resolve, 0)); completeOld(); await new Promise<void>(resolve => setTimeout(resolve, 0));
    expect(q.getQueryData(key)).toEqual({revision: 2}); expect(oldSignal.aborted).toBe(true); expect(read).toHaveBeenCalledTimes(2);
  } finally {stop();}
});

const countedBrowser = (revision: number, count: number) => ({rows: Array.from({length: count}, (_,index) => `revision ${revision} row ${index + 1}`), totalCount: count});
const settleBrowser = () => new Promise<void>(resolve => setTimeout(resolve, 0));
it.each((["employees", "dependents", "documents", "files"] as const).flatMap(operation => [false, true].map(seeded => ({operation, seeded}))))(
  "$operation cancels an attached-disabled pending browser read (seeded=$seeded) before its old page/count can return",
  async ({operation, seeded}) => {
    const q = client(), key = browser("owner-a", operation), seed = countedBrowser(1, 2), fresh = countedBrowser(2, 1);
    if (seeded) q.setQueryData(key, seed);
    let finish!: (value: ReturnType<typeof countedBrowser>) => void, oldSignal!: AbortSignal;
    const pending = new Promise<ReturnType<typeof countedBrowser>>(resolve => {finish = resolve;});
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
      expect(query.getObserversCount()).toBe(1); expect(query.isActive()).toBe(false); expect(query.state.fetchStatus).toBe("fetching");
      invalidate.invalidateHrEmployees(q); await settleBrowser();
      expect(oldSignal.aborted).toBe(true); expect(read).toHaveBeenCalledOnce();
      expect(query.state.isInvalidated).toBe(true); expect(query.state.data).toEqual(seeded ? seed : undefined);
      // This transport deliberately ignores its consumed AbortSignal.
      finish(countedBrowser(99, 3)); await settleBrowser();
      expect(q.getQueryCache().find({queryKey: key, exact: true})).toBe(query);
      expect(query.state.data).toEqual(seeded ? seed : undefined); expect(query.state.isInvalidated).toBe(true);
      expect(query.state.fetchStatus).toBe("idle"); expect(query.getObserversCount()).toBe(1);
      observer.setOptions({...options, enabled: true}); await settleBrowser();
      expect(read).toHaveBeenCalledTimes(2); expect(query.state.data).toEqual(fresh); expect(query.state.isInvalidated).toBe(false);
    } finally {stop();}
  },
);
it.each([false, true])("documents remain stale when retryer fulfillment precedes queued invalidation but publication follows (seeded=%s)", async seeded => {
  const q = client(), key = browser("owner-a"), fresh = countedBrowser(2, 1);
  if (seeded) q.setQueryData(key, countedBrowser(1, 2));
  let finish!: (value: ReturnType<typeof countedBrowser>) => void, oldSignal!: AbortSignal;
  const pending = new Promise<ReturnType<typeof countedBrowser>>(resolve => {finish = resolve;});
  const read = vi.fn(({signal}: {signal: AbortSignal}) => {
    if (read.mock.calls.length === 1) {oldSignal = signal; return pending;}
    return Promise.resolve(fresh);
  });
  const options = {queryKey: key, queryFn: read, staleTime: Infinity};
  const observer = new QueryObserver(q, options), stop = observer.subscribe(() => {});
  try {
    if (seeded) void observer.refetch();
    observer.setOptions({...options, enabled: false});
    const query = q.getQueryCache().find({queryKey: key, exact: true})!;
    expect(query.getObserversCount()).toBe(1); expect(query.isActive()).toBe(false); expect(query.state.fetchStatus).toBe("fetching");
    expect(read).toHaveBeenCalledOnce(); expect(oldSignal.aborted).toBe(false);
    // Return the deferred promise directly above; no await between these calls.
    finish(countedBrowser(99, 3)); invalidate.invalidateHrEmployees(q);
    await settleBrowser();
    expect(query.state.isInvalidated).toBe(true); expect(read).toHaveBeenCalledOnce(); expect(query.state.fetchStatus).toBe("idle");
    expect(query.getObserversCount()).toBe(1);
    // A fulfilled retryer need not abort or retain the seed: final staleness is essential.
    observer.setOptions({...options, enabled: true}); await settleBrowser();
    expect(read).toHaveBeenCalledTimes(2); expect(query.state.data).toEqual(fresh);
  } finally {stop();}
});
it("cancels an observerless pending browser read without fetching it or accepting its late page/count", async () => {
  const q = client(), key = browser("owner-a");
  let finish!: (value: ReturnType<typeof countedBrowser>) => void, signal!: AbortSignal;
  const read = vi.fn((context: {signal: AbortSignal}) => {signal = context.signal; return new Promise<ReturnType<typeof countedBrowser>>(resolve => {finish = resolve;});});
  const pending = q.fetchQuery({queryKey: key, queryFn: read}).catch(() => undefined);
  const query = q.getQueryCache().find({queryKey: key, exact: true})!;
  expect(query.getObserversCount()).toBe(0); expect(query.state.fetchStatus).toBe("fetching");
  invalidate.invalidateHrEmployees(q); await settleBrowser();
  expect(signal.aborted).toBe(true); expect(query.state.isInvalidated).toBe(true);
  finish(countedBrowser(99, 3)); await pending; await settleBrowser();
  expect(read).toHaveBeenCalledOnce(); expect(query.state.data).toBeUndefined();
  expect(query.state.isInvalidated).toBe(true); expect(query.state.fetchStatus).toBe("idle");
});
it("retains a settled disabled browser page/count as stale without fetching until it is admitted", async () => {
  const q = client(), key = browser("owner-a"), old = countedBrowser(1, 2), fresh = countedBrowser(2, 1), read = vi.fn(async () => fresh);
  q.setQueryData(key, old);
  const options = {queryKey: key, queryFn: read, staleTime: Infinity};
  const observer = new QueryObserver(q, {...options, enabled: false}), stop = observer.subscribe(() => {});
  try {
    invalidate.invalidateHrEmployees(q); await settleBrowser();
    expect(q.getQueryData(key)).toEqual(old); expect(q.getQueryState(key)?.isInvalidated).toBe(true); expect(read).not.toHaveBeenCalled();
    observer.setOptions({...options, enabled: true}); await settleBrowser();
    expect(read).toHaveBeenCalledOnce(); expect(q.getQueryData(key)).toEqual(fresh);
  } finally {stop();}
});
it.each(["clear", "remove"] as const)("queued browser notification after original-client %s cannot recreate old data or touch replacement client", async mode => {
  const a = client(), b = client(), key = browser("owner-a"), retained = countedBrowser(1, 2), readB = vi.fn(async () => countedBrowser(2, 1));
  let finish!: (value: ReturnType<typeof countedBrowser>) => void, signal!: AbortSignal;
  const readA = vi.fn((context: {signal: AbortSignal}) => {signal = context.signal; return new Promise<ReturnType<typeof countedBrowser>>(resolve => {finish = resolve;});});
  const pending = a.fetchQuery({queryKey: key, queryFn: readA}).catch(() => undefined);
  b.setQueryData(key, retained);
  const observerB = new QueryObserver(b, {queryKey: key, queryFn: readB, staleTime: Infinity}), stop = observerB.subscribe(() => {});
  try {
    invalidate.invalidateHrEmployees(a);
    if (mode === "clear") a.clear(); else a.removeQueries({queryKey: key, exact: true});
    finish(countedBrowser(99, 3)); await pending; await settleBrowser();
    expect(signal.aborted).toBe(true); expect(a.getQueryCache().getAll()).toHaveLength(0); expect(readA).toHaveBeenCalledOnce();
    expect(readB).not.toHaveBeenCalled(); expect(b.getQueryData(key)).toEqual(retained); expect(b.getQueryState(key)?.isInvalidated).toBe(false);
  } finally {stop();}
});

const auth = {profile: {id: 1, auth_user_id: "synthetic-employee", must_change_password: false}, permissionCodes: ["hr.employees.create", "hr.employees.view", "hr.employees.update"], roleCodes: [], isAccountActive: true, email: null, accountStatus: "active"} as unknown as AuthContext;
const reportEmployeeCriteria = ["reports", "criteria", "owner-a", "SYNTHETIC_REPORT", "employee_id", "{}"];
function mountEmployee(mode: "add" | "edit" = "add") {
  const q = client(), key = browser("owner-a"), oldList = ["hr", "employees", "list"], oldDetail = ["hr", "employees", "detail", mode === "add" ? 7001 : 7];
  for (const k of [key, oldList, oldDetail, reportEmployeeCriteria, ...payrollInquiries, ...unrelated]) q.setQueryData(k, {unchanged: true});
  m.path = `/admin/hr/employees/record/${mode === "add" ? "new" : 7}`;
  render(<QueryClientProvider client={q}><EmployeeWorkspaceForm mode={mode} authContext={auth} employee={mode === "add" ? null : {id: 7, workspace_revision: 1, full_name_en: "Saved", gender: "female", owner_company_id: 1, employee_category_id: 1} as EmployeeListRow} /></QueryClientProvider>);
  fireEvent.change(screen.getByRole("textbox", {name: "Synthetic employee name"}), {target: {value: "Synthetic Changed"}}); fireEvent.click(screen.getByRole("button", {name: "Fill synthetic selections"}));
  return {q, key, oldList, oldDetail};
}
async function save(close = false) {await act(async () => {await (close ? m.shell?.onSaveAndClose?.() : m.shell?.onSave?.());});}
it.each(["add", "edit"] as const)("actual %s employee rejects the legacy coarse permission without current capabilities", mode => {
  const q = client();
  render(<QueryClientProvider client={q}><EmployeeWorkspaceForm mode={mode}
    authContext={{...auth, permissionCodes: ["hr.employees.manage"]}}
    employee={mode === "add" ? null : {id: 7, workspace_revision: 1, full_name_en: "Private synthetic name"} as EmployeeListRow} /></QueryClientProvider>);
  expect(screen.getByRole("alert").textContent).toContain("Employee access is no longer available");
  expect(screen.queryByRole("textbox", {name: "Synthetic employee name"})).toBeNull();
  expect(m.shell).toBeNull(); expect(m.create).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled();
});
it("the employee parent binds the existing authorization to its document tab", () => {
  m.documents = null; mountEmployee("edit"); expect(m.documents).toMatchObject({entityType: "employee", entityId: 7});
  expect((m.documents as {authContext: AuthContext} | null)?.authContext).toBe(auth); expect(m.create).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled();
});
it.each(["add", "edit"] as const)("actual %s employee confirmed save invalidates browser/list/detail after adopting the existing save outcome", async mode => {
  const {q, key, oldList, oldDetail} = mountEmployee(mode); await save();
  for (const k of [key, oldList, oldDetail, reportEmployeeCriteria, ...payrollInquiries]) expect(q.getQueryState(k)?.isInvalidated).toBe(true);
  for (const k of unrelated) expect(q.getQueryState(k)?.isInvalidated).toBe(false);
  expect(m.shell?.isDirty).toBe(false); expect(mode === "add" ? m.create : m.update).toHaveBeenCalledTimes(1);
  expect(mode === "add" ? m.replace : m.refresh).toHaveBeenCalledTimes(1);
});
it.each(["rejected", "uncertain", "missing-revision", "missing-create-id", "transport"])("actual employee %s save does not invalidate or erase a draft", async mode => {
  if (mode === "transport") m.create.mockRejectedValue(Error("synthetic failure"));
  else m.create.mockResolvedValue(mode === "missing-revision" ? {success: true, data: {id: 7001}} : mode === "missing-create-id" ? {success: true, data: {revision: "2"}} : {success: false, uncertain: mode === "uncertain", error: "synthetic failure"});
  const {q, key, oldList, oldDetail} = mountEmployee(); await save(true);
  for (const k of [key, oldList, oldDetail, reportEmployeeCriteria, ...payrollInquiries]) expect(q.getQueryState(k)?.isInvalidated).toBe(false);
  expect(m.shell?.isDirty).toBe(true); expect((screen.getByRole("textbox", {name: "Synthetic employee name"}) as HTMLInputElement).value).toBe("Synthetic Changed");
  expect(m.close).not.toHaveBeenCalled(); expect(m.replace).not.toHaveBeenCalled(); expect(m.refresh).not.toHaveBeenCalled();
  if (mode === "uncertain") {await save(true); expect(m.create.mock.calls[1][1].operationId).toBe(m.create.mock.calls[0][1].operationId); expect(q.getQueryState(key)?.isInvalidated).toBe(false);}
});
it("an earlier confirmed employee save refreshes browser reads but retains newer input and does not navigate a different tab", async () => {
  let complete!: (value: unknown) => void; m.create.mockImplementation(() => new Promise(resolve => {complete = resolve;}));
  const {q, key} = mountEmployee(); let pending: unknown;
  act(() => {pending = m.shell?.onSaveAndClose?.();});
  fireEvent.change(screen.getByRole("textbox", {name: "Synthetic employee name"}), {target: {value: "Newer draft"}}); m.active = "destination";
  await act(async () => {complete({success: true, data: {id: 7001, revision: "2", replayed: false}}); await pending;});
  expect(q.getQueryState(key)?.isInvalidated).toBe(true); expect(m.shell?.isDirty).toBe(true);
  expect(q.getQueryState(reportEmployeeCriteria)?.isInvalidated).toBe(true);
  for (const k of payrollInquiries) expect(q.getQueryState(k)?.isInvalidated).toBe(true);
  expect((screen.getByRole("textbox", {name: "Synthetic employee name"}) as HTMLInputElement).value).toBe("Newer draft");
  expect(m.close).not.toHaveBeenCalled(); expect(m.replace).not.toHaveBeenCalled(); expect(m.refresh).not.toHaveBeenCalled(); expect(m.route.mock.calls[0]?.[0]).toBe("owner");
});
it.each(["add", "edit"] as const)("actual %s employee save coalesces Salary/WPS refresh without fetching inactive-principal caches", async mode => {
  const {q} = mountEmployee(mode);
  const observed = payrollInquiries.map(key => {
    const active = [...key, "active-view"], inactive = [...key.slice(0, 3), "other-principal", "counted-page", "{}"];
    q.setQueryData(active, {revision: 1}); q.setQueryData(inactive, {revision: 77});
    const read = vi.fn(async () => ({revision: 2}));
    const observer = new QueryObserver(q, {queryKey: active, queryFn: read, staleTime: Infinity});
    return {active, inactive, read, stop: observer.subscribe(() => {})};
  });
  try {
    await save(); await act(async () => {await new Promise(resolve => setTimeout(resolve, 0));});
    for (const consumer of observed) {
      expect(consumer.read).toHaveBeenCalledTimes(1); expect(q.getQueryData(consumer.active)).toEqual({revision: 2});
      expect(q.getQueryData(consumer.inactive)).toEqual({revision: 77}); expect(q.getQueryState(consumer.inactive)?.fetchStatus).toBe("idle");
    }
    for (const key of unrelated) expect(q.getQueryState(key)?.isInvalidated).toBe(false);
  } finally {observed.forEach(consumer => consumer.stop());}
});

it.each(["add", "edit"] as const)("actual %s employee save refreshes report choices once without fetching another report principal", async mode => {
  const {q} = mountEmployee(mode), inactive = ["reports", "criteria", "owner-b", "SYNTHETIC_REPORT", "employee_id", "{}"];
  q.setQueryData(inactive, {unchanged: true});
  const read = vi.fn(async () => ({revision: 2}));
  const observer = new QueryObserver(q, {queryKey: reportEmployeeCriteria, queryFn: read, staleTime: Infinity}), stop = observer.subscribe(() => {});
  try {
    await save(); await act(async () => {await new Promise(resolve => setTimeout(resolve, 0));});
    expect(read).toHaveBeenCalledTimes(1); expect(q.getQueryData(reportEmployeeCriteria)).toEqual({revision: 2});
    expect(q.getQueryData(inactive)).toEqual({unchanged: true}); expect(q.getQueryState(inactive)?.fetchStatus).toBe("idle");
    for (const key of unrelated) expect(q.getQueryState(key)?.isInvalidated).toBe(false);
  } finally {stop();}
});

function browserCompositionResponse(input: unknown, phase: "seed" | "old" | "fresh") {
  const criteria = hrDocumentBrowserCriteriaSchema.parse(input), asOf = "2026-10-05T00:00:00.000Z";
  if (criteria.operation === "employees") return {success: true as const, data: hrBrowserEmployeesPage.parse({criteria, asOf, totalCount: 1,
    rows: [{id: 7, employeeCode: "SYN-7", fullNameEn: "Synthetic browser employee", status: "active"}]})};
  if (criteria.operation !== "documents") throw Error("Unexpected browser composition operation");
  const count = phase === "fresh" ? 1 : phase === "seed" ? 2 : 3;
  return {success: true as const, data: hrBrowserDocumentsPage.parse({criteria, asOf, totalCount: count,
    rows: Array.from({length: count}, (_,index) => ({key: `identity:${index + 1}`, id: null, documentNo: null, title: `${phase} document ${index + 1}`,
      typeNameEn: "Synthetic identity", status: "active", issueDate: null, expiryDate: null, source: "hr_identity"}))})};
}
type BrowserCompositionPending = {input: HrDocumentBrowserCriteria; signal: AbortSignal; finish: (value: ReturnType<typeof browserCompositionResponse>) => void};
it.each([false, true])("actual employee edit retires same-default-key documents disabled by an injected invalid criterion (seeded=%s)", async seeded => {
  const q = client(), context = {...auth, permissionCodes: [...auth.permissionCodes, "dms.documents.view"], roleAssignments: []};
  let confirmed = false, documentCalls = 0, old: BrowserCompositionPending | undefined, fresh: BrowserCompositionPending | undefined;
  m.read.mockImplementation((resource: string, input: HrDocumentBrowserCriteria, signal: AbortSignal) => {
    if (resource !== "hr-document-browser") throw Error("Unexpected composition read resource");
    if (input.operation === "employees") return Promise.resolve(browserCompositionResponse(input, "seed"));
    documentCalls++;
    if (seeded && documentCalls === 1) return Promise.resolve(browserCompositionResponse(input, "seed"));
    return new Promise<ReturnType<typeof browserCompositionResponse>>(finish => {
      if (confirmed) fresh = {input, signal, finish}; else old = {input, signal, finish};
    });
  });
  m.update.mockImplementation(async () => {confirmed = true; return {success: true, data: {id: 7, revision: "2", replayed: false}};});
  m.path = "/admin/hr/employees/record/7";
  const view = render(<FluentProvider theme={webLightTheme}><QueryClientProvider client={q}><WorkspaceUiMemoryProvider>
    <div data-testid="employee-save-companion"><EmployeeWorkspaceForm mode="edit" authContext={context} employee={{id: 7, workspace_revision: 1, full_name_en: "Saved", gender: "female", owner_company_id: 1, employee_category_id: 1} as EmployeeListRow} /></div>
    <div data-testid="browser-companion"><HrDocBrowserPageClient authContext={context} /></div>
  </WorkspaceUiMemoryProvider></QueryClientProvider></FluentProvider>);
  const browserView = within(screen.getByTestId("browser-companion")), employeeView = within(screen.getByTestId("employee-save-companion"));
  fireEvent.change(employeeView.getByRole("textbox", {name: "Synthetic employee name"}), {target: {value: "Synthetic confirmed edit"}});
  fireEvent.click(employeeView.getByRole("button", {name: "Fill synthetic selections"}));
  fireEvent.click(await browserView.findByRole("button", {name: /^Synthetic browser employee/}));
  if (seeded) {
    await browserView.findAllByText("seed document 1");
    fireEvent.click(browserView.getByRole("button", {name: "Refresh browser"}));
  }
  await waitFor(() => expect(old).toBeDefined());
  const region = within(browserView.getByRole("region", {name: "Selected employee documents"}));
  const search = region.getByRole("textbox", {name: "Synthetic document criteria fault"});
  const key = browser(hrDocumentBrowserIdentity(context)), query = q.getQueryCache().find({queryKey: key, exact: true})!;
  expect(query).toBeDefined(); expect(query.state.fetchStatus).toBe("fetching");
  expect(search.hasAttribute("maxlength")).toBe(false); expect((search as HTMLInputElement).disabled).toBe(false);
  vi.useFakeTimers({toFake: ["setTimeout", "clearTimeout"]});
  try {
    fireEvent.change(search, {target: {value: "x".repeat(201)}});
    await act(async () => {await vi.advanceTimersByTimeAsync(250);});
    expect((search as HTMLInputElement).value).toHaveLength(201);
    expect(q.getQueryCache().find({queryKey: key, exact: true})).toBe(query);
    expect(query.getObserversCount()).toBe(1); expect(query.isActive()).toBe(false); expect(query.state.fetchStatus).toBe("fetching");
    expect(documentCalls).toBe(seeded ? 2 : 1); expect(region.queryAllByText("seed document 1")).toHaveLength(0);
    await save();
    await act(async () => {await vi.advanceTimersByTimeAsync(5);});
    expect(m.update).toHaveBeenCalledOnce(); expect(m.create).not.toHaveBeenCalled(); expect(m.shell?.isDirty).toBe(false);
    expect.soft(old!.signal.aborted).toBe(true);
    await act(async () => {old!.finish(browserCompositionResponse(old!.input, "old")); await vi.advanceTimersByTimeAsync(5);});
    expect(region.queryAllByText("old document 1")).toHaveLength(0); expect(region.queryByText("3 documents")).toBeNull();
    fireEvent.change(search, {target: {value: ""}});
    await act(async () => {await vi.advanceTimersByTimeAsync(250);});
    await act(async () => {if (fresh) fresh.finish(browserCompositionResponse(fresh.input, "fresh")); await vi.advanceTimersByTimeAsync(5);});
    expect(region.queryAllByText("old document 1")).toHaveLength(0); expect(region.getAllByText("fresh document 1").length).toBeGreaterThan(0);
    expect(region.getByText(/\b1 document$/)).toBeTruthy(); expect(documentCalls).toBe(seeded ? 3 : 2);
    expect(query.state.data).toEqual(browserCompositionResponse(fresh!.input, "fresh").data);
    const inputs = m.read.mock.calls.map(([,input]) => hrDocumentBrowserCriteriaSchema.parse(input));
    expect(inputs.every(input => input.operation === "employees" || input.operation === "documents" && input.search === "")).toBe(true);
    expect(m.update).toHaveBeenCalledOnce(); expect(m.refresh).toHaveBeenCalledOnce(); expect(m.close).not.toHaveBeenCalled(); expect(m.replace).not.toHaveBeenCalled();
  } finally {view.unmount(); q.clear(); vi.useRealTimers();}
});
