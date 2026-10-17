// @vitest-environment jsdom
import React from "react";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {act, cleanup, fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {syntheticAuthContext} from "./fixtures/auth-context";
import {DmsApprovalsQueuePageClient} from "@/features/dms/approvals/dms-approvals-queue-page-client";
import {DmsApprovalActionPanel} from "@/features/dms/approvals/dms-approval-action-panel";
import {DmsApprovalActionDialog} from "@/features/dms/approvals/dms-approval-action-dialog";
import {ReadError} from "@/lib/reads/client";
import {RecordReadActivity} from "@/hooks/use-record-read-active";
const mocks = vi.hoisted(() => ({read: vi.fn(), oldQueue: vi.fn(), oldState: vi.fn(), oldHistory: vi.fn(), action: vi.fn(), submit: null as (() => void) | null, refresh: null as (() => void) | null}));
vi.mock("@/lib/reads/client", async original => ({...await original<typeof import("@/lib/reads/client")>(), readJson: mocks.read}));
vi.mock("@/server/actions/dms/document-approvals", () => ({listPendingDocumentApprovalsForCurrentUser: mocks.oldQueue,
  getDocumentApprovalState: mocks.oldState, getDocumentApprovalHistory: mocks.oldHistory,
  submitDocumentForApproval: mocks.action, approveDocument: mocks.action, rejectDocument: mocks.action, withdrawDocumentApproval: mocks.action}));
vi.mock("@/components/ui/button", () => ({Button: ({children, variant, size, ...props}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & {variant?: string; size?: string; onClick?: () => void}) => {
  void variant; void size;
  if (React.Children.toArray(children).includes("Refresh approval status")) mocks.refresh = props.onClick ?? null;
  return <button {...props}>{children}</button>;
}}));
vi.mock("@/components/ui/input", () => ({Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props}/>}));
vi.mock("@/components/ui/tooltip", () => ({TooltipProvider: ({children}: React.PropsWithChildren) => <>{children}</>, Tooltip: ({children}: React.PropsWithChildren) => <>{children}</>, TooltipTrigger: ({children}: React.PropsWithChildren) => <>{children}</>, TooltipContent: ({children}: React.PropsWithChildren) => <span>{children}</span>}));
vi.mock("@/components/erp/table/list-controls", () => ({useListColumns: (_name: string, columns: unknown[]) => ({columns, visible: columns, setColumns: vi.fn()}), EditColumns: () => null, EditFilters: () => null,
  ConfiguredRow: ({children, columns, ...props}: React.PropsWithChildren<{columns: unknown[]}>) => {void columns; return <tr {...props}>{children}</tr>;}}));
vi.mock("@/hooks/use-persistent-ui-state", () => ({usePersistentUiState: (_key: string, value: unknown) => React.useState(value)}));
vi.mock("@/components/erp/erp-child-dialog-form", () => ({ERPChildDialogForm: ({open, children, onSubmit, submitLabel, isSubmitting, submitDisabled}: React.PropsWithChildren<{open: boolean; onSubmit: () => void; submitLabel: string; isSubmitting: boolean; submitDisabled?: boolean}>) => {
  mocks.submit = onSubmit; return open ? <div role="dialog">{children}<button disabled={isSubmitting || submitDisabled} onClick={onSubmit}>{submitLabel}</button></div> : null;
}}));
vi.mock("@/components/ui/textarea", () => ({Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props}/>}));
vi.mock("@/components/ui/label", () => ({Label: (props: React.LabelHTMLAttributes<HTMLLabelElement>) => <label {...props}/>}));
const auth = syntheticAuthContext(["dms.approvals.view", "dms.approvals.act"], {id: 6, auth_user_id: "test-actor"});
const record = {documentId: 1, documentNo: "SYN-1", title: "Synthetic document", documentTypeId: null, documentTypeName: null, documentStatus: "active",
  approvalStatus: "pending_approval", submittedBy: 9, submittedByName: null, submittedAt: null, currentApprovalId: 3, currentApprovalAction: "submitted", currentWorkflowId: null,
  currentStepId: null, canSubmit: false, canApprove: true, canReject: true, canWithdraw: false, canViewHistory: true, selfApprovalBlocked: false,
  selfApprovalBlockReason: null, actionUnavailableReason: null, latestComments: null, latestReason: null};
