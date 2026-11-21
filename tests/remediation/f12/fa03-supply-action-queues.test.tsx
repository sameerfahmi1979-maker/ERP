// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SupplyActions } from "@/features/supply/supply-actions";
import type { SupplyWorkspace } from "@/lib/supply/contracts";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next/form", () => ({ default: "form" }));
vi.mock("@/server/actions/inventory/stock-movements", () => ({ saveSupplyAction: vi.fn() }));
afterEach(cleanup);

const workspace: SupplyWorkspace = {
  branch: 920011, name: "Synthetic branch", rights: ["supply.purchase", "supply.approve"], company_setup: false,
  units: [{ id: 1, label: "EA", decimals: 0 }], items: [], owners: [], bins: [], policies: [], demands: [],
  purchases: [{ id: 99, label: "Recent history only", approved_at: "2026-11-20", quantity: 2, delivered: 0, item_id: 1, uom: 1, supplier: null }],
  reviews: [{ id: 98, label: "Decided history only", kind: "count", outcome: "approved", quantity: 1, movement_id: null }],
};

describe("FA03 Supply actions", () => {
  it("uses the paged Receiving results for its options and keeps branch and search in page links", () => {
    render(<SupplyActions workspace="procurement" data={workspace} queueView={{
      search: "old open", page: 2, open: true,
      result: { queue: "receiving", page: 2, pageSize: 25, totalCount: 51,
        rows: [{ id: 1, label: "Old open order", uom: 1, item: "Filter", quantity: 3, delivered: 1, remaining: 2, supplier: null }] },
    }} />);
    const options = within(screen.getByLabelText("Approved purchase line"));
    expect(options.getByRole("option", { name: /Old open order/ })).toBeTruthy();
    expect(options.queryByText("Recent history only")).toBeNull();
    expect(screen.getByText("Showing 26–26 of 51 matching records")).toBeTruthy();
    const next = screen.getByRole("link", { name: "Next" }).getAttribute("href");
    expect(next).toContain("branch=920011");
    expect(next).toContain("queueSearch=old+open");
    expect(next).toContain("queuePage=3");
  });

  it("uses only the pending review queue and distinguishes an unavailable read", () => {
    render(<SupplyActions workspace="inventory" data={workspace} queueView={{
      search: "", page: 1, open: false,
      result: { queue: "stock-review", page: 1, pageSize: 25, totalCount: 1,
        rows: [{ id: 7, label: "Older undecided review", item: "Filter", kind: "count", quantity: 2 }] },
    }} />);
    fireEvent.change(screen.getByLabelText("Choose an action"), { target: { value: "stock:decide" } });
    const options = within(screen.getByLabelText("Pending review"));
    expect(options.getByRole("option", { name: /Older undecided review/ })).toBeTruthy();
    expect(options.queryByText("Decided history only")).toBeNull();
    cleanup();
    render(<SupplyActions workspace="inventory" data={workspace} queueView={{ search: "", page: 1, open: true, result: null }} />);
    expect(screen.getByRole("alert").textContent).toContain("Actionable records could not be loaded");
    expect((screen.getByRole("button", { name: "Decide stock review" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
