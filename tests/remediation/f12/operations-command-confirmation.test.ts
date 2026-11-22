import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveRecovery } from "@/server/actions/hr/recoveries";
import { saveSupplyAction } from "@/server/actions/inventory/stock-movements";
import { saveJobWork } from "@/server/actions/workshop/labour";
import { saveWorkshopAction } from "@/server/actions/workshop/workshop";

const mock = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }));
vi.mock("@/lib/rbac/check", () => ({ getAuthContext: mock.auth, canUseApplication: (actor: { profile: unknown }) => !!actor.profile }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mock.rpc }) }));

const nonce = "381ef4d5-70e9-4f8a-9149-1103fb181803";
const reason = "Synthetic command";
const supply = { nonce, parent: 22, family: "purchase", action: "receive", data: { purchase: 1, reason } };
const workshop = { nonce, asset: 7, action: "report", data: { reason } };
const maintenance = { nonce, asset: 7, action: "reading", data: { reason } };
const outside = { nonce, parent: 11, family: "outside", action: "prepare", data: { reason } };
const review = { nonce, parent: 16, family: "hr", action: "accept", data: { reason, digest: "a".repeat(64) } };
const recovery = () => {
  const form = new FormData();
  form.set("reason", reason);
  form.set("policy", "22");
  return saveRecovery("approve-policy", 22, nonce, form);
};

const cases = [
  { name: "Supply receipt", execute: () => saveSupplyAction(supply), data: { id: 5, replayed: false }, first: "/modules/inventory", last: "/modules/fleet/fuel" },
  { name: "Workshop report", execute: () => saveWorkshopAction(workshop), data: { assessment: 3, job: null, cycle: null, state: "waiting-assessment", replayed: false }, first: "/modules/workshop", last: "/modules/fleet/7" },
  { name: "maintenance reading", execute: () => saveWorkshopAction(maintenance), data: { id: 8, clock: null, reminder_active: null, replayed: false }, first: "/modules/workshop", last: "/modules/fleet/7" },
  { name: "outside work", execute: () => saveJobWork(outside), data: { id: 20, job: 11, revision: 21, state: "draft", finance_receipt: null, replayed: false }, first: "/modules/workshop", last: "/modules/workshop/job-work/11" },
  { name: "Workshop HR acceptance", execute: () => saveJobWork(review), data: { id: 24, version: 16, day: "2026-11-22", eligible_minutes: 60, replayed: false }, first: "/modules/workshop", last: "/modules/workshop/job-work/[id]" },
  { name: "Workshop assignment", execute: () => saveJobWork({ ...outside, family: "labour", action: "assign" }),
    data: { id: 18, assignment: 18, decision: null, minutes: null, cost_status: null, replayed: false },
    first: "/modules/workshop", last: "/modules/workshop/job-work/11" },
  { name: "Workshop cost rate", execute: () => saveJobWork({ ...outside, family: "rate", action: "approve" }),
    data: { id: 21, replayed: false }, first: "/modules/workshop", last: "/modules/workshop/job-work/[id]" },
  { name: "Workshop labour correction", execute: () => saveJobWork({ ...outside, family: "correction", action: "approve" }),
    data: { id: 27, day: "2026-11-22", replayed: false }, first: "/modules/workshop", last: "/modules/workshop/job-work/[id]" },
  { name: "Recovery policy approval", execute: recovery, data: { id: 22, target: 22, action: "approve-policy", replayed: false }, first: "/admin/hr/operations/recoveries", last: "/admin/hr/operations/recoveries" },
];

beforeEach(() => {
  mock.auth.mockReset().mockResolvedValue({ profile: { id: 1 } });
  mock.rpc.mockReset();
  mock.revalidate.mockReset();
});

describe.each(cases)("$name", ({ execute, data, first, last }) => {
  it("keeps the database receipt confirmed when invalidation throws and attempts every affected page", async () => {
    mock.rpc.mockResolvedValue({ data, error: null });
    mock.revalidate.mockImplementation((path: string) => { if (path === first) throw new Error("Synthetic invalidation failure"); });
    await expect(execute()).resolves.toMatchObject({ ok: true, receipt: data, refreshFailed: true });
    expect(mock.rpc).toHaveBeenCalledTimes(1);
    expect(mock.revalidate.mock.calls.map(([path]) => path)).toContain(last);
  });

  it("leaves a malformed receipt unconfirmed without invalidating", async () => {
    mock.rpc.mockResolvedValue({ data: {}, error: null });
    await expect(execute()).resolves.toMatchObject({ ok: false, uncertain: true });
    expect(mock.revalidate).not.toHaveBeenCalled();
  });

  it("keeps the original RPC arguments on a receipt replay", async () => {
    mock.rpc.mockRejectedValueOnce(new Error("Synthetic response interruption"))
      .mockResolvedValueOnce({ data: { ...data, replayed: true }, error: null });
    await expect(execute()).resolves.toMatchObject({ ok: false, uncertain: true });
    await expect(execute()).resolves.toMatchObject({ ok: true, receipt: { ...data, replayed: true } });
    expect(mock.rpc.mock.calls[0]).toEqual(mock.rpc.mock.calls[1]);
  });
});

