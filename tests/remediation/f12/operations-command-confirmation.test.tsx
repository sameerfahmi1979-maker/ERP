// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RecoveryForm } from "@/features/hr/recoveries/recovery-form";

const mock = vi.hoisted(() => ({ save: vi.fn(), refresh: vi.fn(), invalidate: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mock.refresh }) }));
vi.mock("@/server/actions/operations/command-refresh", () => ({ refreshOperationsCommand: mock.invalidate }));
vi.mock("@/server/actions/hr/recoveries", () => ({ saveRecovery: mock.save }));

beforeEach(() => {
  mock.save.mockReset();
  mock.refresh.mockReset();
  mock.invalidate.mockReset();
});
afterEach(cleanup);

function recoveryForm() {
  render(<RecoveryForm action="reverse" target={38} label="Reverse recovery">
    <input name="allocation" defaultValue="38" />
    <input name="amount" defaultValue="50" />
  </RecoveryForm>);
  const reason = screen.getByLabelText<HTMLInputElement>("Reason");
  fireEvent.change(reason, { target: { value: "Check retained settlement receipt" } });
  fireEvent.click(screen.getByRole("button", { name: "Reverse recovery" }));
  return reason;
}

it("keeps the original operation and form snapshot through loss and a denied retry", async () => {
  mock.save.mockRejectedValueOnce(new Error("Synthetic response loss"))
    .mockResolvedValueOnce({ ok: false, uncertain: false, error: "Synthetic scope denial" })
    .mockResolvedValueOnce({ ok: true, receipt: { id: 72, replayed: true }, refreshFailed: false });
  const reason = recoveryForm();

  const retry = await screen.findByRole("button", { name: "Retry original save" });
  expect(reason.matches(":disabled")).toBe(true);
  fireEvent.change(reason, { target: { value: "Attempted edit" } });
  fireEvent.click(retry);

  expect(await screen.findByText("Synthetic scope denial")).toBeTruthy();
  expect(reason.matches(":disabled")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Retry original save" }));

  await waitFor(() => expect(mock.save).toHaveBeenCalledTimes(3));
  const [initial, ...retries] = mock.save.mock.calls;
  for (const repeated of retries) {
    expect(repeated.slice(0, 3)).toEqual(initial.slice(0, 3));
    expect(Array.from(repeated[3].entries())).toEqual(Array.from(initial[3].entries()));
  }
});

it("retries a failed refresh without replaying a confirmed business operation", async () => {
  mock.save.mockResolvedValue({ ok: true, receipt: { id: 72, replayed: false } });
  mock.refresh.mockImplementationOnce(() => { throw new Error("Synthetic client refresh failure"); });
  recoveryForm();

  expect(await screen.findByText(/Saved/)).toBeTruthy();
  fireEvent.click(await screen.findByRole("button", { name: "Retry refresh" }));

  await waitFor(() => expect(mock.refresh).toHaveBeenCalledTimes(2));
  expect(mock.save).toHaveBeenCalledTimes(1);
});


it("retries server invalidation and keeps the receipt visible if invalidation remains unavailable", async () => {
  const refreshTarget = { kind: "recovery" };
  mock.save.mockResolvedValue({ ok: true, receipt: { id: 72, replayed: false }, refreshFailed: true, refreshTarget });
  mock.invalidate.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  recoveryForm();

  expect(await screen.findByText(/Saved reference #72/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Retry refresh" }));
  await waitFor(() => expect(mock.invalidate).toHaveBeenCalledWith(refreshTarget));
  expect(mock.refresh).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByRole("button", { name: "Retry refresh" }).matches(":disabled")).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Retry refresh" }));

  await waitFor(() => expect(mock.refresh).toHaveBeenCalledTimes(1));
  expect(mock.save).toHaveBeenCalledTimes(1);
});
