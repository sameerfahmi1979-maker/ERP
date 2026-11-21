// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import type { AuthContext } from "@/lib/rbac/check";
import { AssistedLeavePanel } from "@/features/hr/time/leave/assisted-leave-panel";

const actions = vi.hoisted(() => ({
  preview: vi.fn(), write: vi.fn(), list: vi.fn(), request: vi.fn(), certificates: vi.fn(),
}));
vi.mock("@/hooks/use-read-lifetime", () => ({ useReadLifetime: () => ({ active: true, enabled: true }) }));
vi.mock("@/server/actions/hr/leave-operations", () => ({
  previewAssistedLeave: actions.preview, changeAssistedLeave: actions.write, listAssistedLeave: actions.list,
  readAssistedLeave: actions.request, readAssistedSickCertificates: actions.certificates,
  approveLeaveBalanceSetup: vi.fn(), proposeLeaveBalanceSetup: vi.fn(), readAssistedLeaveBalance: vi.fn(),
  readLeaveBalanceSetup: vi.fn(), verifyAssistedSickCertificate: vi.fn(),
}));

const auth = { permissionCodes: ["hr.leave.assist"] } as AuthContext;
function mount() {
  const client = new QueryClient();
  return render(<QueryClientProvider client={client}>
    <AssistedLeavePanel employee={51} identity="synthetic" authContext={auth}/>
  </QueryClientProvider>);
}

afterEach(() => { cleanup(); vi.resetAllMocks(); });

it("clears a stale preview and sends the exact reviewed request on retry", async () => {
  const fingerprint = "b".repeat(64);
  actions.preview.mockImplementation(async (_id: number, type: string, from: string, to: string) => ({
    status: "ready", category: type, from, to, fingerprint, paid_days: 1, partial_days: 0, unpaid_days: 1,
    days: [{ day: from, rate: 1 }, { day: to, rate: 0 }],
  }));
  actions.write.mockResolvedValueOnce({ error: "Outcome unconfirmed", uncertain: true })
    .mockResolvedValueOnce({ data: { id: 9, status: "pending", revision: 1, replayed: true } });
  actions.request.mockResolvedValue(null);
  actions.list.mockResolvedValue([]);
  mount();
  fireEvent.click(screen.getByText("Prepare a leave request"));
  fireEvent.change(screen.getByLabelText(/^From$/), { target: { value: "2026-11-20" } });
  fireEvent.change(screen.getByLabelText(/^To$/), { target: { value: "2026-11-21" } });
  fireEvent.click(screen.getByRole("button", { name: "Preview dates and pay" }));
  await screen.findByText("1 paid · 0 partly paid · 1 unpaid");
  fireEvent.change(screen.getByLabelText(/^To$/), { target: { value: "2026-11-22" } });
  expect(screen.queryByRole("button", { name: "Submit on behalf of employee" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Preview dates and pay" }));
  fireEvent.click(await screen.findByRole("button", { name: "Submit on behalf of employee" }));
  await screen.findByText("Outcome unconfirmed");
  expect(actions.write.mock.calls[0][0]).toMatchObject({ employee: 51, id: null, action: "submit",
    data: { from: "2026-11-20", to: "2026-11-22", category: "annual", fingerprint } });
  expect((screen.getByLabelText(/^To$/) as HTMLInputElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Retry original action" }));
  await waitFor(() => expect(actions.write.mock.calls[1][0]).toEqual(actions.write.mock.calls[0][0]));
});

it("shows pending sick evidence to PRO without loading certificate choices", async () => {
  const row = { id: 31, category: "sick", status: "pending", from: "2026-11-18", to: "2026-11-18" };
  actions.list.mockResolvedValue([row]);
  actions.request.mockResolvedValue({ ...row, revision: 1, evidence_status: "pending", cutoff_due: null, days: [] });
  mount();
  fireEvent.click(screen.getByText("Review requests"));
  fireEvent.click(screen.getByRole("button", { name: "Load recent requests" }));
  fireEvent.click(await screen.findByRole("button", { name: /#31/ }));
  await screen.findByText("Certificate evidence pending");
  expect(screen.queryByText("Load verified certificates")).toBeNull();
  expect(actions.certificates).not.toHaveBeenCalled();
});
