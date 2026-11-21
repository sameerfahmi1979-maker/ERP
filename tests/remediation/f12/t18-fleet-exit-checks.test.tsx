
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FleetExitChecks } from "@/features/fleet/exit-checks";

const scope = { company: 11, branch: 12, label: "Alliance / Yard" };
const task = {
  eos_id: 425, employee_id: 72, commitment_id: 9, asset_id: 15, asset_title: "FLT-15 Pool car",
  status: "active" as const, revision: 1, planned_return: "2026-11-20T08:00:00Z",
  managed_by_operation: false, owning_operation: null,
};

describe("Fleet exit return checks", () => {
  it("links physical returns and managed assignments to the owning workflows", () => {
    const html = renderToStaticMarkup(<FleetExitChecks scopes={[scope]} branch={12} query="fleet" page={2}
      tasks={[task, { ...task, eos_id: 426, commitment_id: 10, asset_id: 16, asset_title: "FLT-16 Rental",
        managed_by_operation: true, owning_operation: 83 }]} />);
    expect(html).toContain("Exit return checks");
    expect(html).toContain("Alliance / Yard");
    expect(html).toContain('name="exitBranch"');
    expect(html).toContain("FLT-15 Pool car");
    expect(html).toContain('href="/modules/fleet/15#custody"');
    expect(html).toContain('href="/modules/fleet/operations/83"');
    expect(html).not.toContain('href="/modules/fleet/16#custody"');
    expect(html).not.toContain("eos_id");
    expect(html).not.toContain("employee_id");
  });

  it("shows a failed read separately from an empty check list", () => {
    const controls = { scopes: [scope], branch: 12, query: "", page: 1 };
    const unavailable = renderToStaticMarkup(<FleetExitChecks {...controls} tasks={null} />);
    const empty = renderToStaticMarkup(<FleetExitChecks {...controls} tasks={[]} />);
    expect(unavailable).toContain('role="alert"');
    expect(unavailable).toContain("Return checks could not be loaded");
    expect(empty).toContain("No exit returns due for this branch.");
  });
});
