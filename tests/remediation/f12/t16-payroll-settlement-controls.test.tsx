// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AllocationForm, HandoffForm, ReversePaymentForm } from "@/features/hr/payroll-settlement/payroll-settlement-forms";

const mock = vi.hoisted(() => ({ options: vi.fn(), save: vi.fn(), refresh: vi.fn() }));
vi.mock("@/server/actions/hr/payroll-settlement", () => ({
  listPayrollEvidenceOptions: mock.options, savePayrollSettlementCommand: mock.save,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mock.refresh }) }));

const scope = { company: 17, branch: 22 };
const batch = "6371156a-70da-4044-a9c2-d17f1287678a";
const wpsFile = "ba596e40-5823-4f01-b0c0-c88c224536ef";

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("records submission separately and retries the exact selected evidence without editing it", async () => {
  mock.options.mockResolvedValueOnce([{ document: 81, version: 82, file: 83, label: "Test bank submission receipt" }]);
  mock.save.mockResolvedValueOnce({ ok: false, uncertain: true, error: "Outcome unconfirmed" })
    .mockResolvedValueOnce({ ok: true });
  render(<HandoffForm scope={scope} batch={batch} wpsFile={wpsFile} actions={["record-submission"]} retainedReference="Test submission ABCD" />);
  const reference = screen.getByLabelText("Bank event reference") as HTMLInputElement;
  expect(reference.value).toBe("Test submission ABCD");
  expect(reference.readOnly).toBe(true);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "submission" } });
  fireEvent.click(screen.getByRole("button", { name: "Find in DMS" }));
  await screen.findByRole("option", { name: "Test bank submission receipt" });
  expect(mock.options).toHaveBeenCalledWith({ ...scope, search: "submission" });
  fireEvent.change(screen.getByLabelText("Verified DMS original"), { target: { value: "83" } });
  fireEvent.click(screen.getByRole("button", { name: "Record bank submission" }));
  await screen.findByRole("alert");
  expect(screen.getByLabelText("Bank event reference").closest("fieldset")?.disabled).toBe(true);
  expect(mock.save.mock.calls[0][0]).toMatchObject({
    ...scope, action: "record-submission", data: {
      batch, wps_file: wpsFile, reference: "Test submission ABCD", document: 81, version: 82, file: 83,
    },
  });
  fireEvent.click(screen.getByRole("button", { name: "Retry same request" }));
  await waitFor(() => expect(mock.refresh).toHaveBeenCalledOnce());
  expect(mock.save.mock.calls[1][0]).toEqual(mock.save.mock.calls[0][0]);
});

it("clears a bank action that becomes unavailable when the batch changes", () => {
  const view = render(<HandoffForm scope={scope} batch={batch} wpsFile={wpsFile} actions={["start-handoff"]} />);
  expect(screen.getByLabelText("Handoff reference")).toBeTruthy();
  view.rerender(<HandoffForm scope={scope} batch={batch} wpsFile={wpsFile} actions={["record-submission", "cancel"]} />);
  expect(screen.queryByLabelText("Handoff reference")).toBeNull();
  expect(screen.getByLabelText("Bank event")).toBeTruthy();
  expect(screen.getByRole("option", { name: "Record bank submission" })).toBeTruthy();
});

it("requires separate proof when allocating a recovery refund earning", () => {
  const line = "4d7b2841-3765-47f7-99fb-28cbc2d875c1";
  render(<AllocationForm scope={scope} batch={batch} payment={{ id: wpsFile, allocation_revision: 0 }}
    result={{ currency: "AED", lines: [{ id: line, category: "recovery-refund", kind: "earning", amount: "12.00" }] }} />);
  fireEvent.change(screen.getByLabelText(/recovery refund/), { target: { value: "12.00" } });
  expect(screen.getByLabelText(/evidence verifies/i)).toBeTruthy();
  expect(screen.getByLabelText("Verified DMS original")).toBeTruthy();
  expect(mock.save).not.toHaveBeenCalled();
});

it("applies the same 500-character validation to the allocation and reversal fields", () => {
  const line = "4d7b2841-3765-47f7-99fb-28cbc2d875c1";
  const payment = { id: wpsFile, allocation_revision: 1 };
  render(<>
    <AllocationForm scope={scope} batch={batch} payment={payment}
      result={{ currency: "AED", lines: [{ id: line, category: "recovery-refund", kind: "earning", amount: "12.00" }] }} />
    <ReversePaymentForm scope={scope} batch={batch} payment={payment} />
  </>);
  fireEvent.change(screen.getByLabelText(/recovery refund/), { target: { value: "12.00" } });
  expect(screen.getAllByText("500 characters maximum")).toHaveLength(2);
  for (const label of [/evidence verifies/i, "Reason for reversal"]) {
    const input = screen.getByLabelText(label) as HTMLTextAreaElement;
    const reason = "𐐀".repeat(500);
    fireEvent.input(input, { target: { value: reason + "م" } });
    expect(input.validity.customError).toBe(true);
    fireEvent.input(input, { target: { value: reason } });
    expect(input.checkValidity()).toBe(true);
  }
});

it("uses explicit zero for a documented recovery shortfall while keeping ordinary lines unchanged", async () => {
  const line = "4d7b2841-3765-47f7-99fb-28cbc2d875c1";
  mock.options.mockResolvedValueOnce([{ document: 81, version: 82, file: 83, label: "Evidence of zero collection" }]);
  mock.save.mockResolvedValueOnce({ ok: true });
  render(<AllocationForm scope={scope} batch={batch} payment={{ id: wpsFile, allocation_revision: 2 }}
    result={{ currency: "AED", lines: [{ id: line, category: "recovery", kind: "deduction", amount: "12.00" }] }} />);
  fireEvent.change(screen.getByLabelText(/Verified amount collected/), { target: { value: "0.00" } });
  fireEvent.click(screen.getByRole("button", { name: "Find in DMS" }));
  await screen.findByRole("option", { name: "Evidence of zero collection" });
  fireEvent.change(screen.getByLabelText("Verified DMS original"), { target: { value: "83" } });
  fireEvent.change(screen.getByLabelText(/How the evidence verifies/), { target: { value: "Approved amount was fully deferred" } });
  fireEvent.click(screen.getByRole("button", { name: "Allocate verified payment" }));
  await waitFor(() => expect(mock.save).toHaveBeenCalledOnce());
  expect(mock.save.mock.calls[0][0]).toMatchObject({ data: {
    lines: [], close_recoveries: [{ line, amount: "0.00" }], document: 81, version: 82, file: 83,
  } });
});
