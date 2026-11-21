import { describe, expect, it } from "vitest";
import { fleetPayrollCandidates } from "@/lib/fleet/time-contract";

describe("Fleet Payroll handoff", () => {
  it("retains the exact source, rule and wage versions from the verified candidate", () => {
    const approved = "2026-11-19T12:00:00+00:00";
    const fingerprint = "a".repeat(64);
    const snapshot = {
      status: "ready", eligible: "{synthetic span}", review: 51, attendance_link: 61, employment: 71, day: "2026-10-03",
      attendance_links: [{ id: 61, attendance: 62, digest: fingerprint, approved_at: approved }],
      daily_attendance: [{ id: 62, digest: fingerprint, approved_at: approved }],
      calendar: { assignment: 91, assignment_revision: 2, regular_minutes: 480 },
      rule: 31, rule_revision: 2, rule_digest: fingerprint,
      wage: { profile: 81, revision: 3, currency: "AED", basis: 4500, salary_effect: 82, effect_digest: fingerprint,
        components: [{ id: 83, revision: 4, type: 84, amount: 1000 }] },
      rate: 45, multiplier: 2, monthly_hours: 200,
    };
    const candidate = { id: 1, work: 2, employee: 3, employment: 71, employer: 4, host: 5, date: "2026-10-03", minutes: 30,
      periods: "{synthetic span}", currency: "AED", amount: "22.50", rule: 31, available: approved, snapshot };
    expect(fleetPayrollCandidates.parse([candidate])[0].snapshot).toEqual(snapshot);
    expect(fleetPayrollCandidates.safeParse([{ ...candidate, snapshot: undefined }]).success).toBe(false);
  });
});
