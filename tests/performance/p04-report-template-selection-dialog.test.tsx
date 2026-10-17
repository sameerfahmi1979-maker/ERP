// @vitest-environment jsdom
import React from "react";
import {afterEach, expect, it, vi} from "vitest";
import {act, cleanup, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import type {AuthContext} from "@/lib/rbac/check";
const state = vi.hoisted(() => ({read: vi.fn(), choose: vi.fn(), close: vi.fn()}));
vi.mock("@/lib/reads/client", async () => ({...await vi.importActual("@/lib/reads/client"), readJson: state.read}));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({children}: React.PropsWithChildren) => <div role="dialog">{children}</div>, DialogContent: ({children}: React.PropsWithChildren) => <div>{children}</div>,
  DialogDescription: ({children}: React.PropsWithChildren) => <p>{children}</p>, DialogTitle: ({children}: React.PropsWithChildren) => <h2>{children}</h2>,
  DialogHeader: ({children}: React.PropsWithChildren) => <div>{children}</div>, DialogFooter: ({children}: React.PropsWithChildren) => <footer>{children}</footer>,
}));
vi.mock("@/components/ui/scroll-area", () => ({ScrollArea: ({children}: React.PropsWithChildren) => <div>{children}</div>}));
import {ReportTemplateSelectDialog} from "@/components/report-center/report-template-select-dialog";
import {ReadError} from "@/lib/reads/client";
import {reportTemplateSelectionCriteriaSchema} from "@/lib/reads/report-template-selection-schema";
const context = {profile: {id: 11, auth_user_id: "one"}, isAccountActive: true, accountStatus: "active", roleCodes: [], roleAssignments: [], permissionCodes: ["reports.view"]} as unknown as AuthContext;
const template = (id: number) => ({id, template_name: `Template ${id}`, template_code: `SYN_${id}`, template_type: "report", is_default: false, governance_status: "approved", visual_editor_engine: null,
  branding_profile_id: 3, branding_profile_name: "Branding", branding_profile_type: "company", company_name: "Synthetic", logo_url: null, owner_company_id: 1, selectable: true});
