/**
 * OUTPUT.2 — Variable allowlist validation for template bodies (pure).
 *
 * Templates may only reference approved `{{namespace.field}}` variables.
 * Final official HTML must contain ZERO unresolved tokens — a leftover token
 * means data substitution failed and the document must not be issued.
 */

const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

/** Extract all {{token}} paths from a template body or HTML string. */
export function extractVariableTokens(source: string): string[] {
  const tokens = new Set<string>();
  for (const m of source.matchAll(TOKEN_RE)) tokens.add(m[1]);
  return [...tokens];
}

export interface AllowlistValidation {
  ok: boolean;
  disallowed: string[];
}

/** Validate that every token in the source is on the per-output allowlist. */
export function validateVariableAllowlist(
  source: string,
  allowlist: readonly string[]
): AllowlistValidation {
  const allowed = new Set(allowlist);
  const disallowed = extractVariableTokens(source).filter((t) => !allowed.has(t));
  return { ok: disallowed.length === 0, disallowed };
}

/**
 * Official-issuance gate: the FINAL rendered HTML must have no unresolved
 * tokens left. Returns the leftover tokens (empty = safe to issue).
 */
export function findUnresolvedTokens(finalHtml: string): string[] {
  return extractVariableTokens(finalHtml);
}

/** Per-output variable allowlists (seed set — extended per onboarded output). */
export const OUTPUT_VARIABLE_ALLOWLISTS: Record<string, readonly string[]> = {
  HR_EXPERIENCE_LETTER: [
    "employee.employee_name",
    "employee.employee_code",
    "employee.designation",
    "employee.department",
    "employee.joining_date",
    "employee.last_working_date",
    "company.company_name",
    "meta.generated_date",
  ],
  HR_EMPLOYMENT_LETTER: [
    "employee.employee_name",
    "employee.employee_code",
    "employee.designation",
    "employee.department",
    "employee.employment_type",
    "employee.employee_status",
    "employee.joining_date",
    "company.company_name",
    "meta.generated_date",
  ],
  HR_SALARY_CERT_GENERAL: [
    "employee.employee_name",
    "employee.employee_code",
    "employee.designation",
    "employee.department",
    "employee.employment_type",
    "employee.joining_date",
    "company.company_name",
    "meta.generated_date",
  ],
  HR_SALARY_CERT_WITH_AMOUNT: [
    "employee.employee_name",
    "employee.employee_code",
    "employee.designation",
    "employee.joining_date",
    "payroll.basic_salary",
    "payroll.gross_salary",
    "payroll.currency",
    "company.company_name",
    "meta.generated_date",
  ],
  HR_NOC: [
    "employee.employee_name",
    "employee.employee_code",
    "employee.designation",
    "employee.passport_number_masked",
    "letter.purpose",
    "company.company_name",
    "meta.generated_date",
  ],
};

export function getVariableAllowlist(outputCode: string): readonly string[] {
  return OUTPUT_VARIABLE_ALLOWLISTS[outputCode] ?? [];
}
