// @vitest-environment jsdom
// Real finance editor, tax tab, and ERP record shell. The surrounding header,
// footer, lookups, lifecycle dialog, and server boundaries are local doubles.
import { readFileSync } from "node:fs";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useCallback, useState, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AuthContext } from "@/lib/rbac/check";
import { createWorkspaceDraftStore } from "@/lib/workspace/workspace-draft-store";
const m = vi.hoisted(() => ({ store: null as unknown, dispatch: vi.fn(), save: vi.fn(), parentSave: vi.fn(), parentClose: vi.fn(), success: vi.fn(), warning: vi.fn() }));
vi.mock("@/hooks/use-workspace-form-owner", () => ({ useWorkspaceFormOwner: () => ({ id: "inline-finance" }) }));
vi.mock("@/components/workspace/workspace-draft-provider", () => ({ useWorkspaceDraftStoreContext: () => m.store }));
vi.mock("@/components/workspace/workspace-provider", () => ({ useWorkspaceContext: () => ({ dispatch: m.dispatch }) }));
vi.mock("sonner", () => ({ toast: { success: m.success, warning: m.warning, error: vi.fn() } }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: [] }), useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("@/features/master-data/parties/hooks/use-party-child-queries", () => ({ usePartyTaxRegistrationsQuery: () => ({ items: [{ id: 5, party_id: 4, workspace_revision: 1, tax_registration_code: "TAX" }], isLoading: false }) }));
vi.mock("@/server/actions/master-data/party-finance-profiles", () => ({ getPartyFinanceProfile: async () => ({ success: true, data: null }), upsertPartyFinanceProfile: m.save }));
vi.mock("@/server/actions/master-data/parties", () => ({ getPaymentMethods: vi.fn(), getPartyTaxStatuses: vi.fn() }));
vi.mock("@/server/actions/master-data/party-tax-registrations", () => ({ createPartyTaxRegistration: vi.fn(), updatePartyTaxRegistration: vi.fn() }));
vi.mock("@/lib/query/invalidation", () => ({ invalidatePartyTaxRegistrations: vi.fn() }));
vi.mock("@/components/ui/button", () => ({ Button: ({ children, size, variant, ...props }: { children: ReactNode; size?: string; variant?: string }) => { void size; void variant; return <button {...props}>{children}</button>; } }));
vi.mock("@/components/ui/input", () => ({ Input: (props: object) => <input {...props} /> }));
vi.mock("@/components/ui/textarea", () => ({ Textarea: (props: object) => <textarea {...props} /> }));
vi.mock("@/components/ui/label", () => ({ Label: (props: object) => <label {...props} /> }));
vi.mock("@/components/ui/switch", () => ({ Switch: ({ checked, onCheckedChange, ...props }: { checked: boolean; onCheckedChange: (value: boolean) => void }) => <input {...props} type="checkbox" checked={checked} onChange={event => onCheckedChange(event.target.checked)} /> }));
vi.mock("@/components/ui/checkbox", () => ({ Checkbox: () => <input type="checkbox" /> }));
vi.mock("@/components/erp/finance-basics", () => ({ CurrencySelect: () => null, PaymentTermSelect: () => null, TaxTypeSelect: () => null }));
vi.mock("@/components/erp/combobox", () => ({ ERPCombobox: () => null }));
vi.mock("@/components/workspace/erp-record-header", () => ({ ERPRecordHeader: ({ onRequestClose }: { onRequestClose?: () => void }) => <button disabled={!onRequestClose} onClick={onRequestClose}>Close parent</button> }));
vi.mock("@/components/workspace/erp-record-section-nav", () => ({ ERPRecordSectionNav: () => null }));
vi.mock("@/components/workspace/erp-record-form-footer", () => ({ ERPRecordFormFooter: ({ onSave, hasUnsavedChanges }: { onSave?: () => void; hasUnsavedChanges: boolean }) => <div><button onClick={onSave} disabled={!onSave}>Save parent</button><span>{hasUnsavedChanges ? "Parent remains dirty" : "Parent clean"}</span></div> }));
vi.mock("@/components/erp/table/erp-data-table", () => ({ ERPDataTable: ({ data, columns }: { data: object[]; columns: { id?: string; cell?: (props: object) => ReactNode }[] }) => <div>{columns.find(column => column.id === "actions")?.cell?.({ row: { original: data[0] } })}</div> }));
vi.mock("@/features/master-data/parties/party-child-save-dialog", () => ({ PartyChildSaveDialog: ({ onOpenChange }: { onOpenChange: (open: boolean) => void }) => <button onClick={() => onOpenChange(false)}>Close tax editor</button> }));
vi.mock("@/features/master-data/parties/party-child-lifecycle-control", async () => {
  const { useState } = await import("react");
  return {
    PartyChildLifecycleControl: ({ onOpen }: { onOpen: () => void }) => <button onClick={onOpen}>Tax lifecycle</button>,
    usePartyChildLifecycle: ({ onOpenChange }: { onOpenChange: (value: boolean) => void }) => {
      const [open, setOpen] = useState(false);
      return { isOpen: open, open: () => { setOpen(true); onOpenChange(true); }, dialog: open ? <button onClick={() => { setOpen(false); onOpenChange(false); }}>Close tax lifecycle</button> : null };
    },
  };
});
import { ERPRecordWorkspaceForm } from "@/components/workspace/erp-record-workspace-form";
import { PartyTaxFinanceTab } from "@/features/master-data/parties/party-tax-finance-tab";
const context = { profile: { id: 7 }, isAccountActive: true, globalPermissionCodes: ["master_data.parties.view", "master_data.parties.edit", "master_data.parties.manage_tax"] } as unknown as AuthContext;
function MountedShell() {
  const [childOpen, setChildOpen] = useState(false), [inlineOpen, setInlineOpen] = useState(false);
  const child = useCallback((open: boolean) => setChildOpen(open), []), inline = useCallback((open: boolean) => setInlineOpen(open), []);
  return <ERPRecordWorkspaceForm title="Party" mode="edit" isDirty sections={[]} activeSection="tax" onSectionChange={() => {}} onSave={m.parentSave} onRequestClose={m.parentClose} isChildDialogOpen={childOpen} isInlineTaskOpen={inlineOpen}>
    <form><PartyTaxFinanceTab partyId={4} authContext={context} onChildOpen={child} onInlineTaskOpen={inline} /><a href="/other-record">Leave record</a></form>
  </ERPRecordWorkspaceForm>;
}
const input = () => screen.getByLabelText("Finance Remarks") as HTMLTextAreaElement;
const start = async () => { render(<MountedShell />); await screen.findByLabelText("Finance Remarks"); fireEvent.change(input(), { target: { value: "Finance draft" } }); };
const assertBlockedEditable = () => { expect(input().closest("[inert]")).toBeNull(); expect(input().disabled).toBe(false); expect(screen.getByRole("button", { name: "Save parent" }).hasAttribute("disabled")).toBe(true); expect(screen.getByRole("button", { name: "Close parent" }).hasAttribute("disabled")).toBe(true); };
beforeEach(() => { vi.clearAllMocks(); m.store = createWorkspaceDraftStore(); m.save.mockResolvedValue({ success: true, data: { id: 81, revision: "1", changed: false, replayed: false } }); });
afterEach(cleanup);

