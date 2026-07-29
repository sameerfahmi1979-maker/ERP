/**
 * OUTPUT.3A — Per-output variable allowlists in the BINDING REGISTRY namespace.
 *
 * The Studio's variable chips come from ERP_BINDING_REGISTRY (employee.full_name_en,
 * company.legal_name_en, ...), while OUTPUT.2's letter allowlists use the letter-
 * fetcher namespace (employee.employee_name, ...). These are unified in OUTPUT.4
 * when outputs are onboarded onto studio templates; until then the Studio enforces
 * these registry-namespace allowlists.
 */

export const STUDIO_OUTPUT_VARIABLE_ALLOWLISTS: Record<string, readonly string[]> = {
  HR_EMPLOYMENT_LETTER: [
    "employee.full_name_en",
    "employee.full_name_ar",
    "employee.employee_code",
    "employee.designation",
    "employee.department",
    "employee.employment_type",
    "employee.employment_status",
    "employee.joining_date",
    "employee.owner_company",
    "company.legal_name_en",
    "company.legal_name_ar",
    "company.address_block_en",
    "company.trn",
  ],
  HR_EXPERIENCE_LETTER: [
    "employee.full_name_en",
    "employee.full_name_ar",
    "employee.employee_code",
    "employee.designation",
    "employee.department",
    "employee.joining_date",
    "employee.last_working_date",
    "employee.owner_company",
    "company.legal_name_en",
    "company.legal_name_ar",
  ],
};

/** Returns null when the output has no studio allowlist yet (no restriction). */
export function getStudioVariableAllowlist(outputCode: string): readonly string[] | null {
  return STUDIO_OUTPUT_VARIABLE_ALLOWLISTS[outputCode] ?? null;
}
