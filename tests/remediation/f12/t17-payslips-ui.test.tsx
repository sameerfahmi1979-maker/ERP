// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PayslipCommand } from "@/features/hr/payroll-payslips/payslip-command";
import { PayslipWorkspace } from "@/features/hr/payroll-payslips/payslip-workspace";

const mock = vi.hoisted(() => ({
  scopes: vi.fn(), read: vi.fn(), issue: vi.fn(), delivery: vi.fn(), history: vi.fn(), refresh: vi.fn(),
}));
vi.mock("@/server/actions/hr/payslips", () => ({
  listPayslipScopes: mock.scopes,
  readPayslipWorkspace: mock.read,
  readPayslipDeliveryHistory: mock.history,
  issuePayslip: mock.issue,
  changePayslipDelivery: mock.delivery,
}));
vi.mock("@/server/actions/hr/payroll-workspace-refresh", () => ({ refreshPayrollWorkspace: mock.refresh }));

const scope = { company_id: 17, branch_id: 22, company: "Synthetic Employer", branch: "Synthetic Branch" };
const access = { issue: true, view: true, deliver: true };
const employee = {
  employee: 41, code: "EMP-0041", name: "Synthetic Employee", month: "2026-10-01",
  batch: "6371156a-70da-4044-a9c2-d17f1287678a", version: "ab5ea9e3-b6c0-4bf7-b355-ad8634e04eb3",
  state: "reconciled", can_issue: true, slip: null,
};
const slip = {
  id: 73, issued_at: "2026-11-12T08:00:00Z", checksum: "a".repeat(64), filename: "Payslip-202610-73.pdf",
  delivery: {
    actions: ["resend", "print"], history: [
      { id: 91, kind: "initial", channel: "email", state: "provider_accepted", at: "2026-11-12T08:00:00Z" },
      { id: 92, kind: "print", channel: "print", state: "print_ready", at: "2026-11-13T08:00:00Z" },
    ],
  },
};
const params = { company: "17", branch: "22", month: "2026-10" };

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("rejects a requested branch outside the returned scopes and never reads that payroll", async () => {
  mock.scopes.mockResolvedValue({ ok: true, data: [scope] });
  render(await PayslipWorkspace({ params: { ...params, branch: "23" } }));
  expect(screen.getByText("Choose an employer and branch from your available scopes.")).toBeTruthy();
  expect(mock.read).not.toHaveBeenCalled();
});

it("reads exact staff code, carries it to the cursor, and exposes only the scoped original PDF", async () => {
  mock.scopes.mockResolvedValue({ ok: true, data: [scope] });
  mock.read.mockResolvedValue({ ok: true, data: {
    access, rows: [{ ...employee, can_issue: false, slip }], next_after: 41,
  } });
  render(await PayslipWorkspace({ params: { ...params, employee: employee.code } }));
  expect(mock.read).toHaveBeenCalledWith({ company: 17, branch: 22, month: "2026-10-01", employee: "EMP-0041" });
  expect(screen.getByRole("link", { name: "Download original PDF" }).getAttribute("href")).toBe("/api/hr/payroll/payslips/73");
  const next = screen.getByRole("link", { name: "Next employees" });
  const nextUrl = new URL(next.getAttribute("href")!, "http://localhost");
  expect(nextUrl.searchParams.get("employee")).toBe(employee.code);
  expect(nextUrl.searchParams.get("after")).toBe("41");
  expect(screen.queryByText(/@|AE07/)).toBeNull();
});

