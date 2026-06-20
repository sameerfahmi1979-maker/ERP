/**
 * HR_COMPLIANCE_EXPIRY — Report Fetcher
 * Phase: REPORT.4 — HR.11 Reports + Letters + Forms Library
 *
 * Combines identity docs, medical insurance, access cards, training certs.
 * Masks document numbers. Does not expose medical results.
 */
import type { ReportFetcher, ReportDataResult } from "@/lib/report-center/types";
import { createAdminClient } from "@/lib/supabase/admin";

function maskDocNumber(doc: string | null): string {
  if (!doc) return "";
  if (doc.length <= 4) return "****";
  return doc.slice(0, 2) + "****" + doc.slice(-2);
}

function daysRemaining(expiryDate: string | null): number | null {
  if (!expiryDate) return null;
  const diff = new Date(expiryDate).getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

function expiryStatus(days: number | null): string {
  if (days === null) return "unknown";
  if (days < 0) return "expired";
  if (days <= 30) return "expiring";
  return "valid";
}

export const complianceExpiryFetcher: ReportFetcher = {
  reportCode: "HR_COMPLIANCE_EXPIRY",

  async fetch(filters: Record<string, unknown>): Promise<ReportDataResult> {
    const db = createAdminClient();

    // Base employee filter
    let empQ = db
      .from("employees")
      .select("id, employee_code, full_name_en, owner_company_id, department_id, owner_company:owner_companies(legal_name_en), department:departments(department_name_en)")
      .is("deleted_at", null)
      .eq("employee_status", "active");

    if (filters.owner_company_id) empQ = empQ.eq("owner_company_id", Number(filters.owner_company_id));
    if (filters.department_id) empQ = empQ.eq("department_id", Number(filters.department_id));

    const { data: employees } = await empQ.limit(2000);
    const empMap = new Map((employees ?? []).map((e) => [e.id, e]));
    const empIds = [...empMap.keys()];
    if (empIds.length === 0) return { columns: [], rows: [], meta: { total: 0 } };

    const rows: Record<string, unknown>[] = [];

    // 1. Identity documents
    const { data: idDocs } = await db
      .from("employee_identity_documents")
      .select("employee_id, document_type, document_number, issue_date, expiry_date")
      .in("employee_id", empIds)
      .is("deleted_at", null);

    for (const doc of idDocs ?? []) {
      const emp = empMap.get(doc.employee_id);
      if (!emp) continue;
      const days = daysRemaining(doc.expiry_date);
      if (filters.expiry_from && doc.expiry_date && doc.expiry_date < String(filters.expiry_from)) continue;
      if (filters.expiry_to && doc.expiry_date && doc.expiry_date > String(filters.expiry_to)) continue;
      const status = expiryStatus(days);
      if (filters.status && status !== filters.status) continue;
      rows.push({
        employee_code: emp.employee_code,
        employee_name: emp.full_name_en,
        company: (emp.owner_company as unknown as { legal_name_en: string } | null)?.legal_name_en ?? "",
        department: (emp.department as unknown as { department_name_en: string } | null)?.department_name_en ?? "",
        document_category: "Identity",
        document_type: doc.document_type,
        document_number_masked: maskDocNumber(doc.document_number),
        issue_date: doc.issue_date ?? "",
        expiry_date: doc.expiry_date ?? "",
        days_remaining: days,
        status,
        owner_company_id: emp.owner_company_id,
      });
    }

    // 2. Medical insurance
    const { data: medIns } = await db
      .from("employee_medical_insurances")
      .select("employee_id, insurance_type, policy_number, start_date, expiry_date, status")
      .in("employee_id", empIds)
      .is("deleted_at", null);

    for (const ins of medIns ?? []) {
      const emp = empMap.get(ins.employee_id);
      if (!emp) continue;
      const days = daysRemaining(ins.expiry_date);
      if (filters.expiry_from && ins.expiry_date && ins.expiry_date < String(filters.expiry_from)) continue;
      if (filters.expiry_to && ins.expiry_date && ins.expiry_date > String(filters.expiry_to)) continue;
      const status = expiryStatus(days);
      if (filters.status && status !== filters.status) continue;
      rows.push({
        employee_code: emp.employee_code,
        employee_name: emp.full_name_en,
        company: (emp.owner_company as unknown as { legal_name_en: string } | null)?.legal_name_en ?? "",
        department: (emp.department as unknown as { department_name_en: string } | null)?.department_name_en ?? "",
        document_category: "Medical Insurance",
        document_type: ins.insurance_type ?? "insurance",
        document_number_masked: maskDocNumber(ins.policy_number),
        issue_date: ins.start_date ?? "",
        expiry_date: ins.expiry_date ?? "",
        days_remaining: days,
        status,
        owner_company_id: emp.owner_company_id,
      });
    }

    // 3. Training certificates
    const { data: certs } = await db
      .from("employee_training_certificates")
      .select("employee_id, certificate_name, certificate_number, issue_date, expiry_date")
      .in("employee_id", empIds)
      .is("deleted_at", null);

    for (const cert of certs ?? []) {
      const emp = empMap.get(cert.employee_id);
      if (!emp) continue;
      const days = daysRemaining(cert.expiry_date);
      if (filters.expiry_from && cert.expiry_date && cert.expiry_date < String(filters.expiry_from)) continue;
      if (filters.expiry_to && cert.expiry_date && cert.expiry_date > String(filters.expiry_to)) continue;
      const status = expiryStatus(days);
      if (filters.status && status !== filters.status) continue;
      rows.push({
        employee_code: emp.employee_code,
        employee_name: emp.full_name_en,
        company: (emp.owner_company as unknown as { legal_name_en: string } | null)?.legal_name_en ?? "",
        department: (emp.department as unknown as { department_name_en: string } | null)?.department_name_en ?? "",
        document_category: "Training",
        document_type: cert.certificate_name,
        document_number_masked: maskDocNumber(cert.certificate_number),
        issue_date: cert.issue_date ?? "",
        expiry_date: cert.expiry_date ?? "",
        days_remaining: days,
        status,
        owner_company_id: emp.owner_company_id,
      });
    }

    const ownerCompanyIds = [...new Set(rows.map((r) => r.owner_company_id as number))];

    return {
      columns: [
        "employee_code", "employee_name", "company", "department",
        "document_category", "document_type", "document_number_masked",
        "issue_date", "expiry_date", "days_remaining", "status",
      ],
      rows,
      meta: { total: rows.length, ownerCompanyIds },
    };
  },
};


