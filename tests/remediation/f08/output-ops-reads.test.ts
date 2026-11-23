import { beforeEach, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  opsEnabled: true,
  permitted: true,
  rpc: vi.fn(),
  healthy: vi.fn(async () => true),
  direct: vi.fn(() => { throw new Error("unscoped issuance transport"); }),
}));

vi.mock("@/lib/output/feature-flags", () => ({ isOutputOpsConsoleEnabled: () => dependencies.opsEnabled }));
vi.mock("@/lib/rbac/check", () => ({ getAuthContext: async () => ({ profile: { id: 7 }, roleCodes: ["system_admin"] }), hasPermission: () => dependencies.permitted }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: dependencies.rpc, from: dependencies.direct }) }));
vi.mock("@/lib/pdf/gotenberg", () => ({ isGotenbergHealthy: dependencies.healthy }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: dependencies.direct }));
vi.mock("@/server/actions/output/recover-official-document", () => ({ recoverOfficialDocument: vi.fn() }));
vi.mock("@/server/actions/audit", () => ({ logAudit: vi.fn() }));

import { getOpsIssuanceDetail, getOpsMetrics, listOpsIssuances } from "@/server/actions/output/ops-console";

beforeEach(() => {
  vi.clearAllMocks();
  dependencies.opsEnabled = true;
  dependencies.permitted = true;
});

it("uses one scoped read and preserves an exact count on a terminal page", async () => {
  dependencies.rpc.mockResolvedValue({ data: { rows: [], total: 2420 }, error: null });
  await expect(listOpsIssuances({ page: 101, pageSize: 25, ownerCompanyId: 7, search: " synthetic% " })).resolves.toMatchObject({
    success: true, data: { rows: [], total: 2420 },
  });
  expect(dependencies.rpc).toHaveBeenCalledExactlyOnceWith("speed_output_ops_read", {
    p_mode: "list", p_input: { page: 101, pageSize: 25, ownerCompanyId: 7, search: "synthetic" },
  });
  expect(dependencies.direct).not.toHaveBeenCalled();
});

it("uses the projected scoped detail and fails with a generic message for absence or denial", async () => {
  dependencies.rpc.mockResolvedValue({ data: null, error: { message: "PRIVATE DATABASE DETAIL" } });
  expect(await getOpsIssuanceDetail(559)).toMatchObject({ success: false, error: "Issuance not found or access denied." });
  expect(dependencies.rpc).toHaveBeenCalledExactlyOnceWith("speed_output_ops_read", { p_mode: "detail", p_input: { id: 559 } });
  expect(dependencies.direct).not.toHaveBeenCalled();
});

it("preserves exact totals independently of bounded queues and a restricted schedule summary", async () => {
  const summary = {
    stateCounts: { issued: 2001, pending: 21 }, issuedLast24h: 2001, failedLast24h: 0, avgRenderMsLast24h: null,
    stuckInFlight: [], stuckCount: 21, reconciliationRequired: [], reconciliationCount: 0, voidedSerials: 0, scheduleRuns: null,
  };
  dependencies.rpc.mockResolvedValue({ data: summary, error: null });
  expect(await getOpsMetrics()).toEqual({ success: true, data: { ...summary, rendererHealthy: true } });
  expect(dependencies.rpc).toHaveBeenCalledExactlyOnceWith("speed_output_ops_read", { p_mode: "metrics", p_input: {} });
  expect(dependencies.direct).not.toHaveBeenCalled();
});

it("reports a failed summary as unavailable instead of zero", async () => {
  dependencies.rpc.mockResolvedValue({ data: null, error: { message: "PRIVATE DATABASE DETAIL" } });
  expect(await getOpsMetrics()).toEqual({ success: false, error: "Output operations metrics could not be verified." });
});

it("rejects a response containing privileged worker metrics", async () => {
  dependencies.rpc.mockResolvedValue({ data: {
    stateCounts: { issued: 1 }, issuedLast24h: 1, failedLast24h: 0, avgRenderMsLast24h: null,
    stuckInFlight: [], stuckCount: 0, reconciliationRequired: [], reconciliationCount: 0, voidedSerials: 0,
    scheduleRuns: { retryable: 0, terminal: 1, succeededLast24h: 0,
      terminalRecent: [{ id: 33, schedule_id: 45, failure_reason: "SYNTHETIC_WORKER_DETAIL", finished_at: null }] },
  }, error: null });
  expect(await getOpsMetrics()).toEqual({ success: false, error: "Output operations metrics could not be verified." });
  expect(dependencies.healthy).not.toHaveBeenCalled();
});

it.each(["disabled", "denied"])("performs no reads when %s", async condition => {
  dependencies.opsEnabled = condition !== "disabled";
  dependencies.permitted = condition !== "denied";
  expect(await listOpsIssuances({})).toMatchObject({ success: false });
  expect(await getOpsIssuanceDetail(559)).toMatchObject({ success: false });
  expect(await getOpsMetrics()).toMatchObject({ success: false });
  expect(dependencies.rpc).not.toHaveBeenCalled();
  expect(dependencies.healthy).not.toHaveBeenCalled();
});