it("shows retained history after a reversal while payment or delivery commands stay unavailable", async () => {
  mock.scopes.mockResolvedValue({ ok: true, data: [scope] });
  mock.read.mockResolvedValue({ ok: true, data: {
    access, rows: [{ ...employee, state: "reversed", can_issue: true, slip }], next_after: null,
  } });
  render(await PayslipWorkspace({ params }));
  expect(screen.getByText("Payment reversed")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Download original PDF" })).toBeTruthy();
  expect(screen.getByText("Accepted by email provider")).toBeTruthy();
  expect(screen.queryByText("Resend original")).toBeNull();
  expect(screen.queryByText("Queue print copy")).toBeNull();
  expect(screen.queryByText("Confirm handover")).toBeNull();
  expect(screen.queryByText("Issue payslip")).toBeNull();
});

it("keeps an unconfirmed issue frozen and retries the original exact request", async () => {
  mock.issue
    .mockResolvedValueOnce({ ok: false, uncertain: true, error: "The issue result is unconfirmed." })
    .mockResolvedValueOnce({ ok: true });
  render(<PayslipCommand employee={41} batch={employee.batch} canIssue />);
  fireEvent.click(screen.getByRole("button", { name: "Issue payslip" }));
  await screen.findByRole("alert");
  expect((screen.getByRole("button", { name: "Issue payslip" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Retry same request" }));
  await screen.findByText("Original payslip retained.");
  expect(mock.refresh).not.toHaveBeenCalled();
  expect(mock.issue.mock.calls[0][0]).toMatchObject({ batch: employee.batch, employee: 41 });
  expect(mock.issue.mock.calls[1][0]).toEqual(mock.issue.mock.calls[0][0]);
  expect(mock.delivery).not.toHaveBeenCalled();
});

it("records handover against the retained print item and requires an explicit reason", async () => {
  mock.delivery.mockResolvedValue({ ok: true });
  render(<PayslipCommand employee={41} batch={employee.batch} canIssue={false}
    delivery={{ slip: 73, actions: [{ kind: "handover", delivery: 92 }] }} />);
  fireEvent.click(screen.getByRole("button", { name: "Confirm handover" }));
  expect(mock.delivery).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Handed the original to the employee." } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm handover" }));
  await screen.findByText("Delivery action recorded.");
  expect(mock.refresh).not.toHaveBeenCalled();
  expect(mock.delivery.mock.calls[0][0]).toMatchObject({
    slip: 73, action: "handover", data: { delivery: 92, reason: "Handed the original to the employee." },
  });
});

it("records a traceable bounce without entering a new recipient or exposing an attachment", async () => {
  mock.delivery.mockResolvedValue({ ok: true });
  render(<PayslipCommand employee={41} batch={employee.batch} canIssue={false}
    delivery={{ slip: 73, actions: [{ kind: "bounce", delivery: 91 }] }} />);
  fireEvent.change(screen.getByLabelText("Provider reference"), { target: { value: "Synthetic-acceptance-91" } });
  fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Verified mailbox delivery failure." } });
  fireEvent.click(screen.getByRole("button", { name: "Record bounce" }));
  await screen.findByText("Delivery action recorded.");
  expect(mock.refresh).not.toHaveBeenCalled();
  expect(mock.delivery.mock.calls[0][0]).toMatchObject({
    slip: 73, action: "bounce", data: { delivery: 91, reference: "Synthetic-acceptance-91", reason: "Verified mailbox delivery failure." },
  });
  expect(screen.queryByLabelText(/recipient|attachment/i)).toBeNull();
});

it("discards a stale handover draft when the retained print step changes", () => {
  const view = render(<PayslipCommand employee={41} batch={employee.batch} canIssue={false}
    delivery={{ slip: 73, actions: [{ kind: "handover", delivery: 92 }] }} />);
  fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Confirm the first copy." } });
  view.rerender(<PayslipCommand employee={41} batch={employee.batch} canIssue={false}
    delivery={{ slip: 73, actions: [{ kind: "handover", delivery: 99 }] }} />);
  expect((screen.getByLabelText("Reason") as HTMLInputElement).value).toBe("");
  expect(mock.delivery).not.toHaveBeenCalled();
});

it("starts with no email disposition and retries the same confirmed outcome after uncertainty", async () => {
  mock.delivery.mockResolvedValueOnce({ ok: false, uncertain: true, error: "Confirmation is unconfirmed." })
    .mockResolvedValueOnce({ ok: true });
  render(<PayslipCommand employee={41} batch={employee.batch} canIssue={false}
    delivery={{ slip: 73, actions: [{ kind: "reconcile-email", delivery: 91 }] }} />);
  const disposition = screen.getByLabelText("Confirmed outcome") as HTMLSelectElement;
  expect(disposition.value).toBe("");
  fireEvent.change(screen.getByLabelText("Provider reference"), { target: { value: "Synthetic/review-91" } });
  fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Checked the provider delivery evidence." } });
  fireEvent.click(screen.getByRole("button", { name: "Record confirmed email outcome" }));
  expect(mock.delivery).not.toHaveBeenCalled();
  fireEvent.change(disposition, { target: { value: "not-accepted" } });
  fireEvent.click(screen.getByRole("button", { name: "Record confirmed email outcome" }));
  await screen.findByRole("alert");
  expect(disposition.closest("fieldset")?.disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Retry same request" }));
  await screen.findByText("Delivery action recorded.");
  expect(mock.refresh).not.toHaveBeenCalled();
  expect(mock.delivery.mock.calls[0][0]).toMatchObject({
    slip: 73, action: "reconcile-email",
    data: { delivery: 91, disposition: "not-accepted", reference: "Synthetic/review-91", reason: "Checked the provider delivery evidence." },
  });
  expect(mock.delivery.mock.calls[1][0]).toEqual(mock.delivery.mock.calls[0][0]);
});

it("offers only flagged email evidence actions after reversal and keeps confirmed states distinct", async () => {
  mock.scopes.mockResolvedValue({ ok: true, data: [scope] });
  mock.read.mockResolvedValue({ ok: true, data: {
    access, rows: [{
      ...employee, state: "reversed", slip: { ...slip, delivery: {
        actions: ["initial", "resend", "print"], history: [
          { id: 95, kind: "resend", channel: "email", state: "delivery_unknown", at: "2026-11-15T08:00:00Z", can_reconcile: true },
          { id: 94, kind: "resend", channel: "email", state: "delivery_unknown", at: "2026-11-14T08:00:00Z" },
          { id: 93, kind: "resend", channel: "email", state: "provider_not_accepted_confirmed", at: "2026-11-14T08:00:00Z" },
          { id: 92, kind: "print", channel: "print", state: "print_ready", at: "2026-11-13T08:00:00Z", can_handover: true },
          { id: 91, kind: "initial", channel: "email", state: "provider_accepted_confirmed", at: "2026-11-12T08:00:00Z", can_bounce: true },
        ],
      } },
    }], next_after: null,
  } });
  render(await PayslipWorkspace({ params }));
  expect(screen.getByText(/Provider acceptance confirmed/)).toBeTruthy();
  expect(screen.getByText(/Provider non-acceptance confirmed/)).toBeTruthy();
  expect(screen.getByText(/Record confirmed email outcome · .* · 95/)).toBeTruthy();
  expect(screen.queryByText(/Record confirmed email outcome · .* · 94/)).toBeNull();
  expect(screen.getByText(/Record bounce · .* · 91/)).toBeTruthy();
  expect(screen.queryByText("Resend original")).toBeNull();
  expect(screen.queryByText("Start delivery")).toBeNull();
  expect(screen.queryByText("Queue print copy")).toBeNull();
  expect(screen.queryByText("Confirm handover")).toBeNull();
});

it("keeps the history cursor independent and loads only the explicitly selected visible payslip", async () => {
  const summarized = { ...slip, delivery: { ...slip.delivery, history: [slip.delivery.history[0]], history_count: 75 } };
  mock.scopes.mockResolvedValue({ ok: true, data: [scope] });
  mock.read.mockResolvedValue({ ok: true, data: { access, rows: [{ ...employee, slip: summarized }], next_after: 80 } });
  const view = render(await PayslipWorkspace({ params: { ...params, after: "40" } }));
  expect(screen.getByRole("link", { name: "Delivery history (75)" }).getAttribute("href"))
    .toContain("after=40&delivery_history=73");
  expect(mock.history).not.toHaveBeenCalled();

  mock.history.mockResolvedValueOnce({ ok: true, data: {
    rows: [{ ...slip.delivery.history[0], can_bounce: true }], count: 75, next_before: 91,
  } });
  view.rerender(await PayslipWorkspace({ params: { ...params, after: "40", delivery_history: "73", before_delivery: "92" } }));
  expect(screen.getByRole("link", { name: "Next deliveries" }).getAttribute("href"))
    .toContain("after=40&delivery_history=73&before_delivery=91");
  expect(mock.history).toHaveBeenCalledWith({ company: 17, branch: 22, month: "2026-10-01", slip: 73, before: 92 });

  view.rerender(await PayslipWorkspace({ params: { ...params, delivery_history: "999" } }));
  expect(mock.history).toHaveBeenCalledOnce();
});

it("keeps a confirmed issue when cache invalidation fails and retries only the refresh", async () => {
  mock.issue.mockResolvedValueOnce({ ok: true, receipt: { id: 73, routed: true }, refreshRequired: true });
  mock.refresh.mockResolvedValueOnce(true);
  render(<PayslipCommand employee={employee.employee} batch={employee.batch} canIssue />);
  fireEvent.click(screen.getByRole("button", { name: "Issue payslip" }));
  await screen.findByRole("alert");
  expect(screen.getByText("Original payslip retained.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Retry same request" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Retry refreshing" }));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  expect(mock.issue).toHaveBeenCalledOnce();
  expect(mock.refresh.mock.calls).toEqual([["payslips"]]);
});