it("classifies a scoped database denial without invalidating or confirming a receipt", async () => {
  mock.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "Current role denied by fixture" } });
  await expect(saveJobWork(review)).resolves.toMatchObject({ ok: false, uncertain: false });
  expect(mock.revalidate).not.toHaveBeenCalled();
});

it("revalidates the Job Work child page after a material request", async () => {
  mock.rpc.mockResolvedValue({ data: { id: 31, replayed: false }, error: null });
  await expect(saveSupplyAction({ nonce, family: "stock", parent: 22, action: "demand", data: { job: 11, reason } }))
    .resolves.toMatchObject({ ok: true });
  expect(mock.revalidate.mock.calls.map(([path]) => path)).toContain("/modules/workshop/job-work/11");
});


it("recovers a failed refresh with current route admission and without dispatching a command", async () => {
  mock.auth.mockResolvedValue({ profile: { id: 1 }, permissionCodes: ["workshop.outside.manage"] });
  const { refreshOperationsCommand } = await import("@/server/actions/operations/command-refresh");
  await expect(refreshOperationsCommand({ kind: "job-work", job: 11 })).resolves.toBe(true);
  expect(mock.revalidate.mock.calls.map(([path]) => path)).toContain("/modules/workshop/job-work/11");
  expect(mock.rpc).not.toHaveBeenCalled();
});

it("rejects an unavailable current scope or a caller-supplied refresh path", async () => {
  mock.auth.mockResolvedValue({ profile: { id: 1 }, permissionCodes: [] });
  const { refreshOperationsCommand } = await import("@/server/actions/operations/command-refresh");
  await expect(refreshOperationsCommand({ kind: "job-work", job: 11 })).resolves.toBe(false);
  await expect(refreshOperationsCommand({ kind: "recovery", path: "/" })).resolves.toBe(false);
  expect(mock.revalidate).not.toHaveBeenCalled();
  expect(mock.rpc).not.toHaveBeenCalled();
});

it("rejects a Recovery receipt for a different command or a child receipt for a different job", async () => {
  mock.rpc.mockResolvedValueOnce({
    data: { id: 22, target: 23, action: "approve-policy", replayed: false }, error: null,
  }).mockResolvedValueOnce({
    data: { id: 20, job: 12, revision: 21, state: "draft", finance_receipt: null, replayed: false }, error: null,
  });
  await expect(recovery()).resolves.toMatchObject({ ok: false, uncertain: true });
  await expect(saveJobWork(outside)).resolves.toMatchObject({ ok: false, uncertain: true });
  expect(mock.revalidate).not.toHaveBeenCalled();
});

it("validates Recovery allocations and reversals against the original receipt or allocation", async () => {
  const form = new FormData();
  form.set("reason", reason);
  form.set("amount", "50.25");
  form.set("receipt", "93");
  form.set("pin", "22");
  form.set("schedule", "5");
  form.set("month", "2026-11-01");
  form.set("line", "381ef4d5-70e9-4f8a-9149-1103fb181805");
  form.set("allocation", "38");
  const allocation = { id: 38, receipt_id: 93, pin_id: 22, amount: 50.25, unallocated: 0, replayed: false };
  const reversal = { id: 39, receipt_id: 93, pin_id: 22, amount: 50.25, reverses_allocation_id: 38, replayed: false };

  mock.rpc.mockResolvedValueOnce({ data: allocation, error: null })
    .mockResolvedValueOnce({ data: reversal, error: null })
    .mockResolvedValueOnce({ data: { ...reversal, reverses_allocation_id: 37 }, error: null });
  await expect(saveRecovery("allocate", 19, nonce, form)).resolves.toMatchObject({ ok: true, receipt: allocation });
  await expect(saveRecovery("reverse", 19, nonce, form)).resolves.toMatchObject({ ok: true, receipt: reversal });
  await expect(saveRecovery("reverse", 19, nonce, form)).resolves.toMatchObject({ ok: false, uncertain: true });
  expect(mock.revalidate).toHaveBeenCalledTimes(2);
});
