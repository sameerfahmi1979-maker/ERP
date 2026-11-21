import { describe, expect, it } from "vitest";
import { attendanceWorkedFacts } from "@/lib/hr/time/worked-facts";
import { attendanceSummaryFetcher } from "@/server/actions/reports/hr/attendance-summary-report";
import { leaveBalanceFetcher } from "@/server/actions/reports/hr/leave-balance-report";
import { leaveRequestsFetcher } from "@/server/actions/reports/hr/leave-requests-report";
import type { ReportReadClient } from "@/lib/report-center/scoped-read-client";

function leaveReader(read: NonNullable<ReportReadClient["readWorkforceLeave"]>): ReportReadClient {
  return {
    readWorkforceLeave: read,
    from: () => { throw new Error("The report must use the scoped leave collection"); },
  };
}
describe("T19 workforce report facts", () => {
  it("preserves an explicit zero and the unknown or unverified recorded attendance states", () => {
    expect(attendanceWorkedFacts(0, 0)).toEqual({ minutes: 0, hours: 0, state: "Verified" });
    expect(attendanceWorkedFacts(8, null)).toEqual({ minutes: null, hours: 8, state: "Recorded only" });
    expect(attendanceWorkedFacts(null, null)).toEqual({ minutes: null, hours: null, state: "Unknown" });
    expect(attendanceWorkedFacts(6.5, 391)).toEqual({ minutes: 391, hours: 6.52, state: "Verified" });
  });

  it("keeps recorded, verified and reserved balance fields distinct in report output", async () => {
    const rows = [{ employee_code: "S001", owner_company_id: 1, recorded_balance_days: 7,
      verified_available_days: null, pending_reservation_days: null, balance_status: "Recorded only" },
    { employee_code: "S002", owner_company_id: 1, recorded_balance_days: null,
      verified_available_days: 0, pending_reservation_days: 2, balance_status: "Verified" }];
    const db = leaveReader(async (kind, filters) => {
      expect(kind).toBe("balances");
      expect(filters).toEqual({ owner_company_id: 1 });
      return rows;
    });
    const result = await leaveBalanceFetcher.fetch({ owner_company_id: 1 }, [], db);
    expect(result.columns).toEqual(expect.arrayContaining(["recorded_balance_days", "verified_available_days", "pending_reservation_days", "balance_status"]));
    expect(result.rows).toEqual(rows);
    expect(result.meta).toEqual({ total: 2, ownerCompanyIds: [1] });
  });

  it("reports overlap and an exact or unavailable allocation without treating unknown as zero", async () => {
    const rows = [{ employee_code: "S001", owner_company_id: 1, start_date: "2026-11-05", end_date: "2026-11-15",
      overlap_days: 2, allocated_days: null, allocation_scope: "Not verified" },
    { employee_code: "S002", owner_company_id: 1, start_date: "2026-11-07", end_date: "2026-11-14",
      overlap_days: 2, allocated_days: 0, allocation_scope: "Posted" }];
    const filters = { date_from: "2026-11-10", date_to: "2026-11-11" };
    const db = leaveReader(async (kind, received) => {
      expect(kind).toBe("requests");
      expect(received).toEqual(filters);
      return rows;
    });
    const result = await leaveRequestsFetcher.fetch(filters, [], db);
    expect(result.columns).toEqual(expect.arrayContaining(["overlap_days", "allocated_days", "allocation_scope"]));
    expect(result.rows).toEqual(rows);
  });

  it("renders overnight Dubai punches, the dated shift and missing work distinctly", async () => {
    const fields = { employee_code: "S001", employee_name: "Synthetic", owner_company_id: 1, worked_minutes: null,
      first_in_at: "2026-07-04T18:00:00Z", last_out_at: "2026-07-05T00:31:00Z", is_missing_punch: false,
      attendance_date: "2026-07-04", shift_name: "Evening", shift_context: "Dated assignment", as_of_date: "2026-07-05" };
    const filters = { owner_company_id: 1, branch_id: 2 };
    const db: ReportReadClient = {
      from: () => { throw new Error("Attendance requires the sealed collected source"); },
      async readWorkforceAttendance(criteria) {
        expect(criteria).toEqual(filters);
        return [{ ...fields, total_hours: 6.52, worked_minutes: 391 },
          { ...fields, first_in_at: null, last_out_at: null, total_hours: null }];
      },
    };
    const result = await attendanceSummaryFetcher.fetch(filters, [], db);
    expect(result.rows[0]).toMatchObject({ shift_name: "Evening", worked_fact: "Verified",
      first_in: "2026-07-04 22:00", last_out: "2026-07-05 04:31", worked_minutes: 391 });
    expect(result.rows[1]).toMatchObject({ total_hours: null, worked_fact: "Unknown" });
  });

  it("fails closed when the authorized collection is unavailable", async () => {
    const db = leaveReader(async () => { throw new Error("Report unavailable"); });
    await expect(leaveBalanceFetcher.fetch({}, [], db)).rejects.toThrow("Report unavailable");
  });
});
