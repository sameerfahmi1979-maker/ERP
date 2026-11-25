import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  auth: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  head: vi.fn(),
}));

vi.mock("@/lib/rbac/check", () => ({
  getAuthContext: mock.auth,
  hasGlobalPermission: (ctx: { globalPermissionCodes: string[] }, permission: string) =>
    ctx.globalPermissionCodes.includes(permission),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: mock.rpc, from: mock.from }),
}));

import { getRiskScoreSummary } from "@/server/actions/ai/common/risk-scoring";
import { getComplianceFindingSummary } from "@/server/actions/ai/common/compliance-checker";
import { getDuplicateCandidateSummary } from "@/server/actions/ai/common/duplicate-detection";

const cases = [
  ["risk", "ai.risk.view", getRiskScoreSummary, { critical: 0, high: 500, stale: 600, unreviewed: 700 }],
  ["compliance", "ai.compliance.view", getComplianceFindingSummary, { open: 0, critical: 0, high: 0, waivedResolved: 700 }],
  ["duplicate", "ai.duplicates.view", getDuplicateCandidateSummary, { pending: 501, highConfidence: 500, confirmed: 0, ignoredResolved: 0 }],
] as const;

describe("AI grouped authorized card counts", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mock.from.mockImplementation((relation: string) => {
      if (relation === "erp_ai_feature_flags") {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({
          data: { is_enabled: false }, error: null,
        }) }) }) };
      }
      const query = {
        select: () => query,
        eq: () => query,
        is: () => query,
        in: () => query,
        or: () => query,
        gte: () => query,
        then: (resolve: (_: object) => void) => Promise.resolve(mock.head()).then(resolve),
      };
      return query;
    });
    mock.head.mockReturnValue({ count: 0, error: null });
  });

  it.each(cases)("reads %s through one exact aggregate while preserving disabled and zero", async (kind, permission, read, counts) => {
    mock.auth.mockResolvedValue({ profile: { id: 20 }, globalPermissionCodes: [permission] });
    mock.rpc.mockResolvedValue({ data: counts, error: null });
    expect(await read()).toEqual({ success: true, data: { ...counts, featureEnabled: false } });
    expect(mock.rpc).toHaveBeenCalledExactlyOnceWith("erp_ai_summary_counts", { p_kind: kind });
    expect(mock.from).toHaveBeenCalledExactlyOnceWith("erp_ai_feature_flags");
    expect(mock.head).not.toHaveBeenCalled();
  });

  it("retains independent unavailable and zero states when the grouped read is unavailable", async () => {
    mock.auth.mockResolvedValue({ profile: { id: 20 }, globalPermissionCodes: ["ai.risk.view"] });
    mock.rpc.mockResolvedValue({ data: { critical: 0 }, error: null });
    mock.head.mockReturnValueOnce({ count: null, error: { message: "test read failure" } });
    expect(await getRiskScoreSummary()).toEqual({
      success: true, data: { critical: null, high: 0, stale: 0, unreviewed: 0, featureEnabled: false },
    });
    expect(mock.head).toHaveBeenCalledTimes(4);
  });

  it.each([
    [400, "42501"],
    [401, "PGRST301"],
    [403, "permission_denied"],
  ])("reports unavailable without falling back after authorization failure %s %s", async (status, code) => {
    mock.auth.mockResolvedValue({ profile: { id: 20 }, globalPermissionCodes: ["ai.risk.view"] });
    mock.rpc.mockResolvedValue({ data: null, status, error: { code } });
    expect(await getRiskScoreSummary()).toEqual({
      success: true, data: { critical: null, high: null, stale: null, unreviewed: null, featureEnabled: false },
    });
    expect(mock.head).not.toHaveBeenCalled();
  });

  it("keeps branch-only capacity outside global counts", async () => {
    mock.auth.mockResolvedValue({ profile: { id: 20 }, globalPermissionCodes: [], permissionCodes: ["ai.risk.view"] });
    expect(await getRiskScoreSummary()).toMatchObject({ success: false });
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(mock.from).not.toHaveBeenCalled();
  });
});