function wrap() {const client = new QueryClient({defaultOptions: {queries: {retry: false}}}); return {client, wrapper: ({children}: React.PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>};}
function pending<T>() {let resolve!: (value: T) => void; const promise = new Promise<T>(r => {resolve = r;}); return {promise, resolve};}
const queueRow = (id: number) => ({documentId: id, documentNo: `SYN-${id}`, title: `Synthetic ${id}`, documentTypeName: null, ownerName: null, submittedByName: null,
  submittedAt: null, approvalStatus: "pending_approval", currentApprovalId: id + 1000, daysPending: null, canAct: true, canWithdraw: false, isRedacted: false});
const historyRow = (id: number) => ({id, documentId: 1, action: "approved", actionedBy: 9, actionedByName: null, actionedAt: "2026-10-05T00:00:00Z", submittedBy: 9,
  submittedByName: null, submittedAt: null, reason: null, comments: `Historical comment ${id}`, isCurrent: false, workflowId: null, stepId: null, createdAt: "2026-10-05T00:00:00Z"});
beforeEach(() => {vi.clearAllMocks(); mocks.submit = null; mocks.refresh = null; mocks.oldQueue.mockResolvedValue({success: true, data: {rows: [], total: 0}});
  mocks.oldState.mockResolvedValue({success: true, data: record}); mocks.oldHistory.mockResolvedValue({success: true, data: []});
  mocks.read.mockImplementation(async (_path, criteria) => ({success: true, data: criteria.mode === "state" ? {criteria, record} : {criteria, rows: [], totalCount: 0}}));
});
afterEach(cleanup);
it("queue reads use the bounded private transport, not the old Server Action", async () => {
  render(<DmsApprovalsQueuePageClient {...{authContext: auth, canAct: true, isAdmin: false}}/>, {wrapper: wrap().wrapper});
  await screen.findByText("No pending approvals for you right now.");
  expect(mocks.oldQueue).not.toHaveBeenCalled(); expect(mocks.read).toHaveBeenCalledWith("dms-approvals", expect.objectContaining({mode: "queue", page: 1, pageSize: 20}), expect.any(AbortSignal));
});
it("opening a record loads state only; history is reachable but requires an explicit interaction", async () => {
  render(<DmsApprovalActionPanel {...{documentId: 1, authContext: auth}}/>, {wrapper: wrap().wrapper});
  await screen.findByText("Approval Status");
  expect(mocks.oldHistory).not.toHaveBeenCalled(); expect(mocks.read.mock.calls.filter(c => c[1].mode === "history")).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", {name: "Show approval history"}));
  await screen.findByText("No approval history yet."); expect(mocks.read.mock.calls.filter(c => c[1].mode === "history")).toHaveLength(1);
});
it("queue typing is coalesced and whitespace is preserved as literal search", async () => {
  render(<DmsApprovalsQueuePageClient {...{authContext: auth, canAct: true, isAdmin: false}}/>, {wrapper: wrap().wrapper});
  await screen.findByText("No pending approvals for you right now."); mocks.read.mockClear();
  const input = screen.getByLabelText("Search approval queue"); fireEvent.change(input, {target: {value: " a"}}); fireEvent.change(input, {target: {value: " a "}});
  expect(mocks.read).not.toHaveBeenCalled(); await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(1));
  expect(mocks.read.mock.calls[0][1].search).toBe(" a ");
});
it("queue page, native sort and status are adopted with exact count and page reset", async () => {
  mocks.read.mockImplementation(async (_path, criteria) => ({success: true, data: {criteria, rows: Array.from({length: criteria.page === 1 ? 20 : 1}, (_, i) => queueRow((criteria.page - 1) * 20 + i + 1)), totalCount: 21}}));
  render(<DmsApprovalsQueuePageClient authContext={auth} canAct isAdmin={false}/>, {wrapper: wrap().wrapper});
  await screen.findByText("SYN-1"); fireEvent.click(screen.getByRole("button", {name: "Next"})); await screen.findByText("SYN-21");
  expect(mocks.read.mock.calls.at(-1)?.[1]).toMatchObject({page: 2, pageSize: 20});
  fireEvent.click(screen.getByRole("button", {name: "Title"})); await screen.findByText("SYN-1");
  expect(mocks.read.mock.calls.at(-1)?.[1]).toMatchObject({page: 1, sortBy: "title", sortDirection: "desc"});
  fireEvent.click(screen.getByRole("button", {name: "Rejected"}));
  await waitFor(() => expect(mocks.read.mock.calls.at(-1)?.[1]).toMatchObject({page: 1, status: "rejected"}));
});
it("history exposes the next counted page and does not refetch state for pagination", async () => {
  mocks.read.mockImplementation(async (_path, criteria) => ({success: true, data: criteria.mode === "state" ? {criteria, record} : {criteria,
    rows: Array.from({length: criteria.page === 1 ? 20 : 1}, (_, i) => historyRow((criteria.page - 1) * 20 + i + 1)), totalCount: 21}}));
  render(<DmsApprovalActionPanel documentId={1} authContext={auth}/>, {wrapper: wrap().wrapper}); await screen.findByText("Approval Status");
  fireEvent.click(screen.getByRole("button", {name: "Show approval history"})); await screen.findByText("Historical comment 1");
  fireEvent.click(screen.getByRole("button", {name: "Next history"})); await screen.findByText("Historical comment 21");
  expect(mocks.read.mock.calls.filter(c => c[1].mode === "state")).toHaveLength(1);
  expect(mocks.read.mock.calls.at(-1)?.[1]).toMatchObject({mode: "history", documentId: 1, page: 2, pageSize: 20});
});
it("history failure is unavailable, not empty, and retry remains a lazy isolated read", async () => {
  mocks.read.mockImplementation(async (_path, criteria) => {if (criteria.mode === "history") throw new ReadError("private", 400); return {success: true, data: {criteria, record}};});
  render(<DmsApprovalActionPanel documentId={1} authContext={auth}/>, {wrapper: wrap().wrapper}); await screen.findByText("Approval Status");
  fireEvent.click(screen.getByRole("button", {name: "Show approval history"})); await screen.findByRole("alert");
  expect(screen.queryByText("No approval history yet.")).toBeNull();
  mocks.read.mockImplementation(async (_path, criteria) => ({success: true, data: {criteria, rows: [], totalCount: 0}}));
  fireEvent.click(screen.getByRole("button", {name: "Retry"})); await screen.findByText("No approval history yet.");
  expect(mocks.read.mock.calls.filter(c => c[1].mode === "state")).toHaveLength(1);
});
it("refreshing a mounted record preserves the open approval comment across loading", async () => {
  const {wrapper, client} = wrap(); render(<DmsApprovalActionPanel documentId={1} authContext={auth}/>, {wrapper}); await screen.findByText("Approval Status");
  fireEvent.click(screen.getByRole("button", {name: "Approve"})); fireEvent.change(screen.getByLabelText(/Comment/), {target: {value: "Keep this draft"}});
  const next = pending<unknown>(); let criteria: unknown; mocks.read.mockImplementationOnce((_path, input) => {criteria = input; return next.promise;});
  act(() => {void client.invalidateQueries({queryKey: ["dms", "approval-state", 1]});}); await screen.findByText("Loading approval state...");
  expect((screen.getByLabelText(/Comment/) as HTMLTextAreaElement).value).toBe("Keep this draft");
  await act(async () => next.resolve({success: true, data: {criteria, record}})); await screen.findByText("Approval Status");
  expect((screen.getByLabelText(/Comment/) as HTMLTextAreaElement).value).toBe("Keep this draft");
});
it("pausing a retained record hides its approval portal and fences old actions without losing the same-owner comment",async()=>{
 const {wrapper}=wrap();const ui=(active:boolean)=><RecordReadActivity active={active}><DmsApprovalActionPanel documentId={1} authContext={auth}/></RecordReadActivity>;
 const view=render(ui(true),{wrapper});await screen.findByText("Approval Status");fireEvent.click(screen.getByRole("button",{name:"Approve"}));fireEvent.change(screen.getByLabelText(/Comment/),{target:{value:"Retain across inactive section"}});
 const old=mocks.submit!;view.rerender(ui(false));expect(screen.queryByRole("dialog")).toBeNull();await act(async()=>old());expect(mocks.action).not.toHaveBeenCalled();
 view.rerender(ui(true));await waitFor(()=>expect(screen.getByLabelText(/Comment/)).toHaveProperty("value","Retain across inactive section"));await screen.findByText("Approval Status");expect(mocks.action).not.toHaveBeenCalled();
});
it.each(["failure", "uncertain"])("%s business result retains draft without invalidation or success", async kind => {
  const {wrapper, client} = wrap(), refresh = vi.spyOn(client, "invalidateQueries");
  if (kind === "failure") mocks.action.mockResolvedValue({success: false, error: "PRIVATE"}); else mocks.action.mockRejectedValue(Error("PRIVATE"));
  render(<DmsApprovalActionPanel documentId={1} authContext={auth}/>, {wrapper}); await screen.findByText("Approval Status");
  fireEvent.click(screen.getByRole("button", {name: "Approve"})); fireEvent.change(screen.getByLabelText(/Comment/), {target: {value: "Retain entered text"}});
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", {name: "Approve"})); await screen.findByRole("alert");
  expect((screen.getByLabelText(/Comment/) as HTMLTextAreaElement).value).toBe("Retain entered text"); expect(refresh).not.toHaveBeenCalled();
  expect(screen.getByRole("alert").textContent).not.toContain("PRIVATE"); expect(mocks.action).toHaveBeenCalledWith(1, 3, {comment: "Retain entered text"});
});
it("confirmed action refreshes the record once, with history staying closed", async () => {
  mocks.action.mockResolvedValue({success: true, data: {pending: true}}); const {wrapper} = wrap();
  render(<DmsApprovalActionPanel documentId={1} authContext={auth}/>, {wrapper}); await screen.findByText("Approval Status");
  fireEvent.click(screen.getByRole("button", {name: "Approve"})); fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", {name: "Approve"}));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull()); await waitFor(() => expect(mocks.read.mock.calls.filter(c => c[1].mode === "state")).toHaveLength(2));
  expect(mocks.read.mock.calls.filter(c => c[1].mode === "history")).toHaveLength(0);
});
it.each(["panel", "queue"])("actual %s confirmed action refreshes dependent documents, dashboards and notifications without clearing unrelated data", async source => {
  const {wrapper, client} = wrap(); mocks.action.mockResolvedValue({success: true});
  const affected = [["dms", "dashboard-read", "former", "{}"], ["dms", "browser", "former", "search", "{}"],
    ["dms", "entity-documents-read", "former", "employee", 7, "summary", "{}"], ["hr", "employees", "document-browser", "former"],
    ["read", "dms-documents", "former"], ["notifications", "former"], ["dms", "approval-history", 1, "former"]];
  const unaffected = [["workspace", "draft", 2], ["dms", "approval-state", 2, "former"]];
  for (const key of [...affected, ...unaffected]) client.setQueryData(key, {revision: 1});
  if (source === "panel") {render(<DmsApprovalActionPanel documentId={1} authContext={auth}/>, {wrapper}); await screen.findByText("Approval Status");
    fireEvent.click(screen.getByRole("button", {name: "Approve"}));
  } else {mocks.read.mockImplementation(async (_path, criteria) => ({success: true, data: {criteria, rows: [queueRow(1)], totalCount: 1}}));
    render(<DmsApprovalsQueuePageClient authContext={auth} canAct isAdmin={false}/>, {wrapper}); await screen.findByText("SYN-1");
    fireEvent.click(screen.getByText("Approve", {exact: true}).previousElementSibling!);
  }
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", {name: "Approve"}));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  for (const key of affected) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  for (const key of unaffected) {expect(client.getQueryState(key)?.isInvalidated).toBe(false); expect(client.getQueryData(key)).toEqual({revision: 1});}
});
it("manual panel refresh does not pretend a business mutation occurred", async () => {
  const {wrapper, client} = wrap(), key = ["dms", "dashboard-read", "current", "{}"]; client.setQueryData(key, {revision: 1});
  render(<DmsApprovalActionPanel documentId={1} authContext={auth}/>, {wrapper}); await screen.findByText("Approval Status");
  fireEvent.click(screen.getByRole("button", {name: "Refresh"}));
  await waitFor(() => expect(mocks.read.mock.calls.filter(c => c[1].mode === "state")).toHaveLength(2));
  expect(client.getQueryState(key)?.isInvalidated).toBe(false); expect(mocks.action).not.toHaveBeenCalled();
});
it("manual refresh revalidates state before requesting open history, without a canceled duplicate history read", async () => {
  const {wrapper} = wrap(); render(<DmsApprovalActionPanel documentId={1} authContext={auth}/>, {wrapper}); await screen.findByText("Approval Status");
  fireEvent.click(screen.getByRole("button", {name: "Show approval history"})); await screen.findByText("No approval history yet.");
  const next = pending<unknown>(); let request: unknown;
  mocks.read.mockImplementation((_path, criteria) => {if (criteria.mode === "state") {request = criteria; return next.promise;}
    return Promise.resolve({success: true, data: {criteria, rows: [], totalCount: 0}});
  });
  fireEvent.click(screen.getByRole("button", {name: "Refresh"})); await screen.findByText("Loading approval state...");
  expect(mocks.read.mock.calls.filter(c => c[1].mode === "history")).toHaveLength(1);
  await act(async () => next.resolve({success: true, data: {criteria: request, record}})); await screen.findByText("No approval history yet.");
  expect(mocks.read.mock.calls.filter(c => c[1].mode === "state")).toHaveLength(2);
  expect(mocks.read.mock.calls.filter(c => c[1].mode === "history")).toHaveLength(2);
});
it("an account change retires the old save; late success cannot clear or close the new draft", async () => {
  const next = pending<{success: boolean}>(); mocks.action.mockReturnValueOnce(next.promise); const changed = {...auth, profile: {...auth.profile!, id: 7, auth_user_id: "other"}};
  const closed = vi.fn(), success = vi.fn(); const props = {open: true, onOpenChange: closed, mode: "approve" as const, documentId: 1, approvalId: 3, onSuccess: success, canConfirm: true, isActionCurrent: () => true};
  const ui = render(<DmsApprovalActionDialog {...props} authContext={auth}/>);
  fireEvent.change(screen.getByLabelText(/Comment/), {target: {value: "Old draft"}}); fireEvent.click(screen.getByRole("button", {name: "Approve"}));
  ui.rerender(<DmsApprovalActionDialog {...props} authContext={changed}/>); fireEvent.change(screen.getByLabelText(/Comment/), {target: {value: "New draft"}});
  await act(async () => next.resolve({success: true})); expect(closed).not.toHaveBeenCalled(); expect(success).not.toHaveBeenCalled();
  expect((screen.getByLabelText(/Comment/) as HTMLTextAreaElement).value).toBe("New draft");
});
it("one same-tick double submission dispatches only one unchanged business action", async () => {
  const next = pending<{success: boolean}>(); mocks.action.mockReturnValueOnce(next.promise);
  render(<DmsApprovalActionDialog open authContext={auth} canConfirm isActionCurrent={() => true} onOpenChange={vi.fn()} mode="approve" documentId={1} approvalId={3} onSuccess={vi.fn()}/>);
  const button = screen.getByRole("button", {name: "Approve"}); act(() => {button.click(); button.click();});
  expect(mocks.action).toHaveBeenCalledTimes(1); await act(async () => next.resolve({success: false}));
});
it("a forbidden queue refresh retires its open action draft and prevents further dispatch", async () => {
  mocks.read.mockImplementation(async (_path, criteria) => ({success: true, data: {criteria, rows: [queueRow(1)], totalCount: 1}}));
  const {wrapper, client} = wrap(); render(<DmsApprovalsQueuePageClient authContext={auth} canAct isAdmin={false}/>, {wrapper}); await screen.findByText("SYN-1");
  // The lightweight tooltip mock renders the label immediately after its button.
  fireEvent.click(screen.getByText("Approve", {exact: true}).previousElementSibling!); fireEvent.change(screen.getByLabelText(/Comment/), {target: {value: "Private comment"}});
  mocks.read.mockRejectedValue(new ReadError("Denied", 403)); act(() => {void client.invalidateQueries({queryKey: ["dms", "approvals", "queue"]});});
  await screen.findByRole("alert"); expect(screen.queryByRole("dialog")).toBeNull(); expect(mocks.action).not.toHaveBeenCalled();
});
it.each(["panel", "queue"])("%s preserves a comment but blocks current and retained submissions while revalidation is pending", async source => {
  const {wrapper, client} = wrap();
  if (source === "panel") {render(<DmsApprovalActionPanel documentId={1} authContext={auth}/>, {wrapper}); await screen.findByText("Approval Status");
    fireEvent.click(screen.getByRole("button", {name: "Approve"}));
  } else {mocks.read.mockImplementation(async (_path, criteria) => ({success: true, data: {criteria, rows: [queueRow(1)], totalCount: 1}}));
    render(<DmsApprovalsQueuePageClient authContext={auth} canAct isAdmin={false}/>, {wrapper}); await screen.findByText("SYN-1"); fireEvent.click(screen.getByText("Approve", {exact: true}).previousElementSibling!);
  }
  fireEvent.change(screen.getByLabelText(/Comment/), {target: {value: "Retained comment"}}); const retained = mocks.submit;
  const pendingRead = pending<unknown>(); let criteria: unknown; mocks.read.mockImplementation((_path, input) => {criteria = input; return pendingRead.promise;});
  act(() => {void client.invalidateQueries({queryKey: source === "panel" ? ["dms", "approval-state", 1] : ["dms", "approvals", "queue"]});});
  await waitFor(() => expect(within(screen.getByRole("dialog")).getByRole("button", {name: "Approve"})).toHaveProperty("disabled", true));
  await act(async () => {retained?.();}); expect(mocks.action).not.toHaveBeenCalled(); expect((screen.getByLabelText(/Comment/) as HTMLTextAreaElement).value).toBe("Retained comment");
  await act(async () => pendingRead.resolve({success: true, data: source === "panel" ? {criteria, record} : {criteria, rows: [queueRow(1)], totalCount: 1}}));
  await waitFor(() => expect(within(screen.getByRole("dialog")).getByRole("button", {name: "Approve"})).toHaveProperty("disabled", false));
  expect((screen.getByLabelText(/Comment/) as HTMLTextAreaElement).value).toBe("Retained comment");
});
it.each(["panel", "queue"])("%s cannot submit a retained dialog after the request or action permission changes", async source => {
  const {wrapper, client} = wrap();
  if (source === "panel") {render(<DmsApprovalActionPanel documentId={1} authContext={auth}/>, {wrapper}); await screen.findByText("Approval Status");
    fireEvent.click(screen.getByRole("button", {name: "Approve"}));
  } else {mocks.read.mockImplementation(async (_path, criteria) => ({success: true, data: {criteria, rows: [queueRow(1)], totalCount: 1}}));
    render(<DmsApprovalsQueuePageClient authContext={auth} canAct isAdmin={false}/>, {wrapper}); await screen.findByText("SYN-1"); fireEvent.click(screen.getByText("Approve", {exact: true}).previousElementSibling!);
  }
  const retained = mocks.submit; fireEvent.change(screen.getByLabelText(/Comment/), {target: {value: "Preserve my notes"}});
  for (const changedRequest of [false, true]) {
    mocks.read.mockImplementation(async (_path, criteria) => ({success: true, data: source === "panel"
      ? {criteria, record: {...record, canApprove: changedRequest, currentApprovalId: changedRequest ? 999 : 3}}
      : {criteria, rows: [{...queueRow(1), canAct: changedRequest, currentApprovalId: changedRequest ? 999 : 1001}], totalCount: 1}}));
    await act(async () => {await client.invalidateQueries({queryKey: source === "panel" ? ["dms", "approval-state", 1] : ["dms", "approvals", "queue"]});});
    await act(async () => {retained?.();});
    // The retained callback is checked before the batched observer render;
    // the visible disabled state is then awaited separately.
    expect(mocks.action).not.toHaveBeenCalled();
    await waitFor(() => expect(within(screen.getByRole("dialog")).getByRole("button", {name: "Approve"})).toHaveProperty("disabled", true));
    expect((screen.getByLabelText(/Comment/) as HTMLTextAreaElement).value).toBe("Preserve my notes");
  }
});
it("a non-denial state failure retains notes but does not dispatch the stale approval", async () => {
  const {wrapper, client} = wrap(); render(<DmsApprovalActionPanel documentId={1} authContext={auth}/>, {wrapper}); await screen.findByText("Approval Status");
  fireEvent.click(screen.getByRole("button", {name: "Approve"})); const retained = mocks.submit;
  fireEvent.change(screen.getByLabelText(/Comment/), {target: {value: "Keep until recovery"}});
  mocks.read.mockRejectedValue(new ReadError("Unavailable", 400)); await act(async () => {await client.invalidateQueries({queryKey: ["dms", "approval-state", 1]});});
  await screen.findByText(/Approval details could not be loaded/); await act(async () => {retained?.();});
  expect(mocks.action).not.toHaveBeenCalled(); expect((screen.getByLabelText(/Comment/) as HTMLTextAreaElement).value).toBe("Keep until recovery");
});
it.each(["panel", "queue"])("%s recovers an open dialog through an in-dialog status refresh without losing notes or repeating the action", async source => {
  const {wrapper, client} = wrap();
  const response = (criteria: unknown, changed = false) => ({success: true, data: source === "panel"
    ? {criteria, record: {...record, currentApprovalId: changed ? 999 : 3}}
    : {criteria, rows: [{...queueRow(1), currentApprovalId: changed ? 999 : 1001}], totalCount: 1}});
  mocks.read.mockImplementation(async (_path, criteria) => response(criteria));
  if (source === "panel") {
    render(<DmsApprovalActionPanel documentId={1} authContext={auth}/>, {wrapper}); await screen.findByText("Approval Status");
    fireEvent.click(screen.getByRole("button", {name: "Approve"}));
  } else {
    render(<DmsApprovalsQueuePageClient authContext={auth} canAct isAdmin={false}/>, {wrapper}); await screen.findByText("SYN-1");
    fireEvent.click(screen.getByText("Approve", {exact: true}).previousElementSibling!);
  }
  fireEvent.change(screen.getByLabelText(/Comment/), {target: {value: "Preserve recovery notes"}});
  mocks.read.mockRejectedValue(new ReadError("Private unavailable details", 400));
  await act(async () => {await client.invalidateQueries({queryKey: source === "panel" ? ["dms", "approval-state", 1] : ["dms", "approvals", "queue"]});});
  await waitFor(() => expect(within(screen.getByRole("dialog")).getByRole("button", {name: "Approve"})).toHaveProperty("disabled", true));
  const dialog = within(screen.getByRole("dialog"));
  const retry = dialog.getByRole("button", {name: "Refresh approval status"});
  const next = pending<unknown>(); let criteria: unknown;
  mocks.read.mockClear().mockImplementation((_path, input) => {criteria = input; return next.promise;});
  act(() => {retry.click(); retry.click();});
  await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(retry).toHaveProperty("disabled", true));
  expect(dialog.getByRole("button", {name: "Approve"})).toHaveProperty("disabled", true);
  expect((screen.getByLabelText(/Comment/) as HTMLTextAreaElement).value).toBe("Preserve recovery notes");
  await act(async () => next.resolve(response(criteria)));
  await waitFor(() => expect(dialog.getByRole("button", {name: "Approve"})).toHaveProperty("disabled", false));
  expect((screen.getByLabelText(/Comment/) as HTMLTextAreaElement).value).toBe("Preserve recovery notes");
  expect(mocks.action).not.toHaveBeenCalled();
  // Refreshing a subsequently replaced request must not authorize this old dialog.
  mocks.read.mockImplementation(async (_path, input) => response(input, true));
  fireEvent.click(dialog.getByRole("button", {name: "Refresh approval status"}));
  await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(dialog.getByRole("button", {name: "Approve"})).toHaveProperty("disabled", true));
  expect((screen.getByLabelText(/Comment/) as HTMLTextAreaElement).value).toBe("Preserve recovery notes");
  expect(mocks.action).not.toHaveBeenCalled();
});
it.each(["pending", "disabled"])("a retained status refresh respects current %s admission without clearing notes", async state => {
  const refresh = vi.fn();
  const props = {open: true, authContext: auth, canConfirm: true, isActionCurrent: () => true,
    onRefreshStatus: refresh, onOpenChange: vi.fn(), mode: "approve" as const, documentId: 1, approvalId: 3, onSuccess: vi.fn()};
  const ui = render(<DmsApprovalActionDialog {...props}/>);
  fireEvent.change(screen.getByLabelText(/Comment/), {target: {value: "Retain status notes"}});
  const retainedRefresh = mocks.refresh, retainedSubmit = mocks.submit;
  expect(screen.getByRole("button", {name: "Refresh approval status"}).getAttribute("type")).toBe("button");
  ui.rerender(<DmsApprovalActionDialog {...props} statusRefreshing={state === "pending"} statusRefreshDisabled={state === "disabled"}/>);
  await act(async () => {retainedRefresh?.(); if (state === "pending") retainedSubmit?.();});
  expect(refresh).not.toHaveBeenCalled(); expect(mocks.action).not.toHaveBeenCalled();
  expect((screen.getByLabelText(/Comment/) as HTMLTextAreaElement).value).toBe("Retain status notes");
});
it("retired dialog status callbacks cannot refresh a replacement account", async () => {
  const first = vi.fn(), second = vi.fn();
  const props = {open: true, canConfirm: true, isActionCurrent: () => true, onOpenChange: vi.fn(), mode: "approve" as const,
    documentId: 1, approvalId: 3, onSuccess: vi.fn()};
  const ui = render(<DmsApprovalActionDialog {...props} authContext={auth} onRefreshStatus={first}/>);
  const retired = mocks.refresh;
  ui.rerender(<DmsApprovalActionDialog {...props} authContext={syntheticAuthContext(["dms.approvals.act"], {id: 7, auth_user_id: "replacement"})} onRefreshStatus={second}/>);
  await act(async () => {retired?.();});
  expect(first).not.toHaveBeenCalled(); expect(second).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", {name: "Refresh approval status"}));
  expect(second).toHaveBeenCalledTimes(1); expect(mocks.action).not.toHaveBeenCalled();
});
it("status refresh cannot race an in-flight business action and recovery does not repeat it", async () => {
  const refresh = vi.fn(), next = pending<{success: boolean}>(); mocks.action.mockReturnValueOnce(next.promise);
  render(<DmsApprovalActionDialog open authContext={auth} canConfirm isActionCurrent={() => true} onRefreshStatus={refresh}
    onOpenChange={vi.fn()} mode="approve" documentId={1} approvalId={3} onSuccess={vi.fn()}/>);
  const retained = mocks.refresh;
  fireEvent.click(screen.getByRole("button", {name: "Approve"}));
  await act(async () => {retained?.();}); expect(refresh).not.toHaveBeenCalled();
  expect(screen.getByRole("button", {name: "Refresh approval status"})).toHaveProperty("disabled", true);
  await act(async () => next.resolve({success: false}));
  fireEvent.click(screen.getByRole("button", {name: "Refresh approval status"}));
  expect(refresh).toHaveBeenCalledTimes(1); expect(mocks.action).toHaveBeenCalledTimes(1);
});
