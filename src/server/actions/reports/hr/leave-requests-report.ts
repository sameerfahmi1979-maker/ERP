import type { ReportFetcher } from "@/lib/report-center/types";

export const leaveRequestsFetcher: ReportFetcher = {
  reportCode: "HR_LEAVE_REQUESTS",
  async fetch(filters, _permissions, db) {
    if (!db.readWorkforceLeave) throw new Error("The scoped leave report is unavailable.");
    const rows = await db.readWorkforceLeave("requests", filters);
    const ownerCompanyIds = [...new Set(rows.map(row => Number(row.owner_company_id)))];
    return {
      columns: [
        "employee_code", "employee_name", "company", "leave_type", "request_ref", "request_date",
        "start_date", "end_date", "total_days", "overlap_days", "allocated_days", "paid_allocated_days",
        "allocation_scope", "approval_status", "approved_by", "approved_at",
      ],
      rows,
      meta: { total: rows.length, ownerCompanyIds },
    };
  },
};
