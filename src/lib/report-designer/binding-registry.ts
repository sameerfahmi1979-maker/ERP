/**
 * Report Designer — ERP Data Binding Registry
 * Phase: REPORT DESIGNER.1
 *
 * SECURITY RULES:
 *  - This file is the ONLY allowlist for visual template data bindings.
 *  - Unknown bindings MUST fail Zod validation.
 *  - No raw SQL, no arbitrary object paths, no nested expressions.
 *  - Sensitive fields are EXPLICITLY excluded (see EXCLUDED list below).
 *
 * EXCLUDED (must never appear in this registry):
 *  - salary, iban, bank_account, account_number
 *  - passport raw number, eid raw number
 *  - visa raw details, medical data, health data, insurance details
 *  - ocr_text, extracted_text, prompt, embedding, vector
 *  - *_id internal FKs, created_by, updated_by
 *  - service_role, api_key, secret, token values
 */

// ─────────────────────────────────────────────────────────────────────────────
// Binding descriptor
// ─────────────────────────────────────────────────────────────────────────────

export interface BindingDescriptor {
  /** Full dot-notation path used in {{...}} placeholders */
  path: string;
  /** Human-readable label for the UI picker */
  label: string;
  /** Namespace: employee | company | document | report */
  namespace: "employee" | "company" | "document" | "report";
  /** Value type for display / formatting hints */
  valueType: "string" | "date" | "number" | "url";
  /** If true, requires `reports.sign` permission to resolve */
  requiresSignPermission?: boolean;
  /** If true, this binding is only valid for specific template types */
  templateTypeRestriction?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The canonical, allowlisted ERP data binding registry.
 * All paths in this object are safe for use in visual templates.
 *
 * To add a binding: add it here AND add validation coverage in layout-schema.ts.
 * To remove a binding: mark it removed here (do not delete, to preserve version diffs).
 */
export const ERP_BINDING_REGISTRY: Record<string, BindingDescriptor> = {
  // ── Employee namespace ────────────────────────────────────────────────────
  "employee.full_name_en": {
    path: "employee.full_name_en",
    label: "Employee Full Name (English)",
    namespace: "employee",
    valueType: "string",
  },
  "employee.full_name_ar": {
    path: "employee.full_name_ar",
    label: "Employee Full Name (Arabic)",
    namespace: "employee",
    valueType: "string",
  },
  "employee.employee_code": {
    path: "employee.employee_code",
    label: "Employee Code / ID",
    namespace: "employee",
    valueType: "string",
  },
  "employee.designation": {
    path: "employee.designation",
    label: "Designation / Job Title",
    namespace: "employee",
    valueType: "string",
  },
  "employee.department": {
    path: "employee.department",
    label: "Department",
    namespace: "employee",
    valueType: "string",
  },
  "employee.branch": {
    path: "employee.branch",
    label: "Branch / Work Site",
    namespace: "employee",
    valueType: "string",
  },
  "employee.owner_company": {
    path: "employee.owner_company",
    label: "Company (Employee Employer)",
    namespace: "employee",
    valueType: "string",
  },
  "employee.joining_date": {
    path: "employee.joining_date",
    label: "Date of Joining",
    namespace: "employee",
    valueType: "date",
  },
  "employee.nationality": {
    path: "employee.nationality",
    label: "Nationality",
    namespace: "employee",
    valueType: "string",
  },
  "employee.employment_type": {
    path: "employee.employment_type",
    label: "Employment Type",
    namespace: "employee",
    valueType: "string",
  },
  "employee.contract_end_date": {
    path: "employee.contract_end_date",
    label: "Contract End Date",
    namespace: "employee",
    valueType: "date",
  },

  // ── Company namespace ─────────────────────────────────────────────────────
  "company.legal_name_en": {
    path: "company.legal_name_en",
    label: "Company Legal Name (English)",
    namespace: "company",
    valueType: "string",
  },
  "company.legal_name_ar": {
    path: "company.legal_name_ar",
    label: "Company Legal Name (Arabic)",
    namespace: "company",
    valueType: "string",
  },
  "company.address_block_en": {
    path: "company.address_block_en",
    label: "Company Address (English)",
    namespace: "company",
    valueType: "string",
  },
  "company.trn": {
    path: "company.trn",
    label: "Tax Registration Number (TRN)",
    namespace: "company",
    valueType: "string",
  },
  "company.trade_license_no": {
    path: "company.trade_license_no",
    label: "Trade License Number",
    namespace: "company",
    valueType: "string",
  },
  "company.phone": {
    path: "company.phone",
    label: "Company Phone",
    namespace: "company",
    valueType: "string",
  },
  "company.email": {
    path: "company.email",
    label: "Company Email",
    namespace: "company",
    valueType: "string",
  },
  "company.website": {
    path: "company.website",
    label: "Company Website",
    namespace: "company",
    valueType: "url",
  },

  // ── Document namespace ────────────────────────────────────────────────────
  "document.title": {
    path: "document.title",
    label: "Document Title",
    namespace: "document",
    valueType: "string",
  },
  "document.ref": {
    path: "document.ref",
    label: "Document Reference Number",
    namespace: "document",
    valueType: "string",
  },
  "document.generated_at": {
    path: "document.generated_at",
    label: "Document Generated Date",
    namespace: "document",
    valueType: "date",
  },
  "document.issue_date": {
    path: "document.issue_date",
    label: "Document Issue Date",
    namespace: "document",
    valueType: "date",
  },
  "document.qr_verification_url": {
    path: "document.qr_verification_url",
    label: "QR Verification URL",
    namespace: "document",
    valueType: "url",
  },

  // ── Report namespace ──────────────────────────────────────────────────────
  "report.title": {
    path: "report.title",
    label: "Report Title",
    namespace: "report",
    valueType: "string",
  },
  "report.code": {
    path: "report.code",
    label: "Report Code",
    namespace: "report",
    valueType: "string",
  },
  "report.total_rows": {
    path: "report.total_rows",
    label: "Report Total Rows",
    namespace: "report",
    valueType: "number",
  },
  "report.generated_at": {
    path: "report.generated_at",
    label: "Report Generated At",
    namespace: "report",
    valueType: "date",
  },
} as const;

/** All safe binding paths as a string array — for Zod enum validation */
export const SAFE_BINDING_PATHS = Object.keys(ERP_BINDING_REGISTRY) as [string, ...string[]];

/**
 * Validate that a binding path is safe and allowlisted.
 * Returns true if valid, false if unknown or on the sensitive deny-list.
 */
export function isAllowlistedBinding(path: string): boolean {
  return Object.prototype.hasOwnProperty.call(ERP_BINDING_REGISTRY, path);
}

/**
 * Extract all {{binding}} placeholders from a text string.
 * Returns the list of binding paths found.
 */
export function extractBindingsFromText(text: string): string[] {
  const found: string[] = [];
  const regex = /\{\{([a-z][a-z0-9_]*\.[a-z][a-z0-9_]*)\}\}/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    found.push(match[1]);
  }
  return found;
}

/**
 * Validate all bindings in a text string against the allowlist.
 * Returns an array of unknown/unsafe binding paths found (empty = all valid).
 */
export function validateTextBindings(text: string): string[] {
  return extractBindingsFromText(text).filter((b) => !isAllowlistedBinding(b));
}
