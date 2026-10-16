// @vitest-environment jsdom
// Real mounted editor/read parser/F04 save session; synthetic action responses.
// Lookup controls are bounded ports; no server action/runtime module is imported.
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AuthContext } from "@/lib/rbac/check";
import { createWorkspaceDraftStore } from "@/lib/workspace/workspace-draft-store";
import type { WorkspaceDraftStoreApi } from "@/lib/workspace/workspace-draft-types";

const m = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(), paymentMethods: vi.fn(), success: vi.fn(), dispatch: vi.fn(), store: null as unknown as WorkspaceDraftStoreApi }));
vi.mock("@/server/actions/master-data/party-finance-profiles", () => ({ getPartyFinanceProfile: m.read, upsertPartyFinanceProfile: m.save }));
vi.mock("@/server/actions/master-data/parties", () => ({ getPaymentMethods: m.paymentMethods }));
vi.mock("@/hooks/use-workspace-form-owner", () => ({ useWorkspaceFormOwner: () => ({ id: "finance-full-read-tab" }) }));
vi.mock("@/components/workspace/workspace-draft-provider", () => ({ useWorkspaceDraftStoreContext: () => m.store }));
vi.mock("@/components/workspace/workspace-provider", () => ({ useWorkspaceContext: () => ({ dispatch: m.dispatch }) }));
vi.mock("sonner", () => ({ toast: { success: m.success } }));
type LookupPort = { value: number | null; disabled?: boolean; ariaLabel: string; onValueChange: (value: number | null) => void };
vi.mock("@/components/erp/finance-basics", () => {
  const Select = ({ value, disabled, ariaLabel, onValueChange }: LookupPort) => <input aria-label={ariaLabel} value={value ?? ""} disabled={disabled} onChange={event => onValueChange(event.target.value ? Number(event.target.value) : null)} />;
  return { CurrencySelect: Select, PaymentTermSelect: Select };
});
import { PartyFinanceProfileEditor } from "@/features/master-data/parties/party-finance-profile-editor";

const metadata = ["finance_hold_by", "finance_hold_at", "created_at", "updated_at"];
const writable = ["party_id", "default_currency_id", "default_payment_term_id", "default_payment_method_id", "credit_limit", "credit_currency_id", "finance_hold", "finance_hold_reason", "finance_remarks"];
const row = (held = false) => ({
  id: 81, party_id: 4, workspace_revision: 3,
  default_currency_id: 1, default_payment_term_id: 2, default_payment_method_id: 3,
  credit_limit: 0, credit_currency_id: 1, finance_hold: held,
  finance_hold_reason: held ? "Reviewed synthetic hold" : null,
  finance_hold_by: held ? 7 : null,
  finance_hold_at: held ? "2026-10-05T08:01:02.123456+04:00" : null,
  finance_remarks: "Full saved finance row",
  created_at: "2026-10-05T04:00:00.123456+00:00",
  updated_at: "2026-10-05T08:01:02.123456+04:00",
});
const auth = (edit = true) => {
  const codes = ["master_data.parties.view", ...(edit ? ["master_data.parties.edit"] : [])];
  return { profile: { id: 7 }, isAccountActive: true, globalPermissionCodes: codes, permissionCodes: codes, roleAssignments: [], roleCodes: [] } as unknown as AuthContext;
};
const receipt = (changed = true, replayed = false) => ({ success: true, data: { id: 81, revision: changed ? "4" : "3", changed, replayed } });
let client: QueryClient;
const mount = (edit = true) => render(<QueryClientProvider client={client}><PartyFinanceProfileEditor partyId={4} authContext={auth(edit)} /></QueryClientProvider>);
const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const loaded = () => screen.findByLabelText("Finance Remarks");
const clickSave = () => fireEvent.click(screen.getByRole("button", { name: "Save Finance Profile" }));
function assertPayload(call: unknown[]) {
  const [payload, contract] = call as [Record<string, unknown>, Record<string, unknown>];
  expect(Object.keys(payload).sort()).toEqual([...writable].sort());
  for (const key of metadata) expect(payload).not.toHaveProperty(key);
  expect(payload).toMatchObject({ party_id: 4, credit_limit: 0, finance_hold: false, finance_hold_reason: null, default_currency_id: 1, default_payment_term_id: 2, default_payment_method_id: 3 });
  expect(contract).toEqual({ operationId: expect.stringMatching(/^[0-9a-f-]{36}$/), revision: "3" });
}

beforeEach(() => {
  vi.resetAllMocks();
  m.store = createWorkspaceDraftStore();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  m.read.mockResolvedValue({ success: true, data: row() });
  m.paymentMethods.mockResolvedValue({ success: true, data: [{ id: 3, name_en: "Synthetic saved method" }] });
  m.save.mockResolvedValue(receipt());
});
afterEach(() => { cleanup(); client.clear(); vi.restoreAllMocks(); });

