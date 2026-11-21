import type { ReportFetcher } from "@/lib/report-center/types";
import { formatDubaiPunch } from "@/lib/dubai-calendar";
import { attendanceWorkedFacts } from "@/lib/hr/time/worked-facts";
import { z } from "zod";

const rowSchema = z.object({
  employee_code: z.string(), employee_name: z.string(), owner_company_id: z.number(),
  total_hours: z.number().nullable(), worked_minutes: z.number().nullable(),
  first_in_at: z.string().nullable(), last_out_at: z.string().nullable(), is_missing_punch: z.boolean().nullable(),
}).passthrough();

export const attendanceSummaryFetcher: ReportFetcher = {
  reportCode: "HR_ATTENDANCE_SUMMARY",
  async fetch(filters, _permissions, db) {
    if (!db.readWorkforceAttendance) throw new Error("The scoped attendance report is unavailable.");
    const checked = z.array(rowSchema).parse(await db.readWorkforceAttendance(filters));
    const rows = checked.map(row => {
      const { total_hours, worked_minutes, first_in_at, last_out_at, is_missing_punch, ...datesAndScope } = row;
      const worked = attendanceWorkedFacts(total_hours, worked_minutes);
      return {
        ...datesAndScope,
        first_in: formatDubaiPunch(first_in_at),
        last_out: formatDubaiPunch(last_out_at),
        total_hours: worked.hours,
        worked_minutes: worked.minutes,
        worked_fact: worked.state,
        missing_punch: is_missing_punch === null ? "Unknown" : is_missing_punch ? "Yes" : "No",
      };
    });
    return {
      columns: [
        "employee_code", "employee_name", "company", "department", "attendance_date", "attendance_type",
        "shift_name", "shift_context", "first_in", "last_out", "total_hours", "worked_minutes", "worked_fact",
        "late_minutes", "early_out_minutes", "missing_punch", "approval_status", "work_site", "as_of_date",
      ],
      rows,
      meta: { total: rows.length, ownerCompanyIds: [...new Set(rows.map(row => row.owner_company_id))] },
    };
  },
};
