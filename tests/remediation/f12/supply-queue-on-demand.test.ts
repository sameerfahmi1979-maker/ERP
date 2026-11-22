import { beforeEach, describe, expect, it, vi } from "vitest";
import { SupplyPage } from "@/features/supply/supply-page";
import type { SupplyWorkspace } from "@/lib/supply/contracts";

const mock = vi.hoisted(() => ({ auth: vi.fn(), branches: vi.fn(), workspace: vi.fn(), queue: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("notFound"); } }));
vi.mock("@/features/operations/admin-overview", () => ({ OperationsAdminOverview: () => null }));
vi.mock("@/features/supply/supply-actions", () => ({ SupplyActions: () => null }));
vi.mock("@/lib/rbac/check", () => ({ getAuthContext: mock.auth }));
vi.mock("@/server/actions/inventory/stock-movements", () => ({
  listSupplyBranches: mock.branches, getSupplyWorkspace: mock.workspace, getSupplyActionQueue: mock.queue,
}));

const workspace: SupplyWorkspace = {
  branch: 22, name: "Authorized branch", rights: ["supply.purchase", "supply.approve"], company_setup: false,
  units: [], items: [], owners: [], bins: [], policies: [], demands: [],
};

beforeEach(() => {
  mock.auth.mockReset().mockResolvedValue({ profile: { id: 1 }, isAccountActive: true, permissionCodes: workspace.rights, roleAssignments: [] });
  mock.branches.mockReset().mockResolvedValue([{ id: 22, name: "Authorized branch", company: "Synthetic employer" }]);
  mock.workspace.mockReset().mockResolvedValue(workspace);
  mock.queue.mockReset().mockResolvedValue(null);
});

describe.each([
  { kind: "inventory", queue: "stock-review" }, { kind: "procurement", queue: "receiving" },
] as const)("$kind action queue", ({ kind, queue }) => {
  it("loads the branch workspace without reading unopened action choices", async () => {
    await SupplyPage({ kind, branch: "22" });
    expect(mock.workspace).toHaveBeenCalledWith(22, kind);
    expect(mock.queue).not.toHaveBeenCalled();
  });

  it("reads the exact existing FA03 queue for an explicit actionable page", async () => {
    await SupplyPage({ kind, branch: "22", queueSearch: "  retained  ", queuePage: "2" });
    expect(mock.queue.mock.calls).toEqual([[22, queue, "retained", 2]]);
  });

  it("does not read the queue when the branch is outside the current choices", async () => {
    await SupplyPage({ kind, branch: "23", queueSearch: "" });
    expect(mock.workspace).not.toHaveBeenCalled();
    expect(mock.queue).not.toHaveBeenCalled();
  });
});

