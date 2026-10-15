// @vitest-environment jsdom
import "../remediation/f05/setup";
import React from "react";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {act, cleanup, fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {FluentProvider, webLightTheme} from "@fluentui/react-components";
import {WorkspaceUiMemoryProvider} from "@/hooks/use-persistent-ui-state";
const state = vi.hoisted(() => ({read: vi.fn(), openTab: vi.fn(), loadExport: undefined as undefined | (() => Promise<unknown[]>)}));
vi.mock("@/lib/reads/client", async () => ({...await vi.importActual("@/lib/reads/client"), readJson: state.read}));
vi.mock("@/hooks/use-workspace", () => ({useWorkspace: () => ({openTab: state.openTab})}));
vi.mock("next/navigation", () => ({usePathname: () => "/admin/hr/document-browser", useRouter: () => ({push: vi.fn(), refresh: vi.fn()})}));
// File-generation UI is excluded from jsdom. This original RecordCollection has
// no exportConfig, and the test confirms it does not advertise a partial export.
vi.mock("@/components/erp/export/erp-export-menu", () => ({ERPExportMenu: ({loadData}: {loadData?: () => Promise<unknown[]>}) => {state.loadExport = loadData; return null;}}));
import {HrDocBrowserPageClient} from "@/features/hr/document-browser/hr-doc-browser-page-client";
import {hrDocumentBrowserCriteriaSchema, hrDocumentBrowserIdentity, hrBrowserEmployeesPage, type HrDocumentBrowserCriteria, type HrBrowserDocument} from "@/lib/reads/hr-document-browser-schema";
import {hrBrowserPrefix} from "@/hooks/use-hr-document-browser";
import {ReadError} from "@/lib/reads/client";
import type {AuthContext} from "@/lib/rbac/check";
const context = {profile: {id: 1, auth_user_id: "synthetic-one", must_change_password: false}, isAccountActive: true, accountStatus: "active", roleCodes: [], permissionCodes: ["hr.employees.view", "dms.documents.view"], roleAssignments: []} as unknown as AuthContext;
const doc = (id: number, extra: Partial<HrBrowserDocument> = {}): HrBrowserDocument => ({key: `dms:${id}`, id, title: `Document ${id}`, documentNo: `DOC-${id}`, source: "dms_link", typeNameEn: "Evidence", status: "draft", issueDate: null, expiryDate: null, ...extra});
function response(input: unknown, changes: Record<string, unknown> = {}) {
  const criteria = hrDocumentBrowserCriteriaSchema.parse(input), asOf = new Date().toISOString();
  const rows = criteria.operation === "employees" ? [{id: 1, employeeCode: "SYN-1", fullNameEn: "Synthetic Alpha", status: "active"}, {id: 2, employeeCode: "SYN-2", fullNameEn: "Synthetic Beta", status: "archived"}]
    : criteria.operation === "dependents" ? [{id: 7, employeeId: criteria.employeeId, name: "Synthetic Child", relationship: "Child"}]
    : criteria.operation === "documents" ? [doc(criteria.entityId === 1 ? 11 : 22), doc(criteria.entityId === 1 ? 12 : 23)]
    : [{id: criteria.documentId * 100, documentId: criteria.documentId, fileName: `Synthetic file ${criteria.documentId}.pdf`, mimeType: "application/pdf", fileSizeBytes: 20}];
  return {success: true, data: {criteria, asOf, totalCount: rows.length, rows, ...(criteria.operation === "files" ? {availability: "available", canPreview: true, canDownload: true} : {}), ...changes}};
}
const clients: QueryClient[] = [];
function mount(auth = context, seed?: ReturnType<typeof hrBrowserEmployeesPage.parse>) {
  const client = new QueryClient({defaultOptions: {queries: {retry: false, retryDelay: 0}}}); clients.push(client);
  const ui = (ctx: AuthContext) => <FluentProvider theme={webLightTheme}><QueryClientProvider client={client}><WorkspaceUiMemoryProvider><HrDocBrowserPageClient authContext={ctx}
    initialRead={seed ? {identity: hrDocumentBrowserIdentity(auth), data: seed} : undefined} /></WorkspaceUiMemoryProvider></QueryClientProvider></FluentProvider>;
  const view = render(ui(auth)); return {...view, client, replace: (ctx: AuthContext) => view.rerender(ui(ctx)), reopen: () => {view.rerender(<></>); view.rerender(ui(auth));}};
}
const op = (operation: string) => state.read.mock.calls.filter(([, input]) => input.operation === operation);
beforeEach(() => {state.read.mockImplementation((_resource, criteria) => Promise.resolve(response(criteria)));});
afterEach(() => {cleanup(); clients.splice(0).forEach(client => client.clear()); state.read.mockReset(); state.openTab.mockReset(); state.loadExport = undefined;});
async function selectEmployee(name = "Synthetic Alpha") {fireEvent.click(await screen.findByRole("button", {name: new RegExp(`^${name}`)}));}
it("actual navigator is lazy; expanding one employee fetches only its children, and selection fetches one document page plus selected files", async () => {
  mount(); await screen.findByText("Synthetic Alpha"); expect(state.read).toHaveBeenCalledTimes(1); expect(op("employees")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", {name: "Expand dependents for Synthetic Alpha"})); await screen.findByText("Synthetic Child"); expect(op("dependents")).toHaveLength(1); expect(op("documents")).toHaveLength(0);
  await selectEmployee(); await screen.findByTitle("Synthetic file 11.pdf"); expect(op("documents")).toHaveLength(1); expect(op("files")).toHaveLength(1);
  expect(op("files")[0][1]).toMatchObject({documentId: 11, entityId: 1, pageSize: 25}); expect(screen.getByText("Inactive")).toBeTruthy();
});
it("matching bounded SSR seed paints without duplicate initial fetch; a different principal cannot reuse it", async () => {
  const seed = hrBrowserEmployeesPage.parse(response({operation: "employees"}).data); const view = mount(context, seed); expect(screen.getByText("Synthetic Alpha")).toBeTruthy(); expect(state.read).not.toHaveBeenCalled();
  view.replace({...context, profile: {...context.profile!, id: 2, auth_user_id: "other"}}); await waitFor(() => expect(state.read).toHaveBeenCalledTimes(1));
});
it("dependent-name navigation search and active status are sent to the complete reader rather than filtering one page", async () => {
  mount(); await screen.findByText("Synthetic Alpha"); fireEvent.change(screen.getByLabelText("Search employees"), {target: {value: "child-match"}});
  expect(screen.queryByText("Synthetic Alpha")).toBeNull(); await waitFor(() => expect(op("employees")).toHaveLength(2));
  expect(op("employees")[1][1]).toMatchObject({search: "child-match", page: 1}); await screen.findByText("Synthetic Alpha");
  fireEvent.click(screen.getByRole("button", {name: "active"})); await waitFor(() => expect(op("employees")).toHaveLength(3)); expect(op("employees")[2][1].status).toBe("active");
});
it("selecting a different document reads only its file metadata and uses the existing protected byte proxy", async () => {
  mount(); await selectEmployee(); await screen.findByTitle("Synthetic file 11.pdf");
  fireEvent.click(within(screen.getByRole("region", {name: "Selected employee documents"})).getByRole("button", {name: /Document 12/}));
  await screen.findByTitle("Synthetic file 12.pdf"); expect(op("files").map(c => c[1].documentId)).toEqual([11, 12]);
  expect(screen.getByTitle("Synthetic file 12.pdf").getAttribute("src")).toBe("/api/dms/file?fileId=1200&disposition=inline");
  expect(screen.getByRole("link", {name: "Download"}).getAttribute("href")).toBe("/api/dms/file?fileId=1200&disposition=attachment");
  fireEvent.click(screen.getByRole("button", {name: "Open Full Record"})); expect(state.openTab).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({route: "/dms/documents/record/12", entityId: 12}));
});
it("metadata-only HR identity remains selectable without DMS file calls or a full-record affordance", async () => {
  state.read.mockImplementation((_r, p: HrDocumentBrowserCriteria) => Promise.resolve(response(p, p.operation === "documents" ? {rows: [doc(1, {key: "identity:7", id: null, source: "hr_identity", title: "Metadata identity"})], totalCount: 1} : {})));
  mount(); await selectEmployee(); await screen.findByText(/No accessible DMS file/); expect(op("files")).toHaveLength(0); expect(screen.queryByRole("button", {name: "Open Full Record"})).toBeNull();
});
it("separate preview/download capabilities never become implied by metadata visibility", async () => {
  state.read.mockImplementation((_r, p: HrDocumentBrowserCriteria) => Promise.resolve(response(p, p.operation === "files" ? {canPreview: false, canDownload: false} : {})));
  mount(); await selectEmployee(); await screen.findByText("Your current access does not allow inline preview."); expect(document.querySelector("iframe")).toBeNull(); expect(screen.queryByRole("link", {name: /Download/})).toBeNull();
});
it("untrusted image MIME does not produce an inline iframe/image", async () => {
  state.read.mockImplementation((_r, p: HrDocumentBrowserCriteria) => Promise.resolve(response(p, p.operation === "files" ? {rows: [{id: 1100, documentId: p.documentId, fileName: "Synthetic.svg", mimeType: "image/svg+xml", fileSizeBytes: 20}]} : {})));
  mount(); await selectEmployee(); await screen.findByText("Inline preview is not available for this file type."); expect(document.querySelector("iframe,img")).toBeNull(); expect(screen.getByRole("link", {name: "Download to view"})).toBeTruthy();
});
it.each(["employees", "documents", "files"])("%s 503 hides previous content, never claims zero, retries once and recovers", async operation => {
  let fail = false; state.read.mockImplementation((_r, p: HrDocumentBrowserCriteria) => fail && p.operation === operation ? Promise.reject(new ReadError("SYNTHETIC_PRIVATE", 503)) : Promise.resolve(response(p)));
  const view = mount(); await selectEmployee(); await screen.findByTitle("Synthetic file 11.pdf"); fail = true;
  await act(async () => {await view.client.invalidateQueries({queryKey: [...hrBrowserPrefix(hrDocumentBrowserIdentity(context)), operation]});});
  await screen.findByRole("button", {name: `Retry ${operation}`}); expect(screen.queryByText(/SYNTHETIC_PRIVATE/)).toBeNull(); expect(screen.queryByText("No employees match.")).toBeNull();
  if (operation !== "employees") expect(document.querySelector("iframe")).toBeNull();
  const countBefore = op(operation).length; fail = false; fireEvent.click(screen.getByRole("button", {name: `Retry ${operation}`})); await waitFor(() => expect(op(operation).length).toBe(countBefore + 1));
  await waitFor(() => expect(screen.queryByRole("button", {name: `Retry ${operation}`})).toBeNull());
});
it.each([401, 403])("same-principal %s retires all browser private cache and previews without retry", async status => {
  let denied = false; state.read.mockImplementation((_r, p: HrDocumentBrowserCriteria) => denied && p.operation === "documents" ? Promise.reject(new ReadError("denied", status)) : Promise.resolve(response(p)));
  const view = mount(); await selectEmployee(); await screen.findByTitle("Synthetic file 11.pdf"); denied = true;
  await act(async () => {await view.client.invalidateQueries({queryKey: [...hrBrowserPrefix(hrDocumentBrowserIdentity(context)), "documents"]});});
  await screen.findByText(/Previous records and previews have been cleared/); expect(document.querySelector("iframe")).toBeNull(); expect(screen.queryByText("Synthetic Alpha")).toBeNull();
  expect(op("documents")).toHaveLength(2); expect(view.client.getQueryCache().findAll({queryKey: hrBrowserPrefix(hrDocumentBrowserIdentity(context))})).toHaveLength(0);
});
it("confirmed unavailable file target clears its metadata without treating it as no attachments", async () => {
  state.read.mockImplementation((_r, p: HrDocumentBrowserCriteria) => Promise.resolve(p.operation === "files" ? {success: true, data: {criteria: p, asOf: new Date().toISOString(), availability: "unavailable"}} : response(p)));
  mount(); await selectEmployee(); await screen.findByText(/Previous records and previews have been cleared/); expect(screen.queryByText("Document 11")).toBeNull(); expect(screen.queryByText(/no files attached/)).toBeNull();
});
it("late previous-employee responses cannot paint documents or dispatch a file read", async () => {
  let finish!: (value: unknown) => void, request: unknown, signal!: AbortSignal;
  state.read.mockImplementation((_r, p: HrDocumentBrowserCriteria, s: AbortSignal) => p.operation === "documents" && p.entityId === 1 ? (request = p, signal = s, new Promise(resolve => {finish = resolve;})) : Promise.resolve(response(p)));
  mount(); await selectEmployee(); await waitFor(() => expect(op("documents")).toHaveLength(1)); await selectEmployee("Synthetic Beta"); await screen.findByTitle("Synthetic file 22.pdf"); expect(signal.aborted).toBe(true);
  await act(async () => finish(response(request, {rows: [doc(99, {title: "RETIRED_PRIVATE"})], totalCount: 1}))); expect(screen.queryByText("RETIRED_PRIVATE")).toBeNull(); expect(op("files").map(c => c[1].documentId)).toEqual([22]);
});
it("account switch clears selection and old-owner queries before an old file response completes", async () => {
  let finish!: (value: unknown) => void, request: unknown, signal!: AbortSignal;
  state.read.mockImplementation((_r, p: HrDocumentBrowserCriteria, s: AbortSignal) => p.operation === "files" ? (request = p, signal = s, new Promise(resolve => {finish = resolve;})) : Promise.resolve(response(p)));
  const view = mount(); await selectEmployee(); await waitFor(() => expect(op("files")).toHaveLength(1));
  view.replace({...context, profile: {...context.profile!, id: 9, auth_user_id: "other"}}); await waitFor(() => expect(op("employees")).toHaveLength(2)); expect(signal.aborted).toBe(true);
  await act(async () => finish(response(request))); expect(document.querySelector("iframe")).toBeNull(); expect(view.client.getQueryCache().findAll({queryKey: hrBrowserPrefix(hrDocumentBrowserIdentity(context))})).toHaveLength(0);
});
it("oversized composition is explicit and never a successful empty view", async () => {
  state.read.mockImplementation((_r, p: HrDocumentBrowserCriteria) => Promise.resolve(p.operation === "documents" ? {success: true, data: {criteria: p, asOf: new Date().toISOString(), availability: "too_large"}} : response(p)));
  mount(); await selectEmployee(); await screen.findByText(/Too many matching records/); expect(screen.queryByText(/No documents linked yet/)).toBeNull(); expect(op("files")).toHaveLength(0);
});
it.each(["wrong-owner", "partial", "private-field"])("%s DTO is rejected instead of rendering private/partial data", async mode => {
  state.read.mockImplementation((_r, p: HrDocumentBrowserCriteria) => {
    const result = response(p); if (p.operation === "documents") {if (mode === "wrong-owner") result.data.criteria = {...p, entityId: 77}; if (mode === "partial") result.data.totalCount = 17; if (mode === "private-field") Object.assign(result.data, {salary: "SYNTHETIC_PRIVATE"});} return Promise.resolve(result);
  });
  mount(); await selectEmployee(); await screen.findByRole("button", {name: "Retry documents"}); expect(op("files")).toHaveLength(0); expect(screen.queryByText(/SYNTHETIC_PRIVATE/)).toBeNull();
});
it("actual table search retains its input/focus during a pending complete-result read", async () => {
  mount(); await selectEmployee(); await screen.findByTitle("Synthetic file 11.pdf");
  const input = screen.getByRole("textbox", {name: "Search all permitted records…"}); input.focus();
  fireEvent.change(input, {target: {value: "Document 12"}});
  expect(screen.getByRole("textbox", {name: "Search all permitted records…"})).toBe(input); expect(document.activeElement).toBe(input);
  await waitFor(() => expect(op("documents")).toHaveLength(2)); expect(op("documents")[1][1]).toMatchObject({search: "Document 12", page: 1});
  // Original RecordCollection does not expose a collection export menu.
  expect(state.loadExport).toBeUndefined();
});
it("actual hierarchy, document table and file controls request later pages instead of truncating their collections", async () => {
  state.read.mockImplementation((_r, input: HrDocumentBrowserCriteria) => {
    const p = hrDocumentBrowserCriteriaSchema.parse(input);
    const all = Array.from({length: 26}, (_, i) => p.operation === "employees"
      ? {id: i + 1, employeeCode: `SYN-${i + 1}`, fullNameEn: i === 0 ? "Synthetic Alpha" : `Synthetic Person ${i + 1}`, status: "active"}
      : p.operation === "dependents" ? {id: i + 101, employeeId: p.employeeId, name: `Synthetic Child ${i + 1}`, relationship: "Child"}
      : p.operation === "documents" ? doc(i + 11)
      : {id: p.documentId * 100 + i, documentId: p.documentId, fileName: `Synthetic page file ${i + 1}.pdf`, mimeType: "application/pdf", fileSizeBytes: 20});
    return Promise.resolve(response(p, {totalCount: 26, rows: all.slice((p.page - 1) * p.pageSize, p.page * p.pageSize)}));
  });
  mount(); await screen.findByText("Synthetic Alpha");
  fireEvent.click(screen.getByRole("button", {name: "Next employees page"})); await screen.findByText("Synthetic Person 26");
  expect(screen.queryByText("Synthetic Alpha")).toBeNull(); expect(op("employees").at(-1)?.[1]).toMatchObject({page: 2, pageSize: 25});
  fireEvent.click(screen.getByRole("button", {name: "Previous employees page"})); await screen.findByText("Synthetic Alpha");
  fireEvent.click(screen.getByRole("button", {name: "Expand dependents for Synthetic Alpha"})); await screen.findByText("Synthetic Child 1");
  fireEvent.click(screen.getByRole("button", {name: "Next dependents of Synthetic Alpha page"})); await screen.findByText("Synthetic Child 26");
  expect(screen.queryByText("Synthetic Child 1")).toBeNull(); expect(op("dependents").at(-1)?.[1]).toMatchObject({employeeId: 1, page: 2});
  await selectEmployee(); await waitFor(() => expect(document.querySelector("iframe")?.getAttribute("src")).toBe("/api/dms/file?fileId=1100&disposition=inline"));
  fireEvent.click(screen.getByRole("button", {name: "Next files page"})); await screen.findByTitle("Synthetic page file 26.pdf");
  expect(op("files").at(-1)?.[1]).toMatchObject({documentId: 11, page: 2});
  const list = within(screen.getByRole("region", {name: "Selected employee documents"}));
  fireEvent.click(list.getByRole("button", {name: "Next"})); await list.findByRole("button", {name: /Document 36/});
  expect(op("documents").at(-1)?.[1]).toMatchObject({page: 2, pageSize: 25});
  await waitFor(() => expect(document.querySelector("iframe")?.getAttribute("src")).toBe("/api/dms/file?fileId=3600&disposition=inline")); expect(op("files").at(-1)?.[1]).toMatchObject({documentId: 36, page: 1});
});
it("actual Edit filters and column sort issue complete-result criteria without client-only filtering", async () => {
  mount(); await selectEmployee(); await screen.findByTitle("Synthetic file 11.pdf");
  const list = within(screen.getByRole("region", {name: "Selected employee documents"}));
  fireEvent.click(list.getByRole("button", {name: "Edit filters"}));
  const dialog = await screen.findByRole("dialog", {name: "Edit filters"});
  fireEvent.change(within(dialog).getByRole("textbox", {name: "Type"}), {target: {value: "Evidence"}});
  fireEvent.click(within(dialog).getByRole("button", {name: "Apply"}));
  await waitFor(() => expect(screen.queryByRole("dialog", {name: "Edit filters"})).toBeNull());
  await waitFor(() => expect(op("documents")).toHaveLength(2));
  expect(op("documents")[1][1]).toMatchObject({page: 1, columnFilters: {typeNameEn: "Evidence"}});
  await screen.findByTitle("Synthetic file 11.pdf");
  fireEvent.click(list.getByRole("button", {name: "Document"}));
  await waitFor(() => expect(op("documents")).toHaveLength(3));
  expect(op("documents")[2][1]).toMatchObject({page: 1, sortKey: "title", sortDir: "asc", columnFilters: {typeNameEn: "Evidence"}});
  await screen.findByTitle("Synthetic file 11.pdf"); fireEvent.click(list.getByRole("button", {name: "Document"}));
  await waitFor(() => expect(op("documents")).toHaveLength(4)); expect(op("documents")[3][1].sortDir).toBe("desc");
});
