import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SupplyPage } from "@/features/supply/supply-page";
import type { SupplyWorkspace } from "@/lib/supply/contracts";

const mock = vi.hoisted(() => ({ auth: vi.fn(), branches: vi.fn(), workspace: vi.fn(), queue: vi.fn(), history: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("notFound"); } }));
vi.mock("@/features/operations/admin-overview", () => ({ OperationsAdminOverview: () => null }));
vi.mock("@/features/supply/supply-actions", () => ({ SupplyActions: () => null }));
vi.mock("@/lib/rbac/check", () => ({ getAuthContext: mock.auth }));
vi.mock("@/server/actions/inventory/stock-movements", () => ({
  listSupplyBranches: mock.branches, getSupplyWorkspace: mock.workspace, getSupplyActionQueue: mock.queue,
  getSupplyReceiptHistory: mock.history,
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
  mock.history.mockReset().mockResolvedValue(null);
});

describe("procurement goods receipt history", () => {
  it("offers history without fetching full receipts on first open", async () => {
    const html = renderToStaticMarkup(await SupplyPage({ kind: "procurement", branch: "22" }));
    expect(mock.history).not.toHaveBeenCalled();
    expect(html).toContain("Open receipt history");
  });

  it("loads the requested late page and preserves the independent receiving queue filters", async () => {
    mock.history.mockResolvedValue({ branch: 22, page: 5, pageSize: 25, totalCount: 101, rows: [{
      id: 654, purchase_id: 15, label: "Retained goods receipt", delivered: 4, accepted: 1, rejected: 0, quarantined: 3,
      lot: null, serial: null, received_at: "2026-11-19T10:00:00Z", uom: 2, accepted_movement: 12, quarantine_movement: 13,
      inspections: [{ id: 30, outcome: "accepted", quantity: 2, movement: 31 }],
      returns: [{ id: 47, quantity: 1, movement: 48, reference: "previous return" }],
    }] });
    const html = renderToStaticMarkup(await SupplyPage({ kind: "procurement", branch: "22", queueSearch: "retain", queuePage: "2", receiptPage: "5" }));
    expect(mock.history.mock.calls).toEqual([[22, 5]]);
    expect(mock.queue.mock.calls).toEqual([[22, "receiving", "retain", 2]]);
    expect(html).toContain("Retained goods receipt");
    expect(html).toContain("Movement #31");
    expect(html).toContain("previous return");
    expect(html).toContain("Showing 101–101 of 101 receipts");
    expect(html).toContain("queueSearch=retain&amp;queuePage=2&amp;receiptPage=4");
    expect(html).not.toContain("receiptPage=6");
  });

  it("never calls history for an unauthorized branch or the inventory route", async () => {
    await SupplyPage({ kind: "procurement", branch: "23", receiptPage: "1" });
    await SupplyPage({ kind: "inventory", branch: "22", receiptPage: "1" });
    expect(mock.history).not.toHaveBeenCalled();
  });

  it("distinguishes a failed history read from an empty page and retains the retry page", async () => {
    const html = renderToStaticMarkup(await SupplyPage({ kind: "procurement", branch: "22", receiptPage: "2" }));
    expect(html).toContain("Goods receipt history could not be loaded.");
    expect(html).toContain("branch=22&amp;receiptPage=2");
    expect(html).not.toContain("No receipts in this branch.");
  });
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

