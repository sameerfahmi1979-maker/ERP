/**
 * Report Designer — Test Data Binding Resolver
 * Phase: REPORT DESIGNER.5 — Live Report Test Execution with Real ERP Data
 * Phase: REPORT DESIGNER UX.3 — Restricted/Sensitive Field Governance
 *
 * Resolves safe, allowlisted binding values from real ERP data for use in
 * Test Report previews. All functions are SELECT-only and NEVER write to the DB.
 *
 * SECURITY INVARIANTS:
 *  - Only resolves fields present in ERP_BINDING_REGISTRY
 *  - NEVER exposes salary, IBAN, bank_account, passport, EID, visa, medical data
 *  - NEVER exposes *_id internal FK columns, created_by, updated_by, secrets, tokens
 *  - All resolved values are strings — no raw objects returned
 *  - Defensive redaction applied at the end of every resolution path
 *  - UX.3: registry-based masking applied for all restricted/confidential field paths
 *  - This module is server-side only — called from "use server" actions only
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildSampleBindingValues } from "./live-test-schema";
import { applyDefensiveRestrictedMasking } from "./sensitive-field-masking";
import { getReportFieldByPath } from "./field-registry";

// ─────────────────────────────────────────────────────────────────────────────
// Public re-export of sample binding values (convenience alias)
// ─────────────────────────────────────────────────────────────────────────────

export { buildSampleBindingValues as buildSampleReportDesignerBindingValues };

// ─────────────────────────────────────────────────────────────────────────────
// Sensitive field deny-list for defensive redaction
// ─────────────────────────────────────────────────────────────────────────────

/** Key fragments that must NEVER appear in resolved binding values */
const SENSITIVE_KEY_FRAGMENTS = [
  "salary",
  "basic_salary",
  "total_salary",
  "allowance",
  "deduction",
  "iban",
  "bank_account",
  "account_number",
  "passport",
  "emirates_id",
  "residence_visa",
  "eid",
  "visa_uid",
  "medical",
  "health",
  "insurance",
  "ocr_text",
  "extracted_text",
  "embedding",
  "vector",
  "service_role",
  "api_key",
  "secret",
  "token",
];

/** Value fragments that indicate leaked sensitive data */
const SENSITIVE_VALUE_PATTERNS = [/^\d{9,}$/, /^AE\d{23}$/i, /^[A-Z]\d{8}[A-Z]$/];

/**
 * Defensive scan and redaction of resolved binding values.
 * Replaces any suspicious key or value with "[REDACTED]" and logs a warning.
 *
 * UX.3: After the deny-list scan, also applies registry-based masking
 * for all registered restricted/confidential field paths.
 */
export function redactDesignerTestBindingValues(
  values: Record<string, string>
): { values: Record<string, string>; redactedKeys: string[] } {
  const result: Record<string, string> = {};
  const redactedKeys: string[] = [];

  for (const [key, val] of Object.entries(values)) {
    const keyLower = key.toLowerCase();

    // Check if key contains a sensitive fragment
    const isSensitiveKey = SENSITIVE_KEY_FRAGMENTS.some((frag) => keyLower.includes(frag));
    if (isSensitiveKey) {
      result[key] = "[REDACTED]";
      redactedKeys.push(key);
      continue;
    }

    // Skip value-pattern check for fields explicitly registered as public or
    // internal in the field registry — these are known safe business identifiers
    // (e.g. company.trn, company.trade_license_no) whose values may look numeric.
    const registryEntry = getReportFieldByPath(key);
    const isRegisteredNonSensitive =
      registryEntry?.sensitivityLevel === "public" ||
      registryEntry?.sensitivityLevel === "internal";

    // Check if value matches a sensitive pattern (e.g. raw EID, IBAN, passport)
    // Only applies to paths not already marked safe in the registry.
    const isSensitiveValue =
      !isRegisteredNonSensitive &&
      SENSITIVE_VALUE_PATTERNS.some((re) => re.test(String(val)));
    if (isSensitiveValue) {
      result[key] = "[REDACTED]";
      redactedKeys.push(key);
      continue;
    }

    result[key] = val ?? "";
  }

  // UX.3: Apply registry-based masking for registered restricted/confidential paths.
  // This ensures any resolved restricted field (even if not caught by deny-list)
  // is safely masked in test/preview mode.
  const { values: maskedResult, maskedPaths } = applyDefensiveRestrictedMasking(result, "test");
  for (const path of maskedPaths) {
    if (!redactedKeys.includes(path)) {
      redactedKeys.push(path);
    }
  }

  return { values: maskedResult, redactedKeys };
}

