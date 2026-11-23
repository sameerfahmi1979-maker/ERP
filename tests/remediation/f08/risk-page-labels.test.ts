import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  auth: vi.fn(),
  sessionTable: vi.fn(),
  serviceTable: vi.fn(),
}));

vi.mock("@/lib/rbac/check", () => ({
  getAuthContext: mock.auth,
  hasPermission: (ctx: { permissionCodes: string[] }, permission: string) =>
    ctx.permissionCodes.includes(permission),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: mock.sessionTable }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mock.serviceTable }),
}));

import { getRiskScores } from "@/server/actions/ai/common/risk-scoring";

const groups = [
  ["party", "parties", { display_name: "Party label" }],
  ["company", "owner_companies", { trade_name: null, legal_name_en: "Company label" }],
  ["branch", "branches", { branch_name_en: "Branch label" }],
  ["site", "work_sites", { site_name: "Site label" }],
  ["dms_document", "dms_documents", { document_no: "Document label", title: "Fallback" }],
] as const;

const inputRows = groups.flatMap(([type], group) =>
  Array.from({ length: 10 }, (_, index) => ({
    id: group * 10 + index + 1,
    entity_type: type,
    entity_id: index + 1,
    calculated_at: "2026-11-23T00:00:00Z",
    status: "calculated",
  })),
);

describe("Risk page entity label reads", () => {
  const labelQueries: Array<{ relation: string; ids: number[] }> = [];

  beforeEach(() => {
    vi.clearAllMocks();
    labelQueries.length = 0;
    mock.auth.mockResolvedValue({ profile: { id: 20 }, permissionCodes: ["ai.risk.view"], roleCodes: [] });
    mock.sessionTable.mockImplementation((relation) => {
      expect(relation).toBe("erp_ai_risk_scores");
      const query = {
        select: () => query,
        is: () => query,
        order: () => query,
        range: () => query,
        then: (resolve: (_: { data: typeof inputRows; count: number; error: null }) => void) =>
          resolve({ data: inputRows, count: 2001, error: null }),
      };
      return query;
    });
    mock.serviceTable.mockImplementation((relation: string) => ({
      select: () => {
        const group = groups.find(([, table]) => table === relation);
        if (!group) throw Error("Unexpected label relation.");
        const rows = (ids: number[]) => ids.map((id) => ({ id, ...group[2] }));
        return {
          eq: (_: string, id: number) => ({
            maybeSingle: async () => {
              labelQueries.push({ relation, ids: [id] });
              return { data: rows([id])[0], error: null };
            },
          }),
          in: async (_: string, ids: number[]) => {
            labelQueries.push({ relation, ids });
            return { data: rows(ids), error: null };
          },
        };
      },
    }));
  });

  it("labels only the returned 50 records in one read per source kind", async () => {
    const result = await getRiskScores({ limit: 50, offset: 1000 });
    expect(result.success).toBe(true);
    expect(result.data?.total).toBe(2001);
    expect(result.data?.rows.map(({ entityLabel }) => entityLabel)).toEqual(
      ["Party", "Company", "Branch", "Site", "Document"].flatMap((label) =>
        Array<string>(10).fill(label + " label"),
      ),
    );
    expect(mock.sessionTable).toHaveBeenCalledTimes(1);
    expect(labelQueries).toHaveLength(5);
    expect(labelQueries.map(({ ids }) => ids)).toEqual(
      groups.map(() => Array.from({ length: 10 }, (_, i) => i + 1)),
    );
  });

  it("does not resolve labels or even read the risk relation without permission", async () => {
    mock.auth.mockResolvedValue({ profile: { id: 20 }, permissionCodes: [], roleCodes: [] });
    expect((await getRiskScores({ limit: 50 })).success).toBe(false);
    expect(mock.sessionTable).not.toHaveBeenCalled();
    expect(mock.serviceTable).not.toHaveBeenCalled();
  });
});
