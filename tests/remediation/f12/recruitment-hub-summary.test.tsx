import type { AnchorHTMLAttributes } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RecruitmentHubPage from "@/app/(protected)/admin/hr/recruitment/page";
import type { AuthContext } from "@/lib/rbac/check";
import { getRecruitmentSummary } from "@/server/actions/hr/recruitment";
import { readRecruitmentSummary } from "@/server/reads/hr-recruitment-summary";

const state = vi.hoisted(() => ({ auth: vi.fn(), client: vi.fn() }));
vi.mock("@/lib/rbac/check", async (original) => ({
  ...await original<typeof import("@/lib/rbac/check")>(),
  getAuthContext: state.auth,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: state.client }));
vi.mock("@/components/erp/hr-reports-menu", () => ({ HrReportsMenu: () => null }));
vi.mock("next/link", () => ({
  default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} />,
}));
vi.mock("next/navigation", () => ({
  redirect: (target: string) => { throw new Error(target); },
}));

const actor = {
  profile: { id: 15, must_change_password: false },
  email: null,
  isAccountActive: true,
  accountStatus: "active",
  permissionCodes: ["hr.recruitment.view"],
  roleCodes: ["synthetic_recruiter"],
  roleAssignments: [{ roleId: 16, roleCode: "synthetic_recruiter", ownerCompanyId: 1, branchId: 10, permissionCodes: ["hr.recruitment.view"] }],
} as AuthContext;

type Row = Record<string, string | number | null>;
type SelectOptions = { count?: string; head?: boolean };
type CountFailure = { count: number | null; error: unknown };

function database(rows: Record<string, Row[]> = {}, failures: Record<string, CountFailure> = {}) {
  return vi.fn((table: string) => ({
    select: (_columns: string, options?: SelectOptions) => {
      const filters: ((row: Row) => boolean)[] = [];
      const query = {
        is(column: string, value: null) {
          filters.push((row) => row[column] === value);
          return query;
        },
        eq(column: string, value: string) {
          filters.push((row) => row[column] === value);
          return query;
        },
        in(column: string, values: string[]) {
          filters.push((row) => values.includes(String(row[column])));
          return query;
        },
        gte(column: string, instant: string) {
          filters.push((row) => Date.parse(String(row[column])) >= Date.parse(instant));
          return query;
        },
        lt(column: string, instant: string) {
          filters.push((row) => Date.parse(String(row[column])) < Date.parse(instant));
          return query;
        },
        then(resolve: (value: { count: number | null; data: Row[] | null; error: unknown }) => void) {
          const matching = (rows[table] ?? []).filter((row) => filters.every((filter) => filter(row)));
          resolve({
            count: options?.count === "exact" ? matching.length : null,
            data: options?.head ? null : matching.slice(0, 1_000),
            error: null,
            ...failures[table],
          });
        },
      };
      return query;
    },
  }));
}

const interview = (interview_datetime: string, interview_status = "scheduled", deleted_at: string | null = null): Row => ({
  interview_datetime, interview_status, deleted_at,
});
const conversion = (converted_at: string): Row => ({ converted_at });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-31T20:05:00Z"));
  state.auth.mockResolvedValue(actor);
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe("Recruitment Hub metrics", () => {
  it("counts the Sunday-to-Sunday week and reporting month at the Dubai UTC rollover", async () => {
    state.client.mockResolvedValue({ from: database({
      hr_interviews: [
        interview("2026-10-31T19:59:59Z"),
        interview("2026-10-31T20:00:00Z"),
        interview("2026-11-01T04:00:00Z"),
        interview("2026-11-07T19:59:59Z"),
        interview("2026-11-07T20:00:00Z"),
        interview("2026-11-08T06:00:00Z"),
        interview("2026-11-03T07:00:00Z", "cancelled"),
        interview("2026-11-03T07:00:00Z", "scheduled", "2026-11-02T00:00:00Z"),
      ],
      employee_recruitment_links: [
        conversion("2026-10-31T19:59:59Z"),
        conversion("2026-10-31T20:00:00Z"),
        conversion("2026-11-30T19:59:59Z"),
        conversion("2026-11-30T20:00:00Z"),
        conversion("2026-12-01T00:00:00Z"),
      ],
    }) });

    await expect(readRecruitmentSummary({}, actor)).resolves.toMatchObject({
      success: true, data: { interviews_this_week: 3, conversions_this_month: 2 },
    });
  });

  it("bounds conversions across the Dubai December-to-January transition", async () => {
    vi.setSystemTime(new Date("2026-12-31T19:59:59Z"));
    state.client.mockResolvedValue({ from: database({ employee_recruitment_links: [
      conversion("2026-11-30T20:00:00Z"),
      conversion("2026-12-31T19:59:59Z"),
      conversion("2026-12-31T20:00:00Z"),
      conversion("2027-01-05T00:00:00Z"),
    ] }) });

    await expect(readRecruitmentSummary({}, actor)).resolves.toMatchObject({
      success: true, data: { conversions_this_month: 2 },
    });
  });

  it("uses exact database totals on the hub action beyond the row cap", async () => {
    state.client.mockResolvedValue({ from: database({
      hr_job_requisitions: Array.from({ length: 1_006 }, (_, index) => ({
        id: index + 1, deleted_at: null, requisition_status: index < 1_001 ? "open" : "closed",
      })),
      hr_candidates: Array.from({ length: 1_010 }, (_, index) => ({
        id: index + 1, deleted_at: null, candidate_status: index < 1_004 ? "new" : "rejected",
      })),
    }) });

    await expect(getRecruitmentSummary()).resolves.toMatchObject({ success: true, data: {
      total_requisitions: 1_006, open_requisitions: 1_001, total_candidates: 1_010, active_candidates: 1_004,
    } });
  });

  it.each([
    { count: 0, error: { message: "synthetic private provider detail" } },
    { count: null, error: null },
  ])("renders an explicit retry when counts cannot be verified (%o)", async (failure) => {
    state.client.mockResolvedValue({ from: database({}, { hr_interviews: failure }) });

    const html = renderToStaticMarkup(await RecruitmentHubPage());
    expect(html).toContain('role="alert"');
    expect(html).toContain("Recruitment summary could not be loaded");
    expect(html).toContain('href="/admin/hr/recruitment"');
    expect(html).toContain('href="/admin/hr/recruitment/interviews"');
    expect(html).not.toContain("synthetic private provider detail");
    expect(html).not.toContain("Conversions (Month)");
  });

  it("renders verified zero counts with ordinary navigation and no failure notice", async () => {
    state.client.mockResolvedValue({ from: database() });

    const html = renderToStaticMarkup(await RecruitmentHubPage());
    expect(html).toContain('class="text-2xl font-bold">0</p>');
    expect(html).toContain("Conversions (Month)");
    expect(html).not.toContain('role="alert"');
  });

  it("denies unauthorized or inactive callers before contacting the database", async () => {
    const unauthorized = { ...actor, permissionCodes: [], roleAssignments: [] };
    state.auth.mockResolvedValue(unauthorized);
    await expect(RecruitmentHubPage()).rejects.toThrow("/access-denied");
    await expect(readRecruitmentSummary({}, { ...actor, isAccountActive: false })).resolves.toMatchObject({ success: false });
    expect(state.client).not.toHaveBeenCalled();
  });
});