it("dirty inline finance stays editable while parent save/close/navigation are blocked", async () => { await start(); assertBlockedEditable(); fireEvent.change(input(), { target: { value: "Second edit" } }); expect(input().value).toBe("Second edit"); expect(fireEvent.click(screen.getByRole("link", { name: "Leave record" }))).toBe(false); expect(m.warning).toHaveBeenCalled(); fireEvent.click(screen.getByRole("button", { name: "Save parent" })); expect(m.parentSave).not.toHaveBeenCalled(); });
it.each(["editor", "lifecycle"])("closing tax %s does not release dirty finance or leave it inert", async kind => { await start(); fireEvent.click(screen.getByRole("button", { name: kind === "editor" ? "Add Tax Registration" : "Tax lifecycle" })); expect(input().closest("[inert]")).not.toBeNull(); fireEvent.click(screen.getByRole("button", { name: `Close tax ${kind}` })); assertBlockedEditable(); });
it.each(["editor", "lifecycle"])("a confirmed finance no-op does not release an open tax %s or clean the parent draft", async kind => {
  let resolve!: (value: unknown) => void; m.save.mockReturnValueOnce(new Promise(done => { resolve = done; })); await start(); fireEvent.click(screen.getByRole("button", { name: "Save Finance Profile" })); fireEvent.click(screen.getByRole("button", { name: kind === "editor" ? "Add Tax Registration" : "Tax lifecycle" }));
  await act(async () => resolve({ success: true, data: { id: 81, revision: "1", changed: false, replayed: false } })); await waitFor(() => expect(m.success).toHaveBeenCalledWith("No changes to save")); expect(input().closest("[inert]")).not.toBeNull(); expect(screen.getByRole("button", { name: "Close parent" }).hasAttribute("disabled")).toBe(true); expect(screen.getByText("Parent remains dirty")).toBeTruthy(); expect(m.dispatch.mock.calls.some(([event]) => event.type === "MARK_DIRTY" && event.dirty === false)).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: `Close tax ${kind}` })); expect(input().closest("[inert]")).toBeNull(); expect(screen.getByRole("button", { name: "Save parent" }).hasAttribute("disabled")).toBe(false);
});
it("the mounted party adapter uses the independent inline channel, not the inert dialog channel", () => { const source = readFileSync("src/features/master-data/parties/party-workspace-form.tsx", "utf8"); expect(source).toContain("isInlineTaskOpen={financeTaskOpen}"); expect(source).toContain("onInlineTaskOpen={handleFinanceTaskOpen}"); expect(source).toContain("isChildDialogOpen={childDialogOpen}"); });