it("uses exactly the complete 15-field existing-row server projection", () => {
  const source = readFileSync("src/server/actions/master-data/party-finance-profiles.ts", "utf8");
  const projection = source.match(/const profileFields = "([^"]+)";/)?.[1]?.split(",");
  expect(projection).toHaveLength(15);
  expect(Object.keys(row()).sort()).toEqual(projection!.sort());
  expect(Object.keys(row(true)).sort()).toEqual(projection!.sort());
});

it.each([false, true])("mounts the full saved row, including legitimate held=%s metadata", async held => {
  const saved = row(held), before = structuredClone(saved);
  m.read.mockResolvedValue({ success: true, data: saved });
  mount(); await loaded();
  expect(field("Credit Limit").value).toBe("0");
  expect(field("Default Currency").value).toBe("1");
  expect(field("Default Payment Term").value).toBe("2");
  expect(field("Finance Remarks").value).toBe("Full saved finance row");
  expect(screen.getByRole("switch", { name: "Finance Hold" }).getAttribute("aria-checked")).toBe(String(held));
  if (held) expect(field("Finance Hold Reason").value).toBe("Reviewed synthetic hold");
  else expect(screen.queryByLabelText("Finance Hold Reason")).toBeNull();
  expect(m.read).toHaveBeenCalledExactlyOnceWith(4);
  expect(m.save).not.toHaveBeenCalled();
  expect(saved).toEqual(before);
});

it("recovers a failed first read only after explicit Retry returns the full saved row", async () => {
  m.read.mockRejectedValueOnce(new Error("PRIVATE transport detail")).mockResolvedValueOnce({ success: true, data: row() });
  mount();
  await screen.findByText("Finance details could not be loaded. Try again before making changes.");
  expect(screen.queryByLabelText("Finance Remarks")).toBeNull();
  expect(screen.queryByRole("button", { name: "Save Finance Profile" })).toBeNull();
  expect(document.body.textContent).not.toContain("PRIVATE");
  expect(m.read).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Try loading finance again" }));
  await loaded();
  expect(m.read).toHaveBeenCalledTimes(2);
  expect(field("Finance Remarks").value).toBe("Full saved finance row");
  expect(field("Credit Limit").value).toBe("0");
  expect(screen.queryByText("Finance details could not be loaded. Try again before making changes.")).toBeNull();
  expect(m.save).not.toHaveBeenCalled();
});

it("renders full saved values for a reader without exposing a mutation control", async () => {
  m.read.mockResolvedValue({ success: true, data: row(true) });
  mount(false); await loaded();
  for (const label of ["Default Currency", "Default Payment Term", "Credit Limit", "Credit Currency", "Finance Hold Reason", "Finance Remarks"]) expect(field(label).disabled).toBe(true);
  expect(field("Finance Remarks").value).toBe("Full saved finance row");
  expect(field("Finance Hold Reason").value).toBe("Reviewed synthetic hold");
  // Base UI exposes a non-native switch with aria-disabled; its visible root
  // is not a native button and therefore does not have a disabled attribute.
  const hold = screen.getByRole("switch", { name: "Finance Hold" });
  expect(hold.getAttribute("aria-disabled")).toBe("true");
  fireEvent.click(hold);
  fireEvent.keyDown(hold, { key: " " });
  fireEvent.keyUp(hold, { key: " " });
  expect(hold.getAttribute("aria-checked")).toBe("true");
  expect(screen.queryByRole("button", { name: "Save Finance Profile" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Reload saved finance profile" })).toBeNull();
  fireEvent.change(field("Finance Remarks"), { target: { value: "Attempted reader edit" } });
  expect(field("Finance Remarks").value).toBe("Full saved finance row");
  expect(m.save).not.toHaveBeenCalled();
});

it.each(["save", "no-op", "uncertain replay"])("%s sends only writable fields after a full saved-row read", async mode => {
  if (mode === "no-op") m.save.mockResolvedValue(receipt(false));
  if (mode === "uncertain replay") m.save.mockResolvedValueOnce({ success: false, uncertain: true }).mockResolvedValueOnce(receipt(true, true));
  mount(); await loaded(); clickSave();
  await waitFor(() => expect(m.save).toHaveBeenCalledTimes(1));
  assertPayload(m.save.mock.calls[0]);
  if (mode === "uncertain replay") {
    fireEvent.click(await screen.findByRole("button", { name: "Retry Finance Save" }));
    await waitFor(() => expect(m.save).toHaveBeenCalledTimes(2));
    expect(m.save.mock.calls[1]).toEqual(m.save.mock.calls[0]);
    assertPayload(m.save.mock.calls[1]);
  }
  await waitFor(() => expect(m.success).toHaveBeenCalledWith(mode === "no-op" ? "No changes to save" : "Finance profile saved"));
  expect(field("Finance Remarks").value).toBe("Full saved finance row");
  expect(field("Credit Limit").value).toBe("0");
});
