
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fineFleetCommand, scopeFineBranches } from "@/lib/fleet/fine-contract";
import { readFleetFineBranches, readFleetFines, saveFleetFine } from "@/server/actions/fleet/fines";

const mock = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/rbac/check", async () => ({
  ...await import("@/lib/rbac/scope"), getAuthContext: mock.auth,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mock.rpc }) }));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }));

const operation = "c4bf5df3-eae8-4aa6-b534-8fde9b19dcc2";
const original = { document: 11, version: 12, file: 13 };
const match = { operation, target: 92, action: "match-custody", data: { revision: 4 } };
const verify = { operation, target: 92, action: "verify-driver", data: {
  revision: 4, employee: 52, evidence: original, reason: "Compared signed handover and trip log",
} };
const matchAssignment = { roleId: 7, roleCode: "fleet_analyst", ownerCompanyId: 9, branchId: 2,
  permissionCodes: ["fleet.fines.match"] };
const branches = [
  { id: 2, owner_company_id: 9, branch_name: "Exact branch" },
  { id: 3, owner_company_id: 9, branch_name: "Sibling" },
  { id: 4, owner_company_id: 10, branch_name: "Another company" },
];

beforeEach(() => {
  mock.auth.mockReset().mockResolvedValue({ isAccountActive: true, profile: {}, roleAssignments: [matchAssignment] });
  mock.rpc.mockReset();
  mock.revalidate.mockReset();
});

describe("Fleet fines", () => {
  it("distinguishes a custody candidate from a driver confirmation with an exact original", () => {
    expect(fineFleetCommand.parse(verify)).toEqual(verify);
    expect(fineFleetCommand.safeParse({ ...match, data: { revision: 4, employee: 52 } }).success).toBe(false);
    expect(fineFleetCommand.safeParse({ ...verify, data: { ...verify.data, evidence: { document: 11 } } }).success).toBe(false);
  });

  it("keeps exact ordinary branch choices and rejects inherited administrator capabilities", () => {
    expect(scopeFineBranches(branches, [matchAssignment, {
      ...matchAssignment, roleCode: "company_admin", branchId: null,
    }])).toEqual([branches[0]]);
  });

  it("uses transactional reads for exact branch pages and rejects malicious paging input", async () => {
    const branch = { id: 2, owner_company_id: 9, branch_name_en: "Exact branch", branch_code: "EX" };
    const workspace = {
      company_id: 9, branch_id: 2, cases: [], incidents: [], assessments: [], assets: [],
      evidence_choices: [], next_before: null, can_record: false, can_match: true, can_verify: false,
      can_intake_damage: false, can_link: false,
    };
    mock.rpc.mockResolvedValueOnce({ error: null, data: [branch, { ...branch, id: 3 }] })
      .mockResolvedValueOnce({ error: null, data: workspace });
    await expect(readFleetFineBranches()).resolves.toEqual([branch]);
    await expect(readFleetFines(2, 194)).resolves.toEqual(workspace);
    await expect(readFleetFines(2, -1)).resolves.toBeNull();
    expect(mock.rpc.mock.calls).toEqual([
      ["t13_fleet_scopes", {}], ["t13_fleet_workspace_page", { p_branch: 2, p_before: 194 }],
    ]);
  });

  it("reports a scoped authorization denial as final and leaves the form available", async () => {
    mock.rpc.mockResolvedValue({ error: { code: "42501" } });
    await expect(saveFleetFine(match)).resolves.toMatchObject({ ok: false, uncertain: false });
    expect(mock.revalidate).not.toHaveBeenCalled();
  });

  it("uses the original operation ID on retry and refreshes only after the database confirms it", async () => {
    mock.rpc.mockRejectedValueOnce(new Error("local request interrupted"))
      .mockResolvedValueOnce({ error: null, data: { id: 92, replayed: true } });
    await expect(saveFleetFine(match)).resolves.toMatchObject({ ok: false, uncertain: true });
    await expect(saveFleetFine(match)).resolves.toEqual({ ok: true, id: 92, replayed: true });
    expect(mock.rpc.mock.calls.map(call => call[1].p_operation)).toEqual([operation, operation]);
    expect(mock.revalidate).toHaveBeenCalledWith("/modules/fleet/fines");
  });
});

