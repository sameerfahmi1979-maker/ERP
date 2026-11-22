import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FleetPayrollPage from "@/app/(protected)/admin/hr/payroll/fleet-time/page";
import TripAllowancesPage from "@/app/(protected)/admin/hr/payroll/trip-allowances/page";

const mock = vi.hoisted(() => ({ auth: vi.fn(), companies: vi.fn(), fleetWork: vi.fn(), fleetCandidates: vi.fn(), trips: vi.fn(), tripCandidates: vi.fn() }));
vi.mock("next/link", () => ({ default: "a" }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("notFound"); } }));
vi.mock("@/lib/rbac/check", () => ({ getAuthContext: mock.auth, canUseApplication: (actor: { profile: unknown }) => !!actor.profile }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: () => ({ select: () => ({ in: mock.companies }) }) }) }));
vi.mock("@/features/fleet/time-workspace", () => ({ FleetPayrollReview: () => null }));
vi.mock("@/features/fleet/asset-form", () => ({ fleetSelectClass: "select" }));
vi.mock("@/server/actions/fleet/rental-time", () => ({ readFleetPayrollQueue: mock.fleetWork, readFleetPayrollCandidates: mock.fleetCandidates }));
vi.mock("@/server/actions/fleet/trip-allowances", () => ({ readAllowancePayrollOrders: mock.trips, readTripAllowanceCandidates: mock.tripCandidates }));

const rows = Array.from({ length: 26 }, (_, index) => ({
  id: 100 - index, work: 500 - index, number: "TRIP-" + index, subject: "Synthetic subject",
  date: "2026-11-22", employee: 1, minutes: 60, amount: 5, currency: "AED", kind: "loaded", actual: 3,
}));
const day = "2026-11-22";
const now = "2026-11-22T14:08:40.371Z";
const DubaiNow = "2026-11-22T18:08:40.371";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(now));
  mock.auth.mockReset().mockResolvedValue({ profile: { id: 1 }, roleAssignments: [{
    ownerCompanyId: 22, permissionCodes: ["hr.payroll.fleet_time.review", "hr.payroll.trip_allowance.review"],
  }] });
  mock.companies.mockReset().mockResolvedValue({ data: [{ id: 22, trade_name: "Scope 22" }] });
  for (const reader of [mock.fleetWork, mock.fleetCandidates, mock.trips, mock.tripCandidates]) reader.mockReset().mockResolvedValue(rows);
});
afterEach(() => vi.useRealTimers());

function link(markup: string, label: string) {
  const href = [...markup.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].find(([, , text]) => text === label)?.[1];
  if (!href) throw new Error("Missing pagination link " + label);
  return new URL(href.replaceAll("&amp;", "&"), "http://127.0.0.1");
}

describe.each([
  { name: "Fleet overtime", route: FleetPayrollPage, work: mock.fleetWork, candidates: mock.fleetCandidates, label: "More work", cursor: "476" },
  { name: "Trip allowance", route: TripAllowancesPage, work: mock.trips, candidates: mock.tripCandidates, label: "More trips", cursor: "76" },
])("$name review query", ({ route, work, candidates, label, cursor }) => {
  it("preserves the selected company, date, cutoff and companion cursor in each page link", async () => {
    const html = renderToStaticMarkup(await route({ searchParams: Promise.resolve({ company: "22", day, cutoff: "2026-11-22T16:37", before: "80", older: "90" }) }));
    expect(Object.fromEntries(link(html, label).searchParams)).toEqual({
      company: "22", day, cutoff: "2026-11-22T16:37", before: cursor, older: "90",
    });
    expect(Object.fromEntries(link(html, "Older candidates").searchParams)).toEqual({
      company: "22", day, cutoff: "2026-11-22T16:37", before: "80", older: "76",
    });
    expect(work).toHaveBeenCalledWith(22, day, 80);
    expect(candidates).toHaveBeenCalledWith(22, "2026-11-22T16:37:00+04:00", 90);
  });

  it("freezes the initial cutoff instant across navigation", async () => {
    const html = renderToStaticMarkup(await route({ searchParams: Promise.resolve({ day }) }));
    expect(candidates).toHaveBeenCalledWith(22, now, undefined);
    const next = link(html, "Older candidates");
    expect(next.searchParams.get("cutoff")).toBe(DubaiNow);

    vi.setSystemTime(new Date("2026-11-22T14:30:00.000Z"));
    await route({ searchParams: Promise.resolve(Object.fromEntries(next.searchParams)) });
    expect(candidates).toHaveBeenLastCalledWith(22, DubaiNow + "+04:00", 76);
  });

  it("rejects an unrelated employer before either read", async () => {
    await expect(route({ searchParams: Promise.resolve({ company: "23", day }) })).rejects.toThrow("notFound");
    expect(work).not.toHaveBeenCalled();
    expect(candidates).not.toHaveBeenCalled();
  });
});

