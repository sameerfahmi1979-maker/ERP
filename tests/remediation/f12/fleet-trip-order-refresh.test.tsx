// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FinishTripOrder, NewFleetOperation } from "@/features/fleet/operation-forms";
import { finalizeTripOrder, saveFleetOperation } from "@/server/actions/fleet/operations";

const mock = vi.hoisted(() => ({
  actor: vi.fn(), rpc: vi.fn(), publish: vi.fn(), render: vi.fn(), revalidate: vi.fn(),
  refresh: vi.fn(), push: vi.fn(), claims: vi.fn(), fetch: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mock.refresh, push: mock.push }) }));
vi.mock("@/lib/rbac/check", () => ({ getAuthContext: mock.actor }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getClaims: mock.claims }, rpc: mock.rpc }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: mock.publish }) }));
vi.mock("@/server/fleet/trip-order-pdf", () => ({ renderTripOrderPdf: mock.render }));

const command = {
  operation: "381ef4d5-70e9-4f8a-9149-1103fb181803", order: 14, action: "issue-paper", data: { reason: "Fixture issue" },
};
const receipt = { id: 14, revision: 5, status: "authorized", order_no: "TEST-14", event_id: 9, replayed: false };
const paper = {
  issue: "TEST-14-9", issued: "2026-11-20T07:00:00+04:00", ready: false, can_finalize: true,
  snapshot: {
    order_no: "TEST-14", subject: "Synthetic trip", reference: "TEST", authorization: "Approved",
    employer: "Test company", branch: "Test branch", customer: null, assignments: [], legs: [],
  },
};
const fail = () => { throw new Error("Synthetic refresh failure"); };

beforeEach(() => {
  vi.resetAllMocks();
  mock.actor.mockResolvedValue({ profile: { id: 1, must_change_password: false }, isAccountActive: true });
  mock.claims.mockResolvedValue({ data: { claims: { sub: "synthetic-actor", session_id: "synthetic-session" } } });
  mock.render.mockReturnValue(Buffer.from("%PDF synthetic"));
  mock.publish.mockResolvedValue({ data: true, error: null });
  mock.rpc.mockImplementation(async (name: string) => ({
    data: name === "t07_fleet_trip_order" ? paper : receipt, error: null,
  }));
  vi.stubGlobal("fetch", mock.fetch);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("returns the confirmed command and publication when detail revalidation fails", async () => {
  mock.revalidate.mockImplementation((path: string) => { if (path.endsWith("/14")) fail(); });
  await expect(saveFleetOperation(command)).resolves.toEqual({ data: receipt, refreshFailed: true });
  expect(mock.publish).toHaveBeenCalledTimes(1);
  expect(mock.revalidate.mock.calls.map(([path]) => path)).toEqual([
    "/modules/fleet/operations", "/modules/fleet/operations/14", "/modules/fleet",
  ]);
});

it("keeps the direct printable PDF finalization confirmed after a refresh failure", async () => {
  mock.revalidate.mockImplementation(fail);
  await expect(finalizeTripOrder(14, 9)).resolves.toBe(true);
  expect(mock.publish).toHaveBeenCalledTimes(1);
});

it("retries an unpublished PDF through the exact operation and reuses a ready PDF", async () => {
  mock.publish.mockResolvedValueOnce({ data: false, error: null });
  await expect(saveFleetOperation(command)).resolves.toMatchObject({ uncertain: true });
  expect(mock.revalidate).not.toHaveBeenCalled();
  mock.rpc.mockResolvedValueOnce({ data: { ...receipt, replayed: true }, error: null })
    .mockResolvedValueOnce({ data: { ...paper, ready: true, can_finalize: false }, error: null });
  await expect(saveFleetOperation(command)).resolves.toMatchObject({ data: { ...receipt, replayed: true } });
  expect(mock.rpc.mock.calls[0]).toEqual(mock.rpc.mock.calls[2]);
  expect(mock.publish).toHaveBeenCalledTimes(1);
  expect(mock.render).toHaveBeenCalledTimes(1);
});

it("does not publish the PDF when the current actor cannot finish it", async () => {
  mock.rpc.mockResolvedValueOnce({ data: { ...paper, can_finalize: false }, error: null });
  await expect(finalizeTripOrder(14, 9)).resolves.toBe(false);
  expect(mock.publish).not.toHaveBeenCalled();
  expect(mock.revalidate).not.toHaveBeenCalled();
});

it("retries view navigation after a confirmed creation without making another command", async () => {
  mock.push.mockImplementationOnce(fail);
  render(<NewFleetOperation scopes={[{ company: 1, branch: 1, label: "Test branch" }]} />);
  fireEvent.submit(screen.getByRole("button", { name: "Create request" }).closest("form")!);
  fireEvent.click(await screen.findByRole("button", { name: "Retry refresh" }));
  await waitFor(() => expect(mock.push).toHaveBeenCalledTimes(2));
  expect(mock.rpc).toHaveBeenCalledTimes(1);
});

it("shows a confirmed reference after server invalidation fails and allows a refresh-only retry", async () => {
  mock.revalidate.mockImplementation((path: string) => { if (path.endsWith("/14")) fail(); });
  render(<NewFleetOperation scopes={[{ company: 1, branch: 1, label: "Test branch" }]} />);
  fireEvent.submit(screen.getByRole("button", { name: "Create request" }).closest("form")!);
  expect(await screen.findByText("Saved TEST-14. The view could not be refreshed.")).toBeTruthy();
  expect(mock.push).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Retry refresh" }));
  expect(mock.push).toHaveBeenCalledWith("/modules/fleet/operations/14");
  expect(mock.rpc).toHaveBeenCalledTimes(1);
});

it("retries client refresh after a successful PDF response without resubmitting publication", async () => {
  mock.fetch.mockResolvedValueOnce({ status: 204 });
  mock.refresh.mockImplementationOnce(fail);
  render(<FinishTripOrder order={14} issue={9} />);
  fireEvent.click(screen.getByRole("button", { name: "Finish issuing PDF" }));
  fireEvent.click(await screen.findByRole("button", { name: "Retry refresh" }));
  await waitFor(() => expect(mock.refresh).toHaveBeenCalledTimes(2));
  expect(mock.fetch).toHaveBeenCalledTimes(1);
});
