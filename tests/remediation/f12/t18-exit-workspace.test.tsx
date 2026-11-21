// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ExitSettlementWorkspace } from "@/features/hr/exit-settlement/exit-settlement-workspace";

const ports = vi.hoisted(() => ({ list: vi.fn(), read: vi.fn(), change: vi.fn(), config: vi.fn(), refresh: vi.fn(), rpc: vi.fn() }));
vi.mock("@/server/actions/hr/final-settlement", () => ({
  listExitScopes: ports.list,
  readExitWorkspace: ports.read,
  changeExitSettlement: ports.change,
  changeExitConfiguration: ports.config,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: ports.refresh }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/rbac/check", () => ({ getAuthContext: async () => ({}), canUseApplication: () => true }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: ports.rpc }) }));

const scope = { company: 17, branch: 22, company_name: "Synthetic Employer", branch_name: "Main Branch" };
const summary = { id: 73, employee: 41, name: "Synthetic Employee", last_day: "2026-11-20", state: "pending-final-settlement" };
const version = "ab5ea9e3-b6c0-4bf7-b355-ad8634e04eb3";
const line = "6371156a-70da-4044-a9c2-d17f1287678a";
const movement = "6371156a-70da-4044-a9c2-d17f1287678b";
const digest = "b".repeat(64);
const fingerprint = "f".repeat(64);
const params = { company: "17", branch: "22", eos: "73" };
const proof = { document: 30, version: 31, file: 32 };

const draft = {
  version, number: 2, digest, state: "submitted",
  gross: "1550.25", deductions: "50.00", net: "1500.25", currency: "AED",
  lines: [{ id: line, category: "unused-annual-leave", kind: "earning", amount: "1550.25", reason: "Verified annual leave balance" }],
  issues: [{ code: "monthly-paid", reason: "November salary already reconciled.", blocking: false }],
};
const selected = {
  ...summary,
  activated: true,
  clearance: { blocking_count: 1, items: [{ origin: "fleet", source_id: 771, owner: "fleet", title: "Truck 104 return", status: "pending" }] },
  cases: [{ id: 8, kind: "fine", state: "open", fingerprint, decision: null }],
  draft,
  approval: null,
  payment: null,
  actions: ["recommend-case", "approve"],
  payment_channels: ["exit-bank-transfer", "exit-cheque"],
};
const data = {
  access: { hr: true, accounts: false, approve: true, pay: false },
  cases: [summary],
  selected,
};

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function prepare(change: object = {}) {
  ports.list.mockResolvedValue([scope]);
  ports.read.mockResolvedValue({ ...data, ...change });
  ports.change.mockResolvedValue({ ok: true });
  ports.config.mockResolvedValue({ ok: true });
}

function chooseAction(name: string) {
  const input = screen.getByLabelText("Settlement action") as HTMLSelectElement;
  const option = within(input).getByRole("option", { name }) as HTMLOptionElement;
  fireEvent.change(input, { target: { value: option.value } });
}

it("rejects explicit outside scope and never reads that case", async () => {
  prepare();
  render(await ExitSettlementWorkspace({ params: { ...params, branch: "24" } }));
  expect(ports.read).not.toHaveBeenCalled();
  expect(screen.getByText("Choose an employer and branch from your available scopes.")).toBeTruthy();
  expect(screen.queryByText("Synthetic Employee")).toBeNull();
});

it("renders clearance, unresolved recovery, exact settlement, and payment separately", async () => {
  prepare();
  render(await ExitSettlementWorkspace({ params }));
  expect(ports.read).toHaveBeenCalledWith({ company: 17, branch: 22, eos: 73 });
  expect(screen.getByRole("heading", { name: "Clearance checklist" })).toBeTruthy();
  expect(screen.getByText("Truck 104 return")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Fine and damage cases" })).toBeTruthy();
  expect(screen.getByText(/Decision required/)).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Settlement version 2" })).toBeTruthy();
  expect(screen.getByText("Verified annual leave balance")).toBeTruthy();
  expect(screen.getByText("AED 1,500.25")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Payment and allocations" })).toBeTruthy();
});

it("keeps older page navigation inside the exact scope and retains the selected case", async () => {
  prepare({ next_after: 62 });
  render(await ExitSettlementWorkspace({ params: { ...params, after: "70" } }));
  expect(ports.read).toHaveBeenCalledWith({ company: 17, branch: 22, eos: 73, after: 70 });
  expect(screen.getByRole("link", { name: "Older exit cases" }).getAttribute("href"))
    .toBe("/admin/hr/actions/final-settlement?company=17&branch=22&eos=73&after=62");
  expect(screen.getByRole("link", { name: "Newest exit cases" }).getAttribute("href"))
    .toBe("/admin/hr/actions/final-settlement?company=17&branch=22&eos=73");
});

it("keeps the sealed recovery decision visible after the live case changes", async () => {
  prepare({ selected: { ...selected, cases: [], reviewed_cases: [{ id: 8, kind: "fine",
    disposition: "separate", reason: "Unresolved dispute was reviewed independently." }] } });
  render(await ExitSettlementWorkspace({ params }));
  expect(screen.getByText("Cases recorded in this settlement version")).toBeTruthy();
  expect(screen.getByText(/Unresolved dispute was reviewed independently/)).toBeTruthy();
  expect(screen.getByText("There are no fine or damage cases to review for this exit.")).toBeTruthy();
});

it("withholds controls without the exact version or corresponding role", async () => {
  prepare({
    access: { hr: false, accounts: false, approve: true, pay: false },
    selected: { ...selected, draft: null, actions: ["approve", "activate", "payment-start"] },
  });
  render(await ExitSettlementWorkspace({ params }));
  expect(screen.queryByLabelText("Settlement action")).toBeNull();
  expect(screen.getByRole("heading", { name: "Settlement calculation" })).toBeTruthy();
});

it("opens clearance against the existing case and keeps the server scope", async () => {
  prepare({ selected: { ...selected, activated: false, draft: null, actions: ["activate"] } });
  render(await ExitSettlementWorkspace({ params }));
  chooseAction("Open exit clearance");
  fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Open verified exit clearance" } });
  fireEvent.click(screen.getByRole("button", { name: "Open exit clearance" }));
  await waitFor(() => expect(ports.refresh).toHaveBeenCalledOnce());
  expect(ports.change.mock.calls[0][0]).toEqual({
    company: 17, branch: 22, eos: 73, operation: expect.any(String), action: "activate",
    data: { reason: "Open verified exit clearance" },
  });
});

it("keeps a recovery decision explicit and sends its current case fingerprint", async () => {
  prepare();
  render(await ExitSettlementWorkspace({ params }));
  chooseAction("Recommend disposition · Case 8");
  expect((screen.getByLabelText("Case disposition") as HTMLSelectElement).value).toBe("");
  fireEvent.change(screen.getByLabelText("Case disposition"), { target: { value: "separate" } });
  fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "The authority review remains open." } });
  fireEvent.click(screen.getByRole("button", { name: "Recommend disposition" }));
  await waitFor(() => expect(ports.refresh).toHaveBeenCalledOnce());
  expect(ports.change.mock.calls[0][0].data).toEqual({
    case: 8, fingerprint, disposition: "separate", reason: "The authority review remains open.",
  });
});

it("keeps an unconfirmed exact GM approval frozen and retries the same operation", async () => {
  prepare();
  ports.change.mockResolvedValueOnce({ ok: false, uncertain: true, error: "The approval result is unconfirmed." });
  render(await ExitSettlementWorkspace({ params }));
  chooseAction("Approve exact version");
  fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Reviewed the exact settlement version and evidence." } });
  fireEvent.click(screen.getByRole("button", { name: "Approve exact version" }));
  await screen.findByRole("alert");
  expect((screen.getByLabelText("Settlement action") as HTMLSelectElement).closest("fieldset")?.disabled).toBe(true);
  expect(ports.change.mock.calls[0][0]).toMatchObject({
    company: 17, branch: 22, eos: 73, action: "approve",
    data: { version, digest, reason: "Reviewed the exact settlement version and evidence." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Retry same request" }));
  await waitFor(() => expect(ports.refresh).toHaveBeenCalledOnce());
  expect(ports.change.mock.calls[1][0]).toEqual(ports.change.mock.calls[0][0]);
});

it("clears a selected approval when the version changes on refresh", async () => {
  prepare();
  const view = render(await ExitSettlementWorkspace({ params }));
  chooseAction("Approve exact version");
  fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Reviewed version two." } });
  prepare({ selected: { ...selected, draft: { ...draft, number: 3, digest: "c".repeat(64) } } });
  view.rerender(await ExitSettlementWorkspace({ params }));
  expect(screen.getByRole("heading", { name: "Settlement version 3" })).toBeTruthy();
  expect((screen.getByLabelText("Settlement action") as HTMLSelectElement).value).toBe("");
  expect(screen.queryByLabelText("Reason")).toBeNull();
  expect(ports.change).not.toHaveBeenCalled();
});

it("closes a reconciled exit through the exact approved version", async () => {
  prepare({ selected: {
    ...selected, actions: ["close-exit"], approval: { version, digest, state: "approved" },
    clearance: { blocking_count: 0, items: [] },
    payment: { state: "reconciled", verified_cash: "1500.25", applied_wages: "1550.25",
      applied_deductions: "50.00", unallocated: "0.00", currency: "AED", movements: [] },
  } });
  render(await ExitSettlementWorkspace({ params }));
  chooseAction("Close exit case");
  fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Clearance and exact payment verified." } });
  fireEvent.click(screen.getByRole("button", { name: "Close exit case" }));
  await waitFor(() => expect(ports.refresh).toHaveBeenCalledOnce());
  expect(ports.change.mock.calls[0][0]).toMatchObject({
    company: 17, branch: 22, eos: 73, action: "close-exit",
    data: { version, digest, reason: "Clearance and exact payment verified." },
  });
});

it("records an approved bank outcome with exact amount and separate verified evidence IDs", async () => {
  prepare({
    access: { hr: false, accounts: false, approve: false, pay: true },
    selected: {
      ...selected, approval: { version, digest, state: "approved" }, actions: ["payment-receipt"],
      payment: { state: "handoff-pending", verified_cash: "0.00", applied_wages: "0.00",
        applied_deductions: "0.00", unallocated: "0.00", currency: "AED", movements: [] },
    },
  });
  render(await ExitSettlementWorkspace({ params }));
  chooseAction("Record payment outcome");
  fireEvent.change(screen.getByLabelText("Payment outcome"), { target: { value: "partial" } });
  fireEvent.change(screen.getByLabelText(/Verified amount/), { target: { value: "425.10" } });
  fireEvent.change(screen.getByLabelText("Payment date"), { target: { value: "2026-11-20" } });
  fireEvent.change(screen.getByLabelText("Payment reference"), { target: { value: "FUND-425" } });
  fireEvent.change(screen.getByLabelText("DMS document ID"), { target: { value: proof.document } });
  fireEvent.change(screen.getByLabelText("DMS version ID"), { target: { value: proof.version } });
  fireEvent.change(screen.getByLabelText("DMS file ID"), { target: { value: proof.file } });
  fireEvent.click(screen.getByRole("button", { name: "Record payment outcome" }));
  await waitFor(() => expect(ports.refresh).toHaveBeenCalledOnce());
  expect(ports.change.mock.calls[0][0]).toMatchObject({ action: "payment-receipt", data: {
    settlement_version: version, digest, reference: "FUND-425", outcome: "partial",
    amount: "425.10", currency: "AED", paid_on: "2026-11-20", ...proof,
  } });
});

it("allocates verified cash only to approved lines from an explicitly actionable payment", async () => {
  prepare({
    access: { hr: false, accounts: false, approve: false, pay: true },
    selected: {
      ...selected,
      approval: { version, digest, state: "approved" },
      actions: ["payment-allocate"],
      payment: {
        state: "partial", verified_cash: "425.10", applied_wages: "0.00",
        applied_deductions: "0.00", unallocated: "425.10", currency: "AED",
        movements: [
          { id: movement, reference_suffix: "425", amount: "425.10", currency: "AED", outcome: "partial",
            allocation_revision: 0, can_allocate: true, can_reverse: false },
          { id: "6371156a-70da-4044-a9c2-d17f1287678c", reference_suffix: "881", amount: "10.10", currency: "AED", outcome: "partial",
            allocation_revision: 0, can_allocate: false },
        ],
      },
    },
  });
  render(await ExitSettlementWorkspace({ params }));
  expect(document.getElementById(`payment-${movement}`)?.closest("ul")?.getAttribute("aria-label")).toBe("Payment history");
  chooseAction("Allocate payment · …425 · Event 1287678b");
  fireEvent.change(screen.getByLabelText("Allocation for Unused annual leave"), { target: { value: "425.10" } });
  fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Matched payment against verified leave value." } });
  fireEvent.click(screen.getByRole("button", { name: "Allocate payment" }));
  await waitFor(() => expect(ports.refresh).toHaveBeenCalledOnce());
  expect(ports.change.mock.calls[0][0]).toMatchObject({ action: "payment-allocate", data: {
    settlement_version: version, digest, payment: movement, revision: 0,
    lines: [{ line, amount: "425.10" }],
  } });
});

const policyFacts = {
  proration: "calendar-days", absence: "unpaid-only", leave_wage_basis: "basic", leave_cashout: "none",
  daily_recovery_basis: "basic", recovery_fraction: "0.3055", net_floor: "0.00",
  payment_channels: ["exit-bank-transfer"], benefit: { mode: "none" },
};

it("proposes a dated settlement policy using explicit verified inputs", async () => {
  prepare({ access: { hr: false, accounts: true, approve: false, pay: false }, policies: [] });
  render(await ExitSettlementWorkspace({ params }));
  const form = within(screen.getByRole("form", { name: "Propose calculation policy" }));
  for (const [name, value] of Object.entries({
    "Effective from": "2026-12-01", "Effective until (excluded)": "2027-01-01", "Salary proration": "calendar-days",
    "Absences to deduct": "unpaid-only", "Annual-leave wage basis": "basic", "Unused leave payout": "none",
    "Daily recovery wage basis": "basic", "Maximum recovery percentage": "30.55", "Minimum pay after recovery": "0.00",
    "Termination benefit": "none", Reason: "Uses the verified employer terms.",
  })) fireEvent.change(form.getByLabelText(name), { target: { value } });
  fireEvent.click(form.getByLabelText("Bank transfer"));
  fireEvent.click(form.getByRole("button", { name: "Propose calculation policy" }));
  await waitFor(() => expect(ports.refresh).toHaveBeenCalledOnce());
  expect(ports.config.mock.calls[0][0]).toMatchObject({ domain: "policy", company: 17, branch: 22, action: "propose",
    data: { from: "2026-12-01", until: "2027-01-01", facts: policyFacts, reason: "Uses the verified employer terms." },
  });
});

it("shows the exact proposed policy and sends its digest for independent approval", async () => {
  prepare({ policies: [{ id: 19, from: "2026-12-01", until: "2027-01-01", digest,
    status: "proposed", reason: "Uses the verified employer terms.", can_decide: true, facts: policyFacts }] });
  render(await ExitSettlementWorkspace({ params }));
  expect(screen.getByText("30.55%")).toBeTruthy();
  const form = within(screen.getByRole("form", { name: "Decide policy 19" }));
  fireEvent.change(form.getByLabelText("Decision"), { target: { value: "approve" } });
  fireEvent.change(form.getByLabelText("Reason"), { target: { value: "Independently reviewed this rule set." } });
  fireEvent.click(form.getByRole("button", { name: "Decide policy 19" }));
  await waitFor(() => expect(ports.refresh).toHaveBeenCalledOnce());
  expect(ports.config.mock.calls[0][0]).toMatchObject({ domain: "policy", action: "approve",
    data: { policy: 19, digest, reason: "Independently reviewed this rule set." },
  });
});

it("verifies only the exact pending adjustment and preserves the scoped retry", async () => {
  prepare({ selected: { ...selected, adjustments: [{ id: 31, kind: "earning", amount: "5.50", currency: "AED",
    status: "proposed", reason: "Verified correction", digest, can_decide: true, evidence_attached: true }],
  } });
  ports.config.mockResolvedValueOnce({ ok: false, uncertain: true });
  render(await ExitSettlementWorkspace({ params }));
  expect(screen.getByText(/AED 5.50/)).toBeTruthy();
  const form = within(screen.getByRole("form", { name: "Review adjustment 31" }));
  fireEvent.change(form.getByLabelText("Decision"), { target: { value: "verify" } });
  fireEvent.change(form.getByLabelText("Reason"), { target: { value: "Verified the adjustment original." } });
  fireEvent.click(form.getByRole("button", { name: "Review adjustment 31" }));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Retry same request" }));
  await waitFor(() => expect(ports.refresh).toHaveBeenCalledOnce());
  expect(ports.config.mock.calls[0][0]).toMatchObject({ domain: "adjustment", action: "verify", company: 17, branch: 22, eos: 73,
    data: { adjustment: 31, digest, reason: "Verified the adjustment original." },
  });
  expect(ports.config.mock.calls[1][0]).toEqual(ports.config.mock.calls[0][0]);
});

it("preserves the complete selected record through the server read adapter and refuses a mismatched case", async () => {
  const server = await vi.importActual<typeof import("@/server/actions/hr/final-settlement")>("@/server/actions/hr/final-settlement");
  ports.list.mockImplementation(server.listExitScopes);
  ports.read.mockImplementation(server.readExitWorkspace);
  const retained = { ...data, next_after: 60, policies: [], selected: {
    ...selected,
    reviewed_cases: [{ id: 8, kind: "fine", disposition: "separate", reason: "Recorded in the approved settlement." }],
    approval: { version, digest, state: "approved" },
    payment: { state: "reconciled", channel: "exit-bank-transfer", currency: "AED", verified_cash: "1500.25",
      applied_wages: "1550.25", applied_deductions: "50.00", unallocated: "0.00", movements: [] },
  } };
  ports.rpc.mockResolvedValueOnce({ data: [scope], error: null }).mockResolvedValue({ data: retained, error: null });
  render(await ExitSettlementWorkspace({ params }));
  expect(ports.rpc).toHaveBeenNthCalledWith(1, "t18_exit_scopes", {});
  expect(ports.rpc).toHaveBeenNthCalledWith(2, "t18_exit_workspace", { p_company: 17, p_branch: 22, p_eos: 73, p_after: null });
  expect(screen.getByText(/Recorded in the approved settlement/)).toBeTruthy();
  expect(screen.getByText(/Reconciled · Bank transfer/)).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Settlement version 2" })).toBeTruthy();
  expect(await server.readExitWorkspace({ company: 17, branch: 22, eos: 74 })).toBeNull();
});

