// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ExpiryReminderPolicyPanel } from "@/features/notifications/admin/expiry-reminder-policy-panel";

const ports = vi.hoisted(() => ({
  readExpiryReminderScopes: vi.fn(),
  readExpiryReminderPolicy: vi.fn(),
  saveExpiryReminderPolicy: vi.fn(),
  changeExpiryReminderPolicyState: vi.fn(),
}));
vi.mock("@/server/actions/notifications/expiry-reminders", () => ports);

const scope = { companyId: 31, branchId: 41, domain: "hr" };
const policy = { ...scope, active: false, revision: 0, recipientIds: [], expiryDay: false, escalationDays: null,
  preExpiryDays: [90, 60, 30, 15, 7, 1] };

beforeEach(() => {
  vi.clearAllMocks();
  ports.readExpiryReminderScopes.mockResolvedValue({
    success: true, data: [{ companyId: 31, branchId: 41, label: "Example / Head Office" }],
  });
  ports.readExpiryReminderPolicy.mockResolvedValue({
    success: true, data: { policy, recipients: [{ id: 51, label: "Example recipient" }] },
  });
  ports.saveExpiryReminderPolicy.mockResolvedValue({
    success: true, data: { ...policy, revision: 1, recipientIds: [51], expiryDay: true },
  });
});
afterEach(cleanup);

it("preserves inactivity when editing a scoped policy and activates it in a separate request", async () => {
  render(<ExpiryReminderPolicyPanel />);
  fireEvent.click(screen.getByRole("button", { name: "Manage expiry reminders" }));
  await screen.findByRole("option", { name: "Example / Head Office" });
  fireEvent.change(screen.getByLabelText("Company and branch"), { target: { value: "31:41" } });
  await screen.findByText("Example recipient");
  fireEvent.click(screen.getByLabelText("Example recipient"));
  fireEvent.click(screen.getByLabelText("Notify on expiry day"));
  expect(screen.getByText("In-app notifications at 90, 60, 30, 15, 7, 1 days before expiry")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Save reminder policy" }));
  await waitFor(() => expect(ports.saveExpiryReminderPolicy).toHaveBeenCalledWith({
    ...scope, revision: 0, recipientIds: [51], expiryDay: true, escalationDays: null,
  }));
  expect(ports.changeExpiryReminderPolicyState).not.toHaveBeenCalled();
  expect(screen.getByText("Inactive")).toBeTruthy();
  ports.changeExpiryReminderPolicyState.mockResolvedValue({
    success: true, data: { ...policy, active: true, revision: 2, recipientIds: [51], expiryDay: true },
  });
  fireEvent.click(await screen.findByRole("button", { name: "Activate policy" }));
  await waitFor(() => expect(ports.changeExpiryReminderPolicyState).toHaveBeenCalledWith({ ...scope, revision: 1, active: true }));
  expect(await screen.findByText("Active")).toBeTruthy();
});
