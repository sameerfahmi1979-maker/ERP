/**
 * HR.5 WPS Readiness — Deterministic Checker
 *
 * Checks whether an employee's WPS profile is ready for payroll.
 * Does NOT use AI. Logic is deterministic.
 */

export type WpsReadinessStatus =
  | "ready"
  | "incomplete"
  | "on_hold"
  | "exempt"
  | "not_enrolled";

export type WpsReadinessResult = {
  status: WpsReadinessStatus;
  missingRequirements: string[];
};

export type WpsReadinessInput = {
  wpsProfile: {
    wps_applicable: boolean;
    wps_status: string; // 'active' | 'hold' | 'exempt' | 'not_enrolled'
    bank_id: number | null;
    account_number: string | null;
    iban: string | null;
    exchange_house: string | null;
    salary_payment_method: string; // 'bank_transfer' | 'exchange_house' | 'cheque'
    labour_card_number: string | null;
    mohre_person_code: string | null;
  } | null;
  hasActivePayrollHold: boolean;
  hasSalaryComponents: boolean;
  grossSalary: number;
};

export function checkWpsReadiness(input: WpsReadinessInput): WpsReadinessResult {
  const { wpsProfile, hasActivePayrollHold, hasSalaryComponents, grossSalary } = input;

  // Not enrolled
  if (!wpsProfile) {
    return { status: "not_enrolled", missingRequirements: ["WPS profile not configured"] };
  }

  // Exempt
  if (!wpsProfile.wps_applicable) {
    return { status: "exempt", missingRequirements: [] };
  }

  // WPS status not active
  if (wpsProfile.wps_status === "exempt") {
    return { status: "exempt", missingRequirements: [] };
  }
  if (wpsProfile.wps_status === "not_enrolled") {
    return { status: "not_enrolled", missingRequirements: ["WPS not enrolled"] };
  }

  // On hold from payroll holds table
  if (hasActivePayrollHold) {
    return { status: "on_hold", missingRequirements: ["Active payroll hold exists"] };
  }

  // WPS status hold (from WPS profile itself)
  if (wpsProfile.wps_status === "hold") {
    return { status: "on_hold", missingRequirements: ["WPS status is on hold"] };
  }

  const missing: string[] = [];

  // Check bank/exchange house
  const method = wpsProfile.salary_payment_method;
  if (method === "bank_transfer") {
    if (!wpsProfile.bank_id) missing.push("Bank not selected");
    if (!wpsProfile.iban || wpsProfile.iban.trim() === "") missing.push("IBAN not provided");
  } else if (method === "exchange_house") {
    if (!wpsProfile.exchange_house || wpsProfile.exchange_house.trim() === "") {
      missing.push("Exchange house not specified");
    }
  }

  // Labour card
  if (!wpsProfile.labour_card_number || wpsProfile.labour_card_number.trim() === "") {
    missing.push("Labour card number not provided");
  }

  // Salary components
  if (!hasSalaryComponents) {
    missing.push("No salary components configured");
  }
  if (grossSalary <= 0) {
    missing.push("Gross salary is zero");
  }

  if (missing.length > 0) {
    return { status: "incomplete", missingRequirements: missing };
  }

  return { status: "ready", missingRequirements: [] };
}

export function getWpsReadinessLabel(status: WpsReadinessStatus): string {
  switch (status) {
    case "ready": return "Ready";
    case "incomplete": return "Incomplete";
    case "on_hold": return "On Hold";
    case "exempt": return "Exempt";
    case "not_enrolled": return "Not Enrolled";
  }
}

export function getWpsReadinessBadgeVariant(
  status: WpsReadinessStatus
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "ready": return "default";
    case "incomplete": return "destructive";
    case "on_hold": return "secondary";
    case "exempt": return "outline";
    case "not_enrolled": return "secondary";
  }
}

/** Calculate gross salary from active earning salary components */
export function calculateGrossSalary(
  components: Array<{
    amount: number;
    is_active: boolean;
    deleted_at: string | null;
    component_type?: { component_kind: string } | null;
  }>
): number {
  return components
    .filter((c) => c.is_active && !c.deleted_at)
    .filter((c) => {
      const kind = c.component_type?.component_kind ?? "earning";
      return kind === "earning";
    })
    .reduce((sum, c) => sum + (c.amount ?? 0), 0);
}
