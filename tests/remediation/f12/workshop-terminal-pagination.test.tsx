import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import WorkshopJobIndex from "@/app/(protected)/modules/workshop/job-work/page";
import { listWorkshopWork } from "@/server/actions/workshop/labour";

const mock = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn() }));
vi.mock("next/link", () => ({ default: "a" }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("notFound"); } }));
vi.mock("@/lib/rbac/check", () => ({ getAuthContext: mock.auth, canUseApplication: (actor: { profile: unknown }) => !!actor.profile }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mock.rpc }) }));
vi.mock("@/features/operations/admin-overview", () => ({ OperationsAdminOverview: () => null }));

const model = (start: number, count: number) => Array.from({ length: count }, (_, index) => ({
  id: start - index * 10, assessment_id: 4, cycle: index + 1, state: "open",
  asset_no: "T-1", asset_name: "Synthetic truck", title: "Synthetic job " + (start - index * 10),
}));
const page = (before?: string) =>
  WorkshopJobIndex({ searchParams: Promise.resolve({ before }) }).then(renderToStaticMarkup);

beforeEach(() => {
  mock.auth.mockReset().mockResolvedValue({
    isAccountActive: true, profile: { id: 7 }, permissionCodes: ["workshop.jobs.manage"], roleAssignments: [],
  });
  mock.rpc.mockReset();
});

it("renders the full 40-row terminal page without an empty next destination", async () => {
  const rows = model(400, 40);
  mock.rpc.mockImplementation(async (name: string) => ({ error: null, data: name === "t12_job_work_index" ? rows : { rows, next_before: null } }));
  const markup = await page("411");
  expect(markup).toContain("Synthetic job 400");
  expect(markup).toContain("Synthetic job 10");
  expect(markup).not.toContain("Older job cards");
  expect(mock.rpc.mock.calls).toEqual([["fa_workshop_job_index_page", { p_before: 411 }, { get: true }]]);
});

it("links from the last visible ID and retains the first older job on the next page", async () => {
  const first = model(410, 40);
  const last = model(10, 1);
  mock.rpc.mockImplementation(async (name: string, params: { p_before?: number }) => {
    const rows = params.p_before ? last : first;
    return { error: null, data: name === "t12_job_work_index" ? rows : { rows, next_before: params.p_before ? null : 20 } };
  });
  const initial = await page();
  expect(initial).toContain("before=20");
  expect(initial).toContain("Synthetic job 20");
  expect(initial).not.toContain("Synthetic job 10 · open");
  const older = await page("20");
  expect(older).toContain("Synthetic job 10");
  expect(older).not.toContain("Older job cards");
});

it("rejects a mismatched cursor, an out-of-range row or unordered responses", async () => {
  const rows = model(410, 40);
  mock.rpc.mockResolvedValueOnce({ error: null, data: { rows, next_before: 19 } })
    .mockResolvedValueOnce({ error: null, data: { rows, next_before: 20 } })
    .mockResolvedValueOnce({ error: null, data: { rows: [rows[1], rows[0]], next_before: null } });
  await expect(listWorkshopWork()).resolves.toBeNull();
  await expect(listWorkshopWork(410)).resolves.toBeNull();
  await expect(listWorkshopWork()).resolves.toBeNull();
});

it("keeps unavailable or scoped-denied readers explicit without calling the legacy function", async () => {
  mock.rpc.mockResolvedValue({ error: { code: "PGRST202" }, data: null });
  expect(await page()).toContain("Job cards could not be loaded.");
  expect(mock.rpc.mock.calls.map(([name]) => name)).toEqual(["fa_workshop_job_index_page"]);
  mock.auth.mockResolvedValue({ isAccountActive: true, profile: { id: 7 }, permissionCodes: [], roleAssignments: [] });
  await expect(page()).rejects.toThrow("notFound");
  expect(mock.rpc).toHaveBeenCalledTimes(1);
});

