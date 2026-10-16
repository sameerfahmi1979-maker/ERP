// @vitest-environment jsdom
// Mounted finance UI and real F04/F06 sessions. Only boundary actions/lookups are doubled.
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { AuthContext } from "@/lib/rbac/check";
import { createWorkspaceDraftStore } from "@/lib/workspace/workspace-draft-store";
import type { WorkspaceDraftStoreApi } from "@/lib/workspace/workspace-draft-types";

const m = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(), success: vi.fn(), owner: "finance-tab", store: null as unknown as WorkspaceDraftStoreApi, dispatch: vi.fn(), paymentError: false, busy: vi.fn() }));
vi.mock("@/hooks/use-workspace-form-owner", () => ({ useWorkspaceFormOwner: () => ({ id: m.owner }) }));
vi.mock("@/components/workspace/workspace-draft-provider", () => ({ useWorkspaceDraftStoreContext: () => m.store }));
vi.mock("@/components/workspace/workspace-provider", () => ({ useWorkspaceContext: () => ({ dispatch: m.dispatch }) }));
vi.mock("@/server/actions/master-data/party-finance-profiles", () => ({ getPartyFinanceProfile: m.read, upsertPartyFinanceProfile: m.save }));
vi.mock("@/server/actions/master-data/parties", () => ({ getPaymentMethods: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: m.success } }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: [], error: m.paymentError ? new Error("Private lookup failure") : null }) }));
vi.mock("@/components/ui/button", () => ({ Button: ({ children, size, variant, ...props }: { children: ReactNode; size?: string; variant?: string }) => { void size; void variant; return <button {...props}>{children}</button>; } }));
vi.mock("@/components/ui/input", () => ({ Input: (props: object) => <input {...props} /> }));
vi.mock("@/components/ui/textarea", () => ({ Textarea: (props: object) => <textarea {...props} /> }));
vi.mock("@/components/ui/label", () => ({ Label: (props: object) => <label {...props} /> }));
vi.mock("@/components/ui/switch", () => ({ Switch: ({ checked, onCheckedChange, ...props }: { checked: boolean; onCheckedChange: (value: boolean) => void }) => <input {...props} type="checkbox" checked={checked} onChange={event => onCheckedChange(event.target.checked)} /> }));
type Choice = { value: number | null; onValueChange: (value: number | null) => void; disabled?: boolean; ariaLabel: string };
vi.mock("@/components/erp/finance-basics", () => { const Select = ({ value, onValueChange, disabled, ariaLabel }: Choice) => <input aria-label={ariaLabel} value={value ?? ""} disabled={disabled} onChange={event => onValueChange(event.target.value ? Number(event.target.value) : null)} />; return { CurrencySelect: Select, PaymentTermSelect: Select }; });
vi.mock("@/components/erp/combobox", () => ({ ERPCombobox: ({ value, options, ariaLabel, disabled, onValueChange }: Choice & { options: { value: number; label: string }[] }) => <select aria-label={ariaLabel} disabled={disabled} value={value ?? ""} onChange={event => onValueChange(event.target.value ? Number(event.target.value) : null)}><option value="">Choose</option>{options.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</select> }));
import { PartyFinanceProfileEditor } from "@/features/master-data/parties/party-finance-profile-editor";
import { usePartyFinanceEditor } from "@/features/master-data/parties/use-party-finance-editor";

const permissions = ["master_data.parties.view", "master_data.parties.edit"];
const auth = (codes = permissions, id = 7) => ({ profile: { id }, isAccountActive: true, globalPermissionCodes: codes, roleAssignments: [], permissionCodes: codes, roleCodes: [] }) as unknown as AuthContext;
// Match the complete server projection, including audit metadata. An abbreviated
// fixture previously concealed rejection of legitimate existing profiles.
const profile = (extra: object = {}) => ({
  id: 81, party_id: 4, workspace_revision: 3, default_currency_id: 1,
  default_payment_term_id: 2, default_payment_method_id: 3, credit_limit: 0,
  credit_currency_id: 1, finance_hold: false, finance_hold_reason: null,
  finance_hold_by: null, finance_hold_at: null, finance_remarks: "Saved note",
  created_at: "2026-10-05T00:00:00.000000+00:00",
  updated_at: "2026-10-05T00:00:00.000000+00:00", ...extra,
});
const receipt = (extra: object = {}) => ({ success: true, data: { id: 81, revision: "4", changed: true, replayed: false, ...extra } });
const ui = (context = auth(), partyId = 4, disabled = false) => <PartyFinanceProfileEditor partyId={partyId} authContext={context} disabled={disabled} onBusyChange={m.busy} />;
const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const change = (label: string, value: string) => fireEvent.change(field(label), { target: { value } });
const loaded = () => waitFor(() => expect(screen.getByLabelText("Credit Limit")).toBeTruthy());
const save = () => fireEvent.click(screen.getByRole("button", { name: "Save Finance Profile" }));
const retry = () => fireEvent.click(screen.getByRole("button", { name: "Retry Finance Save" }));
const draftKey = () => `draft:tab:${m.owner}:party-finance:7:4`;
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => { vi.clearAllMocks(); m.store = createWorkspaceDraftStore(); m.owner = "finance-tab"; m.paymentError = false; m.read.mockResolvedValue({ success: true, data: profile() }); m.save.mockResolvedValue(receipt()); vi.spyOn(window, "confirm").mockReturnValue(true); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("uses finance view+edit without tax permission and retains zero/false/nullable selections", async () => {
  render(ui()); await loaded(); expect(field("Credit Limit").value).toBe("0");
  save(); await waitFor(() => expect(m.success).toHaveBeenCalledWith("Finance profile saved"));
  expect(m.save.mock.calls[0]).toEqual([expect.objectContaining({ party_id: 4, credit_limit: 0, finance_hold: false, default_currency_id: 1, default_payment_method_id: 3 }), { operationId: expect.stringMatching(/^[0-9a-f-]{36}$/), revision: "3" }]);
  change("Credit Limit", ""); change("Default Currency", ""); save();
  await waitFor(() => expect(m.save).toHaveBeenCalledTimes(2)); expect(m.save.mock.calls[1][0]).toMatchObject({ credit_limit: null, default_currency_id: null }); expect(m.save.mock.calls[1][1].revision).toBe("4");
});
it.each([
  ["reader", ["master_data.parties.view"], false],
  ["tax-only reader", ["master_data.parties.view", "master_data.parties.manage_tax"], false],
  ["parent read-only", permissions, true],
])("%s sees stored values but no mutations", async (_name, codes, disabled) => { render(ui(auth(codes as string[]), 4, disabled as boolean)); await loaded(); expect(field("Credit Limit").disabled).toBe(true); expect(screen.queryByRole("button", { name: "Save Finance Profile" })).toBeNull(); expect(m.save).not.toHaveBeenCalled(); });
it.each([[], ["master_data.parties.edit"], ["master_data.parties.manage_tax"]])("requires view authority before loading (%j)", async (...codes) => { render(ui(auth(codes as string[]))); expect(m.read).not.toHaveBeenCalled(); expect(screen.queryByLabelText("Credit Limit")).toBeNull(); });
it("does not widen a scoped assignment into a global finance grant", () => { render(ui({ ...auth([]), permissionCodes: permissions, roleAssignments: [{ ownerCompanyId: 2, branchId: null, roleId: 1, roleCode: "company-manager", permissionCodes: permissions }] })); expect(m.read).not.toHaveBeenCalled(); expect(screen.queryByLabelText("Credit Limit")).toBeNull(); });
it("cannot save until its first authoritative read completes", async () => { const read = deferred<unknown>(); m.read.mockReturnValue(read.promise); render(ui()); expect(screen.queryByRole("button", { name: "Save Finance Profile" })).toBeNull(); await act(async () => read.resolve({ success: true, data: profile() })); await loaded(); });
it.each([{ success: false, error: "PRIVATE SQL" }, { success: true }, { success: true, data: profile({ party_id: 999 }) }, { success: true, data: profile({ workspace_revision: undefined }) }])("fails closed on failed/malformed first read: %j", async response => { m.read.mockResolvedValue(response); render(ui()); await screen.findByText("Finance details could not be loaded. Try again before making changes."); expect(screen.queryByLabelText("Credit Limit")).toBeNull(); expect(document.body.textContent).not.toContain("PRIVATE"); });
it("allows explicit retry after a read failure", async () => { m.read.mockRejectedValueOnce(new Error("Private")).mockResolvedValue({ success: true, data: null }); render(ui()); await screen.findByText("Try loading finance again"); fireEvent.click(screen.getByText("Try loading finance again")); await loaded(); save(); await waitFor(() => expect(m.save).toHaveBeenCalledOnce()); expect(m.save.mock.calls[0][1].revision).toBeNull(); });
it("creates once then uses the confirmed revision for subsequent saves", async () => { m.read.mockResolvedValue({ success: true, data: null }); render(ui()); await loaded(); save(); await waitFor(() => expect(m.success).toHaveBeenCalledOnce()); change("Finance Remarks", "Second"); save(); await waitFor(() => expect(m.save).toHaveBeenCalledTimes(2)); expect(m.save.mock.calls[0][1].revision).toBeNull(); expect(m.save.mock.calls[1][1].revision).toBe("4"); expect(m.save.mock.calls[1][1].operationId).not.toBe(m.save.mock.calls[0][1].operationId); });
it("coalesces rapid saves and disables edits while awaiting a result", async () => { const pending = deferred<unknown>(); m.save.mockReturnValue(pending.promise); render(ui()); await loaded(); save(); fireEvent.click(screen.getByRole("button", { name: "Saving..." })); expect(m.save).toHaveBeenCalledOnce(); expect(field("Finance Remarks").disabled).toBe(true); await act(async () => pending.resolve(receipt())); });
it.each(["throw", "uncertain", "malformed"])("%s result retains immutable request, even after denial, until confirmed", async kind => {
  if (kind === "throw") m.save.mockRejectedValueOnce(new Error("Lost")); else m.save.mockResolvedValueOnce(kind === "uncertain" ? { success: false, uncertain: true } : { success: true, data: { id: 999 } });
  m.save.mockResolvedValueOnce({ success: false, error: "Permission denied" }).mockResolvedValueOnce(receipt({ replayed: true }));
  render(ui()); await loaded(); change("Finance Remarks", "Exact request"); save(); await screen.findByRole("button", { name: "Retry Finance Save" });
  change("Finance Remarks", "Hidden edit"); expect(field("Finance Remarks").value).toBe("Exact request");
  expect(screen.getByRole("button", { name: "Reload saved finance profile" }).hasAttribute("disabled")).toBe(true);
  retry(); await screen.findByText(/earlier finance save is still unconfirmed/); retry(); await waitFor(() => expect(m.success).toHaveBeenCalledOnce());
  expect(m.save.mock.calls[1]).toEqual(m.save.mock.calls[0]); expect(m.save.mock.calls[2]).toEqual(m.save.mock.calls[0]); expect(field("Finance Remarks").value).toBe("Exact request"); expect(m.store.getDraft(draftKey())).toBeUndefined();
});
it.each([false, true])("remounts an uncertain %s create/update with exact payload/operation despite fresh saved row", async creating => {
  if (creating) m.read.mockResolvedValueOnce({ success: true, data: null });
  m.save.mockResolvedValueOnce({ success: false, uncertain: true }).mockResolvedValueOnce(receipt({ replayed: true }));
  const first = render(ui()); await loaded(); change("Finance Remarks", "Retained"); save(); await screen.findByRole("button", { name: "Retry Finance Save" }); first.unmount();
  m.read.mockResolvedValue({ success: true, data: profile({ workspace_revision: 4, finance_remarks: "Retained" }) }); render(ui()); await loaded(); retry(); await waitFor(() => expect(m.success).toHaveBeenCalledOnce()); expect(m.save.mock.calls[1]).toEqual(m.save.mock.calls[0]);
});
it("unmount during save cannot accept the late result and remount recovers pending request", async () => {
  const pending = deferred<unknown>(); m.save.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(receipt({ replayed: true }));
  const first = render(ui()); await loaded(); change("Finance Remarks", "Retained"); save(); first.unmount(); await act(async () => pending.resolve(receipt())); expect(m.success).not.toHaveBeenCalled(); expect(m.store.getDraft(draftKey())).toBeDefined();
  render(ui()); await loaded(); retry(); await waitFor(() => expect(m.success).toHaveBeenCalledOnce()); expect(m.save.mock.calls[1]).toEqual(m.save.mock.calls[0]);
});
it.each(["account", "tab", "record", "provider", "revocation"])("%s switch suppresses stale save completion and never replays the old owner payload", async kind => {
  const pending = deferred<unknown>(); m.save.mockReturnValueOnce(pending.promise); const mounted = render(ui()); await loaded(); change("Finance Remarks", "Old owner draft"); save();
  let context = auth(), partyId = 4;
  if (kind === "account") context = auth(permissions, 8);
  if (kind === "tab") m.owner = "new-tab";
  if (kind === "record") { partyId = 5; m.read.mockResolvedValue({ success: true, data: profile({ party_id: 5 }) }); }
  if (kind === "provider") m.store = createWorkspaceDraftStore();
  if (kind === "revocation") context = auth([]);
  mounted.rerender(ui(context, partyId)); await act(async () => pending.resolve(receipt())); expect(m.success).not.toHaveBeenCalled();
  if (kind === "revocation") expect(screen.queryByLabelText("Finance Remarks")).toBeNull(); else { await loaded(); expect(field("Finance Remarks").value).toBe("Saved note"); expect(screen.queryByRole("button", { name: "Retry Finance Save" })).toBeNull(); }
});
it("does not accept a stale first-load response after account change", async () => { const pending = deferred<unknown>(); m.read.mockReturnValueOnce(pending.promise).mockResolvedValueOnce({ success: true, data: profile({ finance_remarks: "New owner" }) }); const mounted = render(ui()); mounted.rerender(ui(auth(permissions, 8))); await loaded(); await act(async () => pending.resolve({ success: true, data: profile({ finance_remarks: "Old owner" }) })); expect(field("Finance Remarks").value).toBe("New owner"); });
it("restores unsaved memory-only fields and warns before browser reload", async () => { const local = vi.spyOn(Storage.prototype, "setItem"); const first = render(ui()); await loaded(); change("Credit Limit", "0"); change("Finance Remarks", "Memory draft"); const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); expect(event.defaultPrevented).toBe(true); first.unmount(); render(ui()); await loaded(); expect(field("Finance Remarks").value).toBe("Memory draft"); expect(local).not.toHaveBeenCalled(); });
it.each(["json", "principal", "owner", "party", "identity", "unknown", "save-json", "payload-json"])("malformed %s recovery fails visibly without discarding pending bytes", async kind => {
  m.save.mockResolvedValueOnce({ success: false, uncertain: true }); const first = render(ui()); await loaded(); change("Finance Remarks", "Keep"); save(); await screen.findByRole("button", { name: "Retry Finance Save" }); first.unmount();
  const snapshot = JSON.parse(m.store.getDraft(draftKey())!.finance); const formId = `party-finance:7:4:${snapshot.sessionId}`;
  if (kind === "save-json" || kind === "payload-json") m.store.setViewState(`draft:tab:${m.owner}:${formId}:${kind === "save-json" ? "save" : "administration-payload"}`, "{broken");
  else { if (kind === "principal") snapshot.principalId = 8; if (kind === "owner") snapshot.ownerId = "other-tab"; if (kind === "party") snapshot.partyId = 5; if (kind === "identity") snapshot.openingId = 999; if (kind === "unknown") snapshot.fields.password = "Never restore"; m.store.setDraft(draftKey(), { finance: kind === "json" ? "{broken" : JSON.stringify(snapshot) }); }
  const saved = m.store.getDraft(draftKey()); render(ui()); await loaded(); expect(screen.getByRole("alert").textContent).toMatch(/could not be verified/); expect(screen.getByRole("button", { name: /Finance (?:Profile|Save)/ }).hasAttribute("disabled")).toBe(true); expect(m.save).toHaveBeenCalledOnce(); expect(m.store.getDraft(draftKey())).toEqual(saved);
});
it("known rejection retains editable fields but permits explicit fresh-revision reload", async () => { m.save.mockResolvedValueOnce({ success: false, error: "Conflict" }); render(ui()); await loaded(); change("Finance Remarks", "Draft"); save(); await screen.findByText(/profile was not saved/); expect(field("Finance Remarks").disabled).toBe(false); m.read.mockResolvedValue({ success: true, data: profile({ workspace_revision: 9 }) }); fireEvent.click(screen.getByRole("button", { name: "Reload saved finance profile" })); await waitFor(() => expect(field("Finance Remarks").value).toBe("Saved note")); save(); await waitFor(() => expect(m.save).toHaveBeenCalledTimes(2)); expect(m.save.mock.calls[1][1].revision).toBe("9"); expect(m.save.mock.calls[1][1].operationId).not.toBe(m.save.mock.calls[0][1].operationId); });
it("no-op confirms the save without marking any external parent draft clean", async () => { m.save.mockResolvedValue(receipt({ changed: false, revision: "3" })); render(ui()); await loaded(); save(); await waitFor(() => expect(m.success).toHaveBeenCalledWith("No changes to save")); expect(m.dispatch).not.toHaveBeenCalled(); expect(m.store.getDraft(draftKey())).toBeUndefined(); expect(m.busy).toHaveBeenLastCalledWith(false); });
it("payment lookup failure retains known ID and displays a safe visible warning", async () => { m.paymentError = true; render(ui()); await loaded(); expect(field("Default Payment Method").value).toBe("3"); expect(screen.getByText(/saved selection has been retained/)).toBeTruthy(); save(); await waitFor(() => expect(m.save).toHaveBeenCalledOnce()); expect(m.save.mock.calls[0][0].default_payment_method_id).toBe(3); expect(document.body.textContent).not.toContain("Private lookup"); });
it("valid receipt for a different existing profile remains uncertain", async () => { m.save.mockResolvedValueOnce(receipt({ id: 999 })); render(ui()); await loaded(); save(); await screen.findByRole("button", { name: "Retry Finance Save" }); expect(m.success).not.toHaveBeenCalled(); expect(m.store.getDraft(draftKey())).toBeDefined(); });
it("a revoked editor cannot retry until a fresh authorized read, then retains the earlier exact request", async () => { m.save.mockResolvedValueOnce({ success: false, uncertain: true }); const mounted = render(ui()); await loaded(); change("Finance Remarks", "Earlier request"); save(); await screen.findByRole("button", { name: "Retry Finance Save" }); mounted.rerender(ui(auth([]))); expect(screen.queryByRole("button", { name: "Retry Finance Save" })).toBeNull(); mounted.rerender(ui()); await loaded(); retry(); await waitFor(() => expect(m.success).toHaveBeenCalledOnce()); expect(m.read).toHaveBeenCalledTimes(2); expect(m.save.mock.calls[1]).toEqual(m.save.mock.calls[0]); });
it("known rejection can start a deliberate new operation without rebasing the opening revision", async () => { m.save.mockResolvedValueOnce({ success: false, error: "Rejected" }); render(ui()); await loaded(); save(); await screen.findByText(/profile was not saved/); change("Finance Remarks", "Corrected draft"); save(); await waitFor(() => expect(m.save).toHaveBeenCalledTimes(2)); expect(m.save.mock.calls[1][1].revision).toBe("3"); expect(m.save.mock.calls[1][1].operationId).not.toBe(m.save.mock.calls[0][1].operationId); expect(m.save.mock.calls[1][0].finance_remarks).toBe("Corrected draft"); });
it.each(["-1", "1.12345", "100000000000000"])("rejects invalid credit limit %s without a write", async value => { render(ui()); await loaded(); change("Credit Limit", value); save(); expect(m.save).not.toHaveBeenCalled(); });
it("retains a zero with four-decimal support and requires a nonblank hold reason", async () => { render(ui()); await loaded(); change("Credit Limit", "0.1234"); fireEvent.click(field("Finance Hold")); change("Finance Hold Reason", "   "); save(); expect(m.save).not.toHaveBeenCalled(); change("Finance Hold Reason", "Reviewed hold"); save(); await waitFor(() => expect(m.save).toHaveBeenCalledOnce()); expect(m.save.mock.calls[0][0]).toMatchObject({ credit_limit: 0.1234, finance_hold: true, finance_hold_reason: "Reviewed hold" }); });

it("a preparation failure from an orphaned restored operation is handled visibly without overwriting it", async () => {
  m.save.mockResolvedValueOnce({ success: false, uncertain: true });
  const first = render(ui()); await loaded(); change("Finance Remarks", "Original request"); save(); await screen.findByRole("button", { name: "Retry Finance Save" }); first.unmount();
  const snapshot = JSON.parse(m.store.getDraft(draftKey())!.finance);
  const prefix = `draft:tab:${m.owner}:party-finance:7:4:${snapshot.sessionId}`;
  const retainedSave = m.store.getViewState(`${prefix}:save`);
  // Simulate a partially retained adapter snapshot: the underlying operation is
  // valid, but its companion immutable payload was lost before remount.
  m.store.setViewState(`${prefix}:administration-payload`, "null");
  const hook = renderHook(() => usePartyFinanceEditor({ partyId: 4, principalId: 7, profile: profile(), canEdit: true, onReload: vi.fn() }));
  act(() => hook.result.current.update("finance_remarks", "Changed after recovery"));
  await act(async () => { await expect(hook.result.current.save()).resolves.toBeUndefined(); });
  expect(hook.result.current.error).toMatch(/could not be verified/);
  expect(hook.result.current.blocked).toBe(true);
  expect(m.save).toHaveBeenCalledOnce();
  expect(m.store.getViewState(`${prefix}:save`)).toBe(retainedSave);
});

it.each(["notification", "draft cleanup", "session acceptance"])("%s failure after a valid receipt cannot turn a confirmed transaction into an uncertain retry", async failure => {
  render(ui()); await loaded(); change("Finance Remarks", "Confirmed entries");
  if (failure === "notification") m.success.mockImplementationOnce(() => { throw new Error("PRIVATE notice failure"); });
  if (failure === "draft cleanup") {
    const clear = m.store.clearDraft.bind(m.store);
    vi.spyOn(m.store, "clearDraft").mockImplementationOnce(key => { clear(key); throw new Error("PRIVATE draft listener failure"); });
  }
  if (failure === "session acceptance") {
    const write = m.store.setViewState.bind(m.store);
    vi.spyOn(m.store, "setViewState").mockImplementation((key, value) => {
      write(key, value);
      if (key.endsWith(":administration-payload") && value === "null") throw new Error("PRIVATE acceptance persistence failure");
    });
  }
  save(); await screen.findByText(/Finance profile saved, but/);
  expect(screen.queryByRole("button", { name: "Retry Finance Save" })).toBeNull();
  expect(screen.getByRole("button", { name: "Save Finance Profile" }).hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("button", { name: "Reload saved finance profile" }).hasAttribute("disabled")).toBe(false);
  expect(document.body.textContent).not.toContain("PRIVATE");
  expect(m.save).toHaveBeenCalledOnce();
  m.read.mockResolvedValue({ success: true, data: profile({ workspace_revision: 4, finance_remarks: "Confirmed entries" }) });
  fireEvent.click(screen.getByRole("button", { name: "Reload saved finance profile" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Save Finance Profile" }).hasAttribute("disabled")).toBe(false));
  expect(field("Finance Remarks").value).toBe("Confirmed entries");
  expect(m.save).toHaveBeenCalledOnce();
});

it.each([false, true])("confirmed %s create/update then edit/remount keeps the receipt identity and revision, not the opening snapshot or refreshed revision", async creating => {
  if (creating) m.read.mockResolvedValueOnce({ success: true, data: null });
  const first = render(ui()); await loaded(); change("Finance Remarks", "First save"); save(); await waitFor(() => expect(m.success).toHaveBeenCalledOnce());
  change("Finance Remarks", "Next unsaved draft"); first.unmount();
  m.read.mockResolvedValue({ success: true, data: profile({ workspace_revision: 9, finance_remarks: "Another editor's later change" }) });
  render(ui()); await loaded(); expect(field("Finance Remarks").value).toBe("Next unsaved draft"); save();
  await waitFor(() => expect(m.save).toHaveBeenCalledTimes(2));
  expect(m.save.mock.calls[1][1]).toEqual({ operationId: expect.any(String), revision: "4" });
  expect(m.save.mock.calls[1][1].operationId).not.toBe(m.save.mock.calls[0][1].operationId);
  expect(m.save.mock.calls[1][0].finance_remarks).toBe("Next unsaved draft");
  await waitFor(() => expect(m.success).toHaveBeenCalledTimes(2));
});
