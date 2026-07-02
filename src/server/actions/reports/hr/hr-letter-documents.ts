/**
 * HR Letters / Certificates / Forms — Data Fetchers
 * Phase: REPORT.4 — HR.11 Reports + Letters + Forms Library
 *
 * Each letter fetcher returns a single-row result with all variables
 * needed to render the document template.
 *
 * SECURITY:
 * - HR_SALARY_CERT_WITH_AMOUNT requires hr.payroll.view
 * - HR_NOC masks passport number
 * - All letters require employee_id filter
 */
import type { ReportFetcher, ReportDataResult } from "@/lib/report-center/types";
import { createAdminClient } from "@/lib/supabase/admin";

// ─────────────────────────────────────────────────────────────────────────────
// Shared helper: load employee base data
// ─────────────────────────────────────────────────────────────────────────────

async function loadEmployeeBase(employeeId: number) {
  const db = createAdminClient();
  const { data, error } = await db
    .from("employees")
    .select(
      `id, employee_code, full_name_en, full_name_ar, joining_date, employee_status,
       owner_company_id,
       owner_company:owner_companies!employees_owner_company_id_fkey(id, legal_name_en, legal_name_ar, company_code),
       branch:branches(branch_name_en),
       department:departments(department_name_en),
       designation:designations(designation_name_en, designation_name_ar),
       employment_type:hr_employment_types(name_en)`
    )
    .eq("id", employeeId)
    .is("deleted_at", null)
    .single();
  if (error) throw new Error(`Employee query failed: ${error.message}`);
  if (!data) throw new Error("Employee not found");
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// HR_EXPERIENCE_LETTER
// ─────────────────────────────────────────────────────────────────────────────

export const experienceLetterFetcher: ReportFetcher = {
  reportCode: "HR_EXPERIENCE_LETTER",

  async fetch(filters: Record<string, unknown>): Promise<ReportDataResult> {
    const employeeId = filters.employee_id ? Number(filters.employee_id) : null;
    if (!employeeId) throw new Error("employee_id is required");

    const emp = await loadEmployeeBase(employeeId);
    const company = emp.owner_company as unknown as { legal_name_en: string } | null;

    // Find last_working_date from EOS cases if employee left
    const db = createAdminClient();
    const { data: eos } = await db
      .from("employee_eos_cases")
      .select("last_working_date")
      .eq("employee_id", employeeId)
      .in("case_status", ["approved", "completed"])
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1);

    const lastWorkingDate = eos?.[0]?.last_working_date ?? null;

    const row = {
      employee_name: emp.full_name_en,
      employee_code: emp.employee_code,
      designation: (emp.designation as unknown as { designation_name_en: string } | null)?.designation_name_en ?? "",
      department: (emp.department as unknown as { department_name_en: string } | null)?.department_name_en ?? "",
      joining_date: emp.joining_date,
      last_working_date: lastWorkingDate ?? "",
      company_name: company?.legal_name_en ?? "",
      generated_date: new Date().toISOString().split("T")[0],
      owner_company_id: emp.owner_company_id,
    };

    return {
      columns: Object.keys(row).filter((k) => k !== "owner_company_id"),
      rows: [row],
      meta: { letter_type: "experience_letter", ownerCompanyIds: [emp.owner_company_id] },
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// HR_SALARY_CERT_GENERAL
// ─────────────────────────────────────────────────────────────────────────────

export const salaryCertGeneralFetcher: ReportFetcher = {
  reportCode: "HR_SALARY_CERT_GENERAL",

  async fetch(filters: Record<string, unknown>): Promise<ReportDataResult> {
    const employeeId = filters.employee_id ? Number(filters.employee_id) : null;
    if (!employeeId) throw new Error("employee_id is required");

    const emp = await loadEmployeeBase(employeeId);
    const company = emp.owner_company as unknown as { legal_name_en: string } | null;

    const row = {
      employee_name: emp.full_name_en,
      employee_code: emp.employee_code,
      designation: (emp.designation as unknown as { designation_name_en: string } | null)?.designation_name_en ?? "",
      department: (emp.department as unknown as { department_name_en: string } | null)?.department_name_en ?? "",
      company_name: company?.legal_name_en ?? "",
      employment_type: (emp.employment_type as unknown as { name_en: string } | null)?.name_en ?? "",
      joining_date: emp.joining_date,
      generated_date: new Date().toISOString().split("T")[0],
      certificate_body: `This is to certify that ${emp.full_name_en} is employed with ${company?.legal_name_en ?? "the company"} as ${(emp.designation as unknown as { designation_name_en: string } | null)?.designation_name_en ?? "staff"} since ${emp.joining_date}.`,
      owner_company_id: emp.owner_company_id,
    };

    return {
      columns: ["employee_name", "employee_code", "designation", "department", "company_name", "employment_type", "joining_date", "generated_date", "certificate_body"],
      rows: [row],
      meta: { letter_type: "salary_cert_general", ownerCompanyIds: [emp.owner_company_id] },
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// HR_SALARY_CERT_WITH_AMOUNT
// ─────────────────────────────────────────────────────────────────────────────

export const salaryCertWithAmountFetcher: ReportFetcher = {
  reportCode: "HR_SALARY_CERT_WITH_AMOUNT",

  async fetch(filters: Record<string, unknown>, permissionCodes: string[]): Promise<ReportDataResult> {
    if (!permissionCodes.includes("hr.payroll.view")) {
      throw new Error("You do not have permission to generate salary certificates with amounts. Requires hr.payroll.view.");
    }

    const employeeId = filters.employee_id ? Number(filters.employee_id) : null;
    if (!employeeId) throw new Error("employee_id is required");

    const emp = await loadEmployeeBase(employeeId);
    const company = emp.owner_company as unknown as { legal_name_en: string } | null;
    const db = createAdminClient();

    const { data: payroll } = await db
      .from("employee_payroll_profiles")
      .select("gross_salary, basic_salary, currency")
      .eq("employee_id", employeeId)
      .is("deleted_at", null)
      .limit(1);

    const profile = payroll?.[0];

    const row = {
      employee_name: emp.full_name_en,
      employee_code: emp.employee_code,
      designation: (emp.designation as unknown as { designation_name_en: string } | null)?.designation_name_en ?? "",
      company_name: company?.legal_name_en ?? "",
      joining_date: emp.joining_date,
      basic_salary: profile?.basic_salary ?? 0,
      gross_salary: profile?.gross_salary ?? 0,
      currency: profile?.currency ?? "AED",
      generated_date: new Date().toISOString().split("T")[0],
      owner_company_id: emp.owner_company_id,
    };

    return {
      columns: ["employee_name", "employee_code", "designation", "company_name", "joining_date", "basic_salary", "gross_salary", "currency", "generated_date"],
      rows: [row],
      meta: { letter_type: "salary_cert_with_amount", ownerCompanyIds: [emp.owner_company_id], sensitive: true },
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// HR_NOC
// ─────────────────────────────────────────────────────────────────────────────

export const nocFetcher: ReportFetcher = {
  reportCode: "HR_NOC",

  async fetch(filters: Record<string, unknown>): Promise<ReportDataResult> {
    const employeeId = filters.employee_id ? Number(filters.employee_id) : null;
    if (!employeeId) throw new Error("employee_id is required");

    const emp = await loadEmployeeBase(employeeId);
    const company = emp.owner_company as unknown as { legal_name_en: string } | null;
    const db = createAdminClient();

    // Fetch passport number (masked)
    const { data: idDocs } = await db
      .from("employee_identity_documents")
      .select("document_number")
      .eq("employee_id", employeeId)
      .eq("document_type", "passport")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1);

    const passportRaw = idDocs?.[0]?.document_number ?? null;
    const passportMasked = passportRaw
      ? passportRaw.slice(0, 2) + "****" + passportRaw.slice(-2)
      : "[Not on record]";

    const row = {
      employee_name: emp.full_name_en,
      employee_code: emp.employee_code,
      designation: (emp.designation as unknown as { designation_name_en: string } | null)?.designation_name_en ?? "",
      company_name: company?.legal_name_en ?? "",
      passport_number_masked: passportMasked,
      purpose: (filters.purpose as string) ?? "",
      generated_date: new Date().toISOString().split("T")[0],
      owner_company_id: emp.owner_company_id,
    };

    return {
      columns: ["employee_name", "employee_code", "designation", "company_name", "passport_number_masked", "purpose", "generated_date"],
      rows: [row],
      meta: { letter_type: "noc", ownerCompanyIds: [emp.owner_company_id] },
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// HR_EMPLOYEE_ID_CARD
// ─────────────────────────────────────────────────────────────────────────────

export const employeeIdCardFetcher: ReportFetcher = {
  reportCode: "HR_EMPLOYEE_ID_CARD",

  async fetch(filters: Record<string, unknown>): Promise<ReportDataResult> {
    const employeeId = filters.employee_id ? Number(filters.employee_id) : null;
    if (!employeeId) throw new Error("employee_id is required");

    const emp = await loadEmployeeBase(employeeId);
    const company = emp.owner_company as unknown as { legal_name_en: string; company_code: string } | null;

    const row = {
      employee_code: emp.employee_code,
      employee_name: emp.full_name_en,
      designation: (emp.designation as unknown as { designation_name_en: string } | null)?.designation_name_en ?? "",
      department: (emp.department as unknown as { department_name_en: string } | null)?.department_name_en ?? "",
      company_name: company?.legal_name_en ?? "",
      company_code: company?.company_code ?? "",
      generated_date: new Date().toISOString().split("T")[0],
      owner_company_id: emp.owner_company_id,
    };

    return {
      columns: ["employee_code", "employee_name", "designation", "department", "company_name", "company_code", "generated_date"],
      rows: [row],
      meta: { letter_type: "id_card", ownerCompanyIds: [emp.owner_company_id] },
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// HR_PPE_ISSUE_FORM
// ─────────────────────────────────────────────────────────────────────────────

export const ppeIssueFormFetcher: ReportFetcher = {
  reportCode: "HR_PPE_ISSUE_FORM",

  async fetch(filters: Record<string, unknown>): Promise<ReportDataResult> {
    const employeeId = filters.employee_id ? Number(filters.employee_id) : null;
    if (!employeeId) throw new Error("employee_id is required");

    const emp = await loadEmployeeBase(employeeId);
    const db = createAdminClient();

    const { data: ppeItems } = await db
      .from("employee_ppe_issues")
      .select("ppe_item_name, ppe_category, quantity, issue_date, condition_at_issue, issued_by_profile:profiles!issued_by(display_name)")
      .eq("employee_id", employeeId)
      .eq("ppe_status", "issued")
      .is("deleted_at", null)
      .order("issue_date", { ascending: false })
      .limit(50);

    const rows = (ppeItems ?? []).map((p) => ({
      employee_code: emp.employee_code,
      employee_name: emp.full_name_en,
      ppe_item: p.ppe_item_name,
      ppe_category: p.ppe_category ?? "",
      quantity: p.quantity ?? 1,
      issue_date: p.issue_date,
      condition: p.condition_at_issue ?? "",
      issued_by: (p.issued_by_profile as unknown as { display_name: string } | null)?.display_name ?? "",
      signature_placeholder: "[_______________________]",
      owner_company_id: emp.owner_company_id,
    }));

    return {
      columns: ["employee_code", "employee_name", "ppe_item", "ppe_category", "quantity", "issue_date", "condition", "issued_by", "signature_placeholder"],
      rows: rows.length ? rows : [{ employee_code: emp.employee_code, employee_name: emp.full_name_en, ppe_item: "No items", ppe_category: "", quantity: 0, issue_date: "", condition: "", issued_by: "", signature_placeholder: "", owner_company_id: emp.owner_company_id }],
      meta: { letter_type: "ppe_issue_form", ownerCompanyIds: [emp.owner_company_id] },
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// HR_JOINING_CHECKLIST
// ─────────────────────────────────────────────────────────────────────────────

export const joiningChecklistFetcher: ReportFetcher = {
  reportCode: "HR_JOINING_CHECKLIST",

  async fetch(filters: Record<string, unknown>): Promise<ReportDataResult> {
    const employeeId = filters.employee_id ? Number(filters.employee_id) : null;
    if (!employeeId) throw new Error("employee_id is required");

    const emp = await loadEmployeeBase(employeeId);

    const checklistItems = [
      { item: "Employee Profile Created", area: "HR" },
      { item: "Identity Documents Uploaded", area: "Compliance" },
      { item: "Bank / WPS Profile Setup", area: "Payroll" },
      { item: "WPS Readiness Confirmed", area: "Payroll" },
      { item: "Primary Work Site Assignment", area: "Operations" },
      { item: "DMS Required Documents Uploaded", area: "DMS" },
      { item: "Orientation / Induction Completed", area: "HR" },
      { item: "PPE Issued (if applicable)", area: "Safety" },
      { item: "IT Access & Asset Issued", area: "IT" },
      { item: "Emergency Contact Recorded", area: "HR" },
    ];

    const rows = checklistItems.map((item) => ({
      employee_code: emp.employee_code,
      employee_name: emp.full_name_en,
      joining_date: emp.joining_date,
      area: item.area,
      checklist_item: item.item,
      status: "[ ] Pending",
      remarks: "",
      owner_company_id: emp.owner_company_id,
    }));

    return {
      columns: ["employee_code", "employee_name", "joining_date", "area", "checklist_item", "status", "remarks"],
      rows,
      meta: { letter_type: "joining_checklist", ownerCompanyIds: [emp.owner_company_id] },
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// HR_CLEARANCE_FORM
// ─────────────────────────────────────────────────────────────────────────────

export const clearanceFormFetcher: ReportFetcher = {
  reportCode: "HR_CLEARANCE_FORM",

  async fetch(filters: Record<string, unknown>): Promise<ReportDataResult> {
    const employeeId = filters.employee_id ? Number(filters.employee_id) : null;
    if (!employeeId) throw new Error("employee_id is required");

    const emp = await loadEmployeeBase(employeeId);
    const db = createAdminClient();

    // Load existing clearance items from EOS case if present
    const { data: eosCases } = await db
      .from("employee_eos_cases")
      .select("id")
      .eq("employee_id", employeeId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1);

    const eosId = eosCases?.[0]?.id ?? null;
    let clearanceItems: Array<{ clearance_area: string; item_status: string }> = [];

    if (eosId) {
      const { data: items } = await db
        .from("employee_clearance_items")
        .select("clearance_area, item_status")
        .eq("eos_case_id", eosId)
        .is("deleted_at", null);
      clearanceItems = (items ?? []) as typeof clearanceItems;
    }

    const defaultAreas = ["Department", "HR", "Finance", "IT", "Safety", "Admin"];
    const areaMap = new Map(clearanceItems.map((c) => [c.clearance_area, c.item_status]));

    const rows = defaultAreas.map((area) => ({
      employee_code: emp.employee_code,
      employee_name: emp.full_name_en,
      clearance_area: area,
      status: areaMap.get(area) ?? "pending",
      signature_placeholder: "[_______________________]",
      remarks: "",
      owner_company_id: emp.owner_company_id,
    }));

    return {
      columns: ["employee_code", "employee_name", "clearance_area", "status", "signature_placeholder", "remarks"],
      rows,
      meta: { letter_type: "clearance_form", ownerCompanyIds: [emp.owner_company_id] },
    };
  },
};


