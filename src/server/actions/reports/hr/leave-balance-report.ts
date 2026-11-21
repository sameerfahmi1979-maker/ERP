import type { ReportFetcher } from "@/lib/report-center/types";

export const leaveBalanceFetcher: ReportFetcher = {
  reportCode: "HR_LEAVE_BALANCE",
  async fetch(filters, _permissions, db) {
    if (!db.readWorkforceLeave) throw new Error("The scoped leave report is unavailable.");
    const rows = await db.readWorkforceLeave("balances", filters);
    const ownerCompanyIds = [...new Set(rows.map(row => Number(row.owner_company_id)))];
    return {
      columns: [
        "employee_code", "employee_name", "company", "leave_type", "period_start", "period_end",
        "entitled_days", "carry_forward", "used_days", "recorded_balance_days", "verified_available_days",
        "pending_reservation_days", "balance_status", "as_of_date",
      ],
      rows,
      meta: { total: rows.length, ownerCompanyIds },
    };
  },
};
