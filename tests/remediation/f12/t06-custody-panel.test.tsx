import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { FleetCustodyPanel } from "@/features/fleet/custody-panel";
import type { CustodyWorkspace } from "@/lib/fleet/custody-contract";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/server/actions/fleet/custody", () => ({
  checkFleetAvailability: vi.fn(), findFleetCustodyAt: vi.fn(), getCustodyChoices: vi.fn(), saveFleetCustody: vi.fn(),
}));
vi.mock("@/server/actions/fleet/assets", () => ({ saveFleetAsset: vi.fn() }));

it("renders the physical custody dates and flags independently under the Fleet workspace", () => {
  const workspace: CustodyWorkspace = {
    asset: 1, asset_no: "FLT-TEST", asset_name: "Synthetic Pool Car", company: 2, category: "light_vehicle",
    can_manage: true, can_plan: true, can_approve: false, can_hse: false, can_workshop: false, can_policy: false,
    policies: [], policy_choices: null, signed_choices: [], loans: [],
    commitments: [{
      id: 3, kind: "custody", status: "active", revision: 1, employee: 4, employee_name: "Synthetic Employee",
      site: 5, site_name: "Synthetic Yard", from: "2026-11-18T05:00:00Z", planned_return: "2026-11-18T07:00:00Z",
      actual_return: null, overdue: true, assigned_driver: null, events: [],
    }],
    holds: [
      { id: 6, kind: "workshop", placed_at: "2026-11-18T05:30:00Z", released_at: null, reason: null },
      { id: 7, kind: "hse", placed_at: "2026-11-18T05:40:00Z", released_at: null, reason: null },
    ],
  };
  const html = renderToStaticMarkup(<FleetCustodyPanel workspace={workspace} choices={{ workers: [], sites: [] }} />);
  for (const label of ["Custody and availability", "Workshop hold", "HSE hold", "Overdue", "Actual handover", "Planned return"]) {
    expect(html).toContain(label);
  }
  expect(html).toContain("Record actual return");
  expect(html).not.toContain("Release one hold");
});
