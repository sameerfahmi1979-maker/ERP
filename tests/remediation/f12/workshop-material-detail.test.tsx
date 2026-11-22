import { renderToReadableStream } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import JobWorkDetail from "@/app/(protected)/modules/workshop/job-work/[id]/page";

const mock = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), labour: vi.fn(), outside: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("notFound"); } }));
vi.mock("next/link", () => ({ default: "a" }));
vi.mock("@/lib/rbac/check", () => ({ getAuthContext: mock.auth, canUseApplication: (actor: { profile: unknown }) => !!actor.profile }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mock.rpc }) }));
vi.mock("@/server/actions/workshop/labour", () => ({ readWorkshopLabour: mock.labour, readWorkshopOutside: mock.outside }));
vi.mock("@/features/workshop/job-labour", () => ({ JobLabour: () => <p>Authorized labour pane</p> }));
vi.mock("@/features/workshop/job-outside", () => ({ JobOutside: () => <p>Authorized outside pane</p> }));
vi.mock("@/features/supply/action-form", () => ({
  SupplyForm: ({ constants }: { constants: { job: number } }) => <p>Material request for job {constants.job}</p>,
}));

const parsedWorkspace = {
  job: 123, branch: 3, cycle: 1, revision: 4, active: true, can_request: true,
  inventory: true, procurement: false, stock_route: true, purchasing_route: true,
  items: [{ id: 5, label: "Synthetic brake pads", unit_id: 6 }],
  units: [{ id: 6, label: "EA" }], owners: [{ id: 7, label: "Synthetic stock owner" }], demands: [],
};
const renderPage = () => JobWorkDetail({ params: Promise.resolve({ id: "123" }) });
async function html() {
  const stream = await renderToReadableStream(await renderPage());
  return new Response(stream).text();
}
beforeEach(() => {
  mock.auth.mockReset().mockResolvedValue({ profile: { id: 1 }, permissionCodes: ["workshop.jobs.manage"] });
  mock.rpc.mockReset();
  mock.labour.mockReset().mockResolvedValue(null);
  mock.outside.mockReset().mockResolvedValue(null);
});

describe("Workshop Job Work Material", () => {
  it("uses the same authorized workspace for the page and its Material section", async () => {
    mock.rpc.mockResolvedValue({ data: parsedWorkspace, error: null });

    const rendered = await html();
    expect(rendered).toContain("No material requests for this job cycle.");
    expect(rendered).toMatch(/Material request for job (?:<!-- -->)?123/);
    expect(rendered).toContain("/modules/inventory?branch=3");
    expect(rendered).not.toContain("Open Procurement");
    expect(mock.rpc.mock.calls).toEqual([["t12_material_workspace", { p_job: 123 }, { get: true }]]);
  });

  it("renders historical demand rows and keeps unavailable transactions masked", async () => {
    const demand = {
      id: 51, label: "Synthetic material request", source_line: "WORK-001", source_revision: 2,
      owner: "Synthetic owner", uom: "EA", created_at: "2026-11-12T10:00:00Z", requested: 3, reserved: 0, issued: 3,
      returned: 0, reversed: 0, remaining: 0, reservations: [], adjustments: [],
      corrections: [],
      movements: [{ id: 9, kind: "issue", quantity: 3, at: "2026-11-13T10:00:00Z",
        reference: null, valuation: "verified", amount: null, currency: null }],
      purchases: [],
    };
    mock.rpc.mockResolvedValue({ data: { ...parsedWorkspace, active: false, can_request: false, demands: [demand] }, error: null });

    const rendered = await html();
    expect(rendered).toContain("Synthetic material request");
    expect(rendered).toContain("Finance value verified");
    expect(rendered).not.toContain("Material request for job");
    expect(mock.rpc).toHaveBeenCalledTimes(1);
  });

  it.each([
    { data: null, error: null },
    { data: null, error: { code: "42501" } },
    { data: { ...parsedWorkspace, job: 999 }, error: null },
  ])("keeps a missing, denied or mismatched Material result outside an authorized sibling pane", async (response) => {
    mock.outside.mockResolvedValue({ job: 123 });
    mock.rpc.mockResolvedValue(response);

    const rendered = await html();
    expect(rendered).toContain("Authorized outside pane");
    expect(rendered).not.toContain("No material requests for this job cycle.");
    expect(rendered).not.toContain("Material request for job");
    expect(mock.rpc).toHaveBeenCalledTimes(1);
  });

  it("returns not found when no scoped Job Work pane is available", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: null });
    await expect(renderPage()).rejects.toThrow("notFound");
    expect(mock.rpc).toHaveBeenCalledTimes(1);
  });

  it("does not read the material workspace without route admission", async () => {
    mock.auth.mockResolvedValue({ profile: { id: 1 }, permissionCodes: [] });
    await expect(renderPage()).rejects.toThrow("notFound");
    expect(mock.rpc).not.toHaveBeenCalled();
  });
});

