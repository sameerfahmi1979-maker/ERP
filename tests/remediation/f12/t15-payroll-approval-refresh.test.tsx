// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PayrollApprovalForm } from "@/features/hr/payroll-approvals/payroll-approval-form";

const mock = vi.hoisted(() => ({ save: vi.fn(), revalidate: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mock.push }) }));
vi.mock("@/server/actions/hr/payroll-approvals", () => ({ savePayrollReviewCommand: mock.save }));
vi.mock("@/server/actions/hr/payroll-workspace-refresh", () => ({ refreshPayrollWorkspace: mock.revalidate }));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

const review = "4d7b2841-3765-47f7-99fb-28cbc2d875c1";
const run = "6371156a-70da-4044-a9c2-d17f1287678a";
const version = "ba596e40-5823-4f01-b0c0-c88c224536ef";
const digest = "5".repeat(64);
const returnTo = "/admin/hr/payroll/runs?tab=review";

it("retries the confirmed payroll view alone after server refresh succeeded", async () => {
  mock.save
    .mockRejectedValueOnce(new Error("The response was lost after recording the command"))
    .mockResolvedValueOnce({ ok: true, review, version, digest, refreshRequired: true });
  mock.revalidate.mockResolvedValue(true);
  mock.push.mockImplementationOnce(() => { throw new Error("The client view did not refresh"); });

  render(<PayrollApprovalForm company={17} branch={22} version={version} digest={digest}
    target={{ actions: ["submit"], run, acknowledge: true, returnTo }} />);
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.change(screen.getByRole("textbox", { name: "Reason" }), { target: { value: "Synthetic payroll review" } });
  fireEvent.click(screen.getByRole("button", { name: "Submit exact version" }));

  const retryRequest = await screen.findByRole("button", { name: "Retry same request" });
  expect(screen.getByRole("textbox", { name: "Reason" }).matches(":disabled")).toBe(true);
  fireEvent.click(retryRequest);
  await screen.findByText("Version submitted.");
  expect(mock.save).toHaveBeenCalledTimes(2);
  const first = mock.save.mock.calls[0];
  const retry = mock.save.mock.calls[1];
  expect(first.slice(0, 3)).toEqual(["submit", 17, 22]);
  expect(first[3]).toMatch(/^[0-9a-f-]{36}$/);
  expect(retry).toEqual(first);
  expect(retry[4]).toBe(first[4]);
  expect(Object.fromEntries(first[4] as FormData)).toEqual({
    run, version, digest, acknowledge_exceptions: "true", reason: "Synthetic payroll review",
  });

  fireEvent.click(screen.getByRole("button", { name: "Retry refreshing" }));
  await waitFor(() => expect(mock.push).toHaveBeenCalledOnce());
  expect(mock.revalidate.mock.calls).toEqual([["approvals"]]);
  const retryView = screen.getByRole("button", { name: "Retry refreshing" });
  await waitFor(() => expect(retryView.matches(":disabled")).toBe(false));
  fireEvent.click(retryView);
  await waitFor(() => expect(mock.push).toHaveBeenCalledTimes(2));

  const destination = returnTo + "&review=" + review + "#payroll-snapshot";
  expect(mock.push.mock.calls).toEqual([[destination], [destination]]);
  expect(mock.revalidate.mock.calls).toEqual([["approvals"]]);
  expect(mock.save).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("button", { name: "Retry refreshing" })).toBeNull();
  expect(screen.getByText("Version submitted.")).toBeTruthy();
});