// ─────────────────────────────────────────────────────────────────────────────
// Date formatter
// ─────────────────────────────────────────────────────────────────────────────

function formatDateSafe(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return dateStr ?? "";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Employee binding resolver
// ─────────────────────────────────────────────────────────────────────────────

export interface ResolveEmployeeBindingValuesResult {
  values: Record<string, string>;
  warnings: string[];
  contextDescription: string;
  ownerCompanyId: number | null;
}

/**
 * Resolve safe employee binding values from a live DB record.
 * Only resolves fields present in ERP_BINDING_REGISTRY.
 * Requires an authenticated Supabase client (admin or RLS-bypassed).
 *
 * Does NOT query payroll, bank details, passport, EID, visa, or medical tables.
 */
export async function resolveEmployeeBindingValues(
  employeeId: number,
  db: SupabaseClient
): Promise<ResolveEmployeeBindingValuesResult> {
  const warnings: string[] = [];

  const { data: emp, error } = await db
    .from("employees")
    .select(
      `employee_code,
       full_name_en,
       full_name_ar,
       known_name,
       gender,
       marital_status,
       mobile_number,
       joining_date,
       contract_start_date,
       contract_end_date,
       probation_end_date,
       inactive_date,
       employee_status,
       owner_company_id,
       owner_company:owner_companies!employees_owner_company_id_fkey(id, legal_name_en),
       branch:branches(branch_name_en),
       department:departments(department_name_en),
       designation:designations(designation_name_en),
       employment_type:hr_employment_types(name_en),
       nationality:countries(name_en),
       primary_work_site:work_sites!employees_primary_work_site_id_fkey(site_name)`
    )
    .eq("id", employeeId)
    .is("deleted_at", null)
    .single();

  if (error || !emp) {
    throw new Error(`Employee not found or access denied: ${error?.message ?? "not found"}`);
  }

  type OwnerCo = { id: number; legal_name_en: string } | null;
  type Br = { branch_name_en: string } | null;
  type Dept = { department_name_en: string } | null;
  type Desig = { designation_name_en: string } | null;
  type EmpType = { name_en: string } | null;
  type Nat = { name_en: string } | null;
  type WorkSite = { site_name: string } | null;

  const ownerCo = emp.owner_company as unknown as OwnerCo;
  const branch = emp.branch as unknown as Br;
  const dept = emp.department as unknown as Dept;
  const desig = emp.designation as unknown as Desig;
  const empType = emp.employment_type as unknown as EmpType;
  const nationality = emp.nationality as unknown as Nat;
  const workSite = emp.primary_work_site as unknown as WorkSite;

  const values: Record<string, string> = {
    "employee.full_name_en": (emp.full_name_en as string) ?? "",
    "employee.full_name_ar": (emp.full_name_ar as string | null) ?? "",
    "employee.employee_code": (emp.employee_code as string) ?? "",
    "employee.designation": desig?.designation_name_en ?? "",
    "employee.department": dept?.department_name_en ?? "",
    "employee.branch": branch?.branch_name_en ?? "",
    "employee.owner_company": ownerCo?.legal_name_en ?? "",
    "employee.joining_date": formatDateSafe(emp.joining_date as string),
    "employee.nationality": nationality?.name_en ?? "",
    "employee.employment_type": empType?.name_en ?? "",
    "employee.contract_end_date": formatDateSafe(emp.contract_end_date as string | null),
    "employee.employment_status": ((emp.employee_status as string | null) ?? "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase()),
    // REPORT DESIGNER.9: new optional bindings
    "employee.work_site": workSite?.site_name ?? "",
    "employee.last_working_date": formatDateSafe(emp.inactive_date as string | null),
    // REPORT DESIGNER UX.2: new safe HR fields (DB columns confirmed)
    "employee.known_name": (emp.known_name as string | null) ?? "",
    "employee.gender": ((emp.gender as string | null) ?? "")
      .replace(/\b\w/g, (c) => c.toUpperCase()),
    "employee.marital_status": ((emp.marital_status as string | null) ?? "")
      .replace(/\b\w/g, (c) => c.toUpperCase()),
    "employee.mobile_number": (emp.mobile_number as string | null) ?? "",
    "employee.contract_start_date": formatDateSafe(emp.contract_start_date as string | null),
    "employee.probation_end_date": formatDateSafe(emp.probation_end_date as string | null),
  };

  if (!desig?.designation_name_en) {
    warnings.push("employee.designation: not set on this employee record");
  }
  if (!dept?.department_name_en) {
    warnings.push("employee.department: not set on this employee record");
  }

  const contextDescription = `Employee: ${emp.full_name_en} (${emp.employee_code})${desig ? ` — ${desig.designation_name_en}` : ""}`;

  return {
    values,
    warnings,
    contextDescription,
    ownerCompanyId: (emp.owner_company_id as number | null) ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Owner company binding resolver
// ─────────────────────────────────────────────────────────────────────────────

export interface ResolveCompanyBindingValuesResult {
  values: Record<string, string>;
  warnings: string[];
}

/**
 * Resolve safe company binding values from the default report branding profile
 * for the given owner company.  Falls back to raw owner_companies fields when
 * no branding profile exists yet.
 */
export async function resolveOwnerCompanyBindingValues(
  ownerCompanyId: number,
  db: SupabaseClient
): Promise<ResolveCompanyBindingValuesResult> {
  const warnings: string[] = [];

  // Primary source: default branding profile for this company
  const { data: profile } = await db
    .from("erp_report_branding_profiles")
    .select(
      "legal_name_en, legal_name_ar, address_block_en, trn, trade_license_no, phone, email, website"
    )
    .eq("owner_company_id", ownerCompanyId)
    .eq("is_default_for_company", true)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (profile) {
    return {
      values: {
        "company.legal_name_en": (profile as Record<string, string | null>).legal_name_en ?? "",
        "company.legal_name_ar": (profile as Record<string, string | null>).legal_name_ar ?? "",
        "company.address_block_en": (profile as Record<string, string | null>).address_block_en ?? "",
        "company.trn": (profile as Record<string, string | null>).trn ?? "",
        "company.trade_license_no": (profile as Record<string, string | null>).trade_license_no ?? "",
        "company.phone": (profile as Record<string, string | null>).phone ?? "",
        "company.email": (profile as Record<string, string | null>).email ?? "",
        "company.website": (profile as Record<string, string | null>).website ?? "",
      },
      warnings,
    };
  }

  // Fallback: query owner_companies directly and construct address block
  const { data: co, error } = await db
    .from("owner_companies")
    .select(
      "id, legal_name_en, legal_name_ar, address_line_1, address_line_2, city, emirate, trn, trade_license_no, primary_phone, primary_email, website"
    )
    .eq("id", ownerCompanyId)
    .single();

  if (error || !co) {
    warnings.push(
      `company bindings: owner company (id=${ownerCompanyId}) not found — using empty values`
    );
    return {
      values: {
        "company.legal_name_en": "",
        "company.legal_name_ar": "",
        "company.address_block_en": "",
        "company.trn": "",
        "company.trade_license_no": "",
        "company.phone": "",
        "company.email": "",
        "company.website": "",
      },
      warnings,
    };
  }

  const c = co as {
    legal_name_en: string | null;
    legal_name_ar: string | null;
    address_line_1: string | null;
    address_line_2: string | null;
    city: string | null;
    emirate: string | null;
    trn: string | null;
    trade_license_no: string | null;
    primary_phone: string | null;
    primary_email: string | null;
    website: string | null;
  };

  const addressBlock = [c.address_line_1, c.address_line_2, c.city, c.emirate]
    .filter(Boolean)
    .join(", ");

  return {
    values: {
      "company.legal_name_en": c.legal_name_en ?? "",
      "company.legal_name_ar": c.legal_name_ar ?? "",
      "company.address_block_en": addressBlock,
      "company.trn": c.trn ?? "",
      "company.trade_license_no": c.trade_license_no ?? "",
      "company.phone": c.primary_phone ?? "",
      "company.email": c.primary_email ?? "",
      "company.website": c.website ?? "",
    },
    warnings,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Document + report binding resolver (metadata-only, no QR token)
// ─────────────────────────────────────────────────────────────────────────────

export interface ResolveDocumentBindingValuesInput {
  templateName: string;
  templateCode?: string;
}

/**
 * Resolve document.* and report.* binding values for a test preview.
 * Does NOT create QR tokens, report runs, or public links.
 *
 * document.qr_verification_url is explicitly set to a safe placeholder.
 */
export function resolveDocumentBindingValues(
  input: ResolveDocumentBindingValuesInput
): Record<string, string> {
  const now = new Date();
  const todayFormatted = formatDateSafe(now.toISOString());
  const refNo = `TST/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}-PREVIEW`;

  return {
    "document.title": input.templateName,
    "document.ref": refNo,
    "document.generated_at": todayFormatted,
    "document.issue_date": todayFormatted,
    // Explicitly safe — no real QR token issued in test mode
    "document.qr_verification_url": "[TEST PREVIEW — No QR token issued]",
    "report.title": input.templateName,
    "report.code": input.templateCode ?? "",
    "report.total_rows": "0",
    "report.generated_at": todayFormatted,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Context summary builder
// ─────────────────────────────────────────────────────────────────────────────

export interface ReportDesignerTestContextSummary {
  mode: "sample" | "employee_record" | "report_filters";
  label: string;
  detail: string;
  employeeId?: number;
  ownerCompanyId?: number;
  isSampleData: boolean;
  sensitiveFieldsRedacted: boolean;
  redactedFieldCount: number;
}

/**
 * Build a human-readable context summary for the test panel UI.
 */
export function buildReportDesignerTestContextSummary(input: {
  mode: "sample" | "employee_record" | "report_filters";
  employeeDescription?: string;
  companyDescription?: string;
  employeeId?: number;
  ownerCompanyId?: number;
  redactedFieldCount: number;
}): ReportDesignerTestContextSummary {
  const { mode, employeeDescription, companyDescription, redactedFieldCount } = input;

  if (mode === "sample") {
    return {
      mode: "sample",
      label: "Sample Data",
      detail: "Using placeholder values prefixed with [SAMPLE]. No live DB query.",
      isSampleData: true,
      sensitiveFieldsRedacted: false,
      redactedFieldCount: 0,
    };
  }

  if (mode === "employee_record") {
    return {
      mode: "employee_record",
      label: "Employee Record",
      detail: [employeeDescription, companyDescription].filter(Boolean).join(" | "),
      employeeId: input.employeeId,
      ownerCompanyId: input.ownerCompanyId,
      isSampleData: false,
      sensitiveFieldsRedacted: redactedFieldCount > 0,
      redactedFieldCount,
    };
  }

  return {
    mode: "report_filters",
    label: "Report Filters",
    detail: "Report filter mode (deferred — see implementation notes)",
    isSampleData: true,
    sensitiveFieldsRedacted: false,
    redactedFieldCount: 0,
  };
}
