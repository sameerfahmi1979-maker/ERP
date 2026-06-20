/**
 * HR.12 — HR AI Redaction Helpers
 *
 * Builds safe, redacted employee context for AI prompts.
 * Sensitive fields are masked or excluded based on caller permissions.
 *
 * Rules:
 * - Salary, IBAN, account numbers NEVER included without hr.payroll.view
 * - Medical details NEVER included without hr.medical.view
 * - Disciplinary notes NEVER included without hr.actions.view
 * - Document numbers masked unless explicit feature requirement
 * - Raw DMS OCR text never included
 * - No API keys, secrets, or auth tokens ever included
 */

import type { AuthContext } from "@/lib/rbac/check";
import { hasPermission } from "@/lib/rbac/check";

// ── Redaction profile type ────────────────────────────────────────────────────

export type HrAiRedactionProfile =
  | "standard"    // name/code/status/department/designation
  | "with_payroll"  // + salary components (requires hr.payroll.view)
  | "with_medical"  // + medical readiness summary (requires hr.medical.view)
  | "with_actions"; // + disciplinary count/status (requires hr.actions.view)

// ── Build safe employee context string ────────────────────────────────────────

export interface EmployeeBasicContext {
  id?: number;
  employee_code?: string | null;
  full_name_en?: string | null;
  employee_status?: string | null;
  joining_date?: string | null;
  contract_type?: string | null;
  contract_end_date?: string | null;
  department_name?: string | null;
  designation_name?: string | null;
  branch_name?: string | null;
  owner_company_name?: string | null;
  nationality?: string | null;
  gender?: string | null;
  date_of_birth?: string | null;
  primary_work_site_name?: string | null;
  employment_type?: string | null;
  // Sensitive — only included with permissions
  gross_salary?: number | null;
  wps_applicable?: boolean | null;
  // Medical — only included with permissions
  medical_readiness_status?: string | null;
  // Actions — only included with permissions
  disciplinary_count?: number | null;
  active_hr_action_count?: number | null;
}

/**
 * Builds a safe, redacted employee context string for AI prompts.
 * Returns both the string and the redaction profile applied.
 */
export function buildSafeEmployeeContext(
  employee: EmployeeBasicContext,
  ctx: AuthContext,
  options?: {
    includePayroll?: boolean;
    includeMedical?: boolean;
    includeActions?: boolean;
  }
): { contextText: string; profile: HrAiRedactionProfile } {
  const canPayroll = options?.includePayroll && hasPermission(ctx, "hr.payroll.view");
  const canMedical = options?.includeMedical && hasPermission(ctx, "hr.medical.view");
  const canActions = options?.includeActions && hasPermission(ctx, "hr.actions.view");

  const profile: HrAiRedactionProfile = canPayroll
    ? "with_payroll"
    : canMedical
    ? "with_medical"
    : canActions
    ? "with_actions"
    : "standard";

  const lines: string[] = [
    `Employee Code: ${employee.employee_code ?? "[not set]"}`,
    `Name: ${employee.full_name_en ?? "[not set]"}`,
    `Status: ${employee.employee_status ?? "[not set]"}`,
    `Joining Date: ${employee.joining_date ?? "[not set]"}`,
    `Contract Type: ${employee.contract_type ?? "[not set]"}`,
    `Contract End: ${employee.contract_end_date ?? "[not set]"}`,
    `Department: ${employee.department_name ?? "[not set]"}`,
    `Designation: ${employee.designation_name ?? "[not set]"}`,
    `Branch: ${employee.branch_name ?? "[not set]"}`,
    `Company: ${employee.owner_company_name ?? "[not set]"}`,
    `Nationality: ${employee.nationality ?? "[not set]"}`,
    `Gender: ${employee.gender ?? "[not set]"}`,
    `Date of Birth: ${employee.date_of_birth ?? "[not set]"}`,
    `Work Site: ${employee.primary_work_site_name ?? "[not set]"}`,
    `Employment Type: ${employee.employment_type ?? "[not set]"}`,
  ];

  if (canPayroll && employee.gross_salary != null) {
    lines.push(`Gross Salary: ${employee.gross_salary} AED`);
    lines.push(`WPS Applicable: ${employee.wps_applicable ?? "unknown"}`);
  } else {
    lines.push("Salary/WPS: [redacted — no payroll permission]");
  }

  if (canMedical && employee.medical_readiness_status != null) {
    lines.push(`Medical Readiness: ${employee.medical_readiness_status}`);
  }

  if (canActions) {
    if (employee.disciplinary_count != null)
      lines.push(`Disciplinary Actions: ${employee.disciplinary_count}`);
    if (employee.active_hr_action_count != null)
      lines.push(`Active HR Actions: ${employee.active_hr_action_count}`);
  }

  return {
    contextText: lines.join("\n"),
    profile,
  };
}

/**
 * Masks a document number — shows only first 4 and last 3 characters.
 * Used when passing document refs to AI without exposing full numbers.
 */
export function maskDocumentNumber(value: string | null | undefined): string {
  if (!value) return "[not set]";
  if (value.length <= 7) return "***";
  return `${value.slice(0, 4)}...${value.slice(-3)}`;
}

/**
 * Builds a safe compliance context string for AI prompts.
 */
export interface EmployeeComplianceSummaryContext {
  identityDocuments: { total: number; expired: number; expiringSoon: number };
  medicalInsurances: { total: number; active: number };
  accessCards: { total: number; active: number; expired: number };
  trainingCertificates: { total: number; expired: number };
  dmsDocuments: { total: number };
}

export function buildSafeComplianceContext(
  summary: EmployeeComplianceSummaryContext,
  canMedical: boolean
): string {
  const lines = [
    `Identity Documents: ${summary.identityDocuments.total} total, ${summary.identityDocuments.expired} expired, ${summary.identityDocuments.expiringSoon} expiring soon`,
    `Access Cards: ${summary.accessCards.total} total, ${summary.accessCards.active} active, ${summary.accessCards.expired} expired`,
    `Training Certificates: ${summary.trainingCertificates.total} total, ${summary.trainingCertificates.expired} expired`,
    `DMS Documents: ${summary.dmsDocuments.total} linked`,
  ];

  if (canMedical) {
    lines.push(
      `Medical Insurance: ${summary.medicalInsurances.total} total, ${summary.medicalInsurances.active} active`
    );
  } else {
    lines.push("Medical Insurance: [redacted — no medical permission]");
  }

  return lines.join("\n");
}

/**
 * Builds a safe readiness context string for AI prompts.
 */
export interface EmployeeReadinessSummaryContext {
  overallStatus: string;
  activeBlockCount: number;
  missingRequirements: string[];
  siteReadinessRecords: { siteName: string; status: string; missingCount: number }[];
}

export function buildSafeReadinessContext(
  summary: EmployeeReadinessSummaryContext
): string {
  const lines = [
    `Overall Readiness: ${summary.overallStatus}`,
    `Active Blocks: ${summary.activeBlockCount}`,
  ];

  if (summary.missingRequirements.length > 0) {
    lines.push(
      `Missing Requirements: ${summary.missingRequirements.slice(0, 10).join("; ")}`
    );
  }

  if (summary.siteReadinessRecords.length > 0) {
    lines.push(
      `Site Readiness: ${summary.siteReadinessRecords
        .slice(0, 5)
        .map((s) => `${s.siteName}(${s.status},missing:${s.missingCount})`)
        .join(", ")}`
    );
  }

  return lines.join("\n");
}
