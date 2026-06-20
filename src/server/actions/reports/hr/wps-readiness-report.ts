/**
 * HR_WPS_READINESS — Report Fetcher
 * Phase: REPORT.4 — HR.11 Reports + Letters + Forms Library
 *
 * SECURITY: Does NOT expose IBAN, account number, or salary amounts.
 * Only readiness status, bank name, and flag fields.
 */
import type { ReportFetcher, ReportDataResult } from "@/lib/report-center/types";
import { createAdminClient } from "@/lib/supabase/admin";

export const wpsReadinessFetcher: ReportFetcher = {
  reportCode: "HR_WPS_READINESS",

  async fetch(filters: Record<string, unknown>): Promise<ReportDataResult> {
    const db = createAdminClient();

    let empQ = db
      .from("employees")
      .select(
        `id, employee_code, full_name_en, owner_company_id,
         owner_company:owner_companies(legal_name_en, company_code)`
      )
      .is("deleted_at", null)
      .eq("employee_status", "active");

    if (filters.owner_company_id) empQ = empQ.eq("owner_company_id", Number(filters.owner_company_id));
    if (filters.department_id) empQ = empQ.eq("department_id", Number(filters.department_id));

    const { data: employees } = await empQ.limit(2000);
    const empMap = new Map((employees ?? []).map((e) => [e.id, e]));
    const empIds = [...empMap.keys()];
    if (empIds.length === 0) return { columns: [], rows: [], meta: { total: 0 } };

    const { data: wpsProfiles } = await db
      .from("employee_wps_profiles")
      .select(
        `employee_id, wps_applicable, wps_status, salary_payment_method, labour_card_number,
         bank:banks(bank_name_en, bank_code)`
      )
      .in("employee_id", empIds)
      .is("deleted_at", null);

    const { data: holds } = await db
      .from("employee_payroll_holds")
      .select("employee_id, hold_status")
      .in("employee_id", empIds)
      .eq("hold_status", "active")
      .is("deleted_at", null);

    const holdSet = new Set((holds ?? []).map((h) => h.employee_id));
    const wpsMap = new Map((wpsProfiles ?? []).map((w) => [w.employee_id, w]));

    const rows = empIds.map((empId) => {
      const emp = empMap.get(empId)!;
      const wps = wpsMap.get(empId);
      const hasHold = holdSet.has(empId);

      const missingFields: string[] = [];
      if (!wps) missingFields.push("WPS Profile");
      else {
        if (!wps.salary_payment_method) missingFields.push("Payment Method");
        if (!wps.labour_card_number) missingFields.push("Labour Card No.");
        if (!wps.bank) missingFields.push("Bank");
      }

      const readinessStatus = !wps
        ? "not_setup"
        : missingFields.length > 0
        ? "incomplete"
        : hasHold
        ? "on_hold"
        : wps.wps_status === "active"
        ? "ready"
        : "inactive";

      return {
        employee_code: emp.employee_code,
        employee_name: emp.full_name_en,
        company: (emp.owner_company as unknown as { legal_name_en: string } | null)?.legal_name_en ?? "",
        bank_name: (wps?.bank as unknown as { bank_name_en: string } | null)?.bank_name_en ?? "",
        wps_applicable: wps?.wps_applicable ? "Yes" : "No",
        wps_status: wps?.wps_status ?? "not_setup",
        payment_method: wps?.salary_payment_method ?? "",
        missing_fields: missingFields.join(", "),
        hold_status: hasHold ? "On Hold" : "None",
        readiness_status: readinessStatus,
        owner_company_id: emp.owner_company_id,
        // IBAN and account number are intentionally omitted
      };
    });

    const ownerCompanyIds = [...new Set(rows.map((r) => r.owner_company_id as number).filter(Boolean))];

    if (filters.readiness_status) {
      return {
        columns: [
          "employee_code", "employee_name", "company", "bank_name",
          "wps_applicable", "wps_status", "payment_method",
          "missing_fields", "hold_status", "readiness_status",
        ],
        rows: rows.filter((r) => r.readiness_status === filters.readiness_status),
        meta: { total: rows.length, ownerCompanyIds },
      };
    }

    return {
      columns: [
        "employee_code", "employee_name", "company", "bank_name",
        "wps_applicable", "wps_status", "payment_method",
        "missing_fields", "hold_status", "readiness_status",
      ],
      rows,
      meta: { total: rows.length, ownerCompanyIds },
    };
  },
};