const response = (input: unknown) => {
  const criteria = reportTemplateSelectionCriteriaSchema.parse(input), start = (criteria.page - 1) * criteria.pageSize;
  return {success: true, data: {criteria, rows: Array.from({length: Math.min(25, Math.max(0, 30 - start))}, (_, i) => template(start + i + 1)), totalCount: 30, selected: criteria.selectedId ? template(criteria.selectedId) : null}};
};
const clients: QueryClient[] = [];
const confirmDisabled = () => (screen.getByRole("button", {name: "Use Template"}) as HTMLButtonElement).disabled;
const choice = (id: number) => {
  const button = screen.getByText(`Template ${id}`).closest("button");
  if (!button) throw Error("Template metadata must be inside its real choice button");
  return button;
};
function mount(selectedTemplateId?: number) {
  const client = new QueryClient({defaultOptions: {queries: {retry: false, retryDelay: 0}}}); clients.push(client);
  const props = {authContext: context, open: true, onOpenChange: state.close, onSelect: state.choose, ownerCompanyIds: [1], selectedTemplateId};
  const view = (p = props) => <QueryClientProvider client={client}><ReportTemplateSelectDialog {...p} /></QueryClientProvider>;
  return {...render(view()), client, props, view};
}
afterEach(() => {cleanup(); clients.splice(0).forEach(c => c.clear()); state.read.mockReset(); state.choose.mockReset(); state.close.mockReset();});
it("actual dialog performs complete paging, point-verifies selection then confirms only permitted metadata", async () => {
  state.read.mockImplementation(async (_r, p) => response(p)); mount();
  await screen.findByText("Template 1"); expect(confirmDisabled()).toBe(true);
  fireEvent.click(screen.getByRole("button", {name: "Next"})); await screen.findByText("Template 26");
  fireEvent.click(choice(26));
  await waitFor(() => expect(confirmDisabled()).toBe(false));
  fireEvent.click(screen.getByRole("button", {name: "Use Template"}));
  expect(state.choose).toHaveBeenCalledWith(26, template(26)); expect(state.close).toHaveBeenCalledWith(false);
  expect(state.read.mock.calls.at(-1)?.[1]).toMatchObject({page: 2, selectedId: 26, ownerCompanyIds: [1]});
});
it("retained inactive selected choice is labelled and disabled, not silently removed or newly offered", async () => {
  state.read.mockImplementation(async (_r, p) => {const r = response(p); return {...r, data: {...r.data, selected: {...template(900), selectable: false}}};}); mount(900);
  await screen.findByText("Template 900"); expect(choice(900).disabled).toBe(true); expect(choice(900).textContent).toContain("Unavailable for new output");
  expect(confirmDisabled()).toBe(true); fireEvent.click(screen.getByRole("button", {name: "Use Template"})); expect(state.choose).not.toHaveBeenCalled();
});
it("missing view/read failure displays unavailable with real retry, never no templates", async () => {
  state.read.mockRejectedValue(new ReadError("Unavailable", 503)); mount();
  await screen.findByRole("button", {name: "Retry templates"}); expect(screen.queryByText(/No active templates/)).toBeNull();
  expect(confirmDisabled()).toBe(true);
  state.read.mockImplementation(async (_r, p) => response(p)); fireEvent.click(screen.getByRole("button", {name: "Retry templates"}));
  await screen.findByText("Template 1");
});
it("search is literal/debounced, changing it removes stale selectable payload until new response", async () => {
  state.read.mockImplementation(async (_r, p) => response(p)); mount(1); await waitFor(() => expect(confirmDisabled()).toBe(false));
  fireEvent.change(screen.getByRole("textbox", {name: "Search report templates"}), {target: {value: " %_ "}});
  expect(confirmDisabled()).toBe(true);
  await waitFor(() => expect(state.read.mock.calls.at(-1)?.[1].search).toBe(" %_ "));
});
it("server denial removes selected metadata and disables all confirmation/retry", async () => {
  state.read.mockRejectedValue(new ReadError("Denied", 403)); mount(1); await screen.findByText("Your access to report templates could not be verified.");
  expect(screen.queryByText("Template 1")).toBeNull(); expect(screen.queryByRole("button", {name: "Retry templates"})).toBeNull();
  expect(confirmDisabled()).toBe(true);
});
it("closing the actual dialog aborts pending metadata; late response does not select or reopen", async () => {
  let done: ((value: unknown) => void) | undefined, signal: AbortSignal | undefined;
  state.read.mockImplementation((_r, _p, s) => new Promise(resolve => {done = resolve; signal = s;})); const h = mount(1); await waitFor(() => expect(done).toBeDefined());
  h.rerender(h.view({...h.props, open: false})); expect(signal?.aborted).toBe(true);
  await act(async () => done!(response({selectedId: 1, ownerCompanyIds: [1]}))); expect(screen.queryByRole("dialog")).toBeNull(); expect(state.choose).not.toHaveBeenCalled(); expect(h.client.getQueryCache().getAll()).toHaveLength(0);
});
it("principal switch retires old pending response and old selected value", async () => {
  let done: ((value: unknown) => void) | undefined;
  state.read.mockImplementationOnce(() => new Promise(resolve => {done = resolve;})).mockImplementation(async (_r, p) => response(p)); const h = mount(); await waitFor(() => expect(done).toBeDefined());
  h.rerender(h.view({...h.props, authContext: {...context, profile: {...context.profile!, id: 12, auth_user_id: "two"}}}));
  await screen.findByText("Template 1"); await act(async () => done!(response({selectedId: 900, ownerCompanyIds: [1]})));
  expect(screen.queryByText("Template 900")).toBeNull(); expect(confirmDisabled()).toBe(true); expect(state.choose).not.toHaveBeenCalled();
});
it("inaccessible selected ID has explicit non-enumerating status and cannot be confirmed", async () => {
  state.read.mockImplementation(async (_r, p) => {const r = response(p); return {...r, data: {...r.data, selected: null}};}); mount(999);
  await screen.findByText("The previous template is unavailable or no longer authorized. Choose another template."); expect(confirmDisabled()).toBe(true);
});
