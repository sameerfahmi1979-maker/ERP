/**
 * HR.6 — Deterministic Employee Operational Readiness
 *
 * No AI. No LLM. Pure rule-based calculation from employee data.
 */

export type ReadinessStatus = "ready" | "not_ready" | "blocked" | "expired" | "needs_review";

export interface MissingRequirement {
  code: string;
  label: string;
  category: "document" | "training" | "medical" | "access_card" | "block" | "assignment" | "other";
  severity: "info" | "warning" | "critical";
  relatedRecordType?: string;
  relatedRecordId?: number;
}

export interface ReadinessInput {
  employeeId: number;
  hasCurrentAssignment: boolean;
  activeBlockCount: number;
  // Identity documents
  hasValidIdentityDoc: boolean;
  identityDocExpired: boolean;
  // Access card for site
  requiredAccessCardTypeId?: number | null;
  hasValidAccessCard: boolean;
  accessCardExpired: boolean;
  // Medical
  hasMedicalFitness: boolean;
  medicalFitnessExpired: boolean;
  medicalRestricted: boolean;
  // Medical insurance
  hasValidInsurance: boolean;
  insuranceExpired: boolean;
  // Training: array of {required: boolean; met: boolean; expired: boolean}
  trainingRequirements: Array<{ met: boolean; expired: boolean; required: boolean; name: string }>;
  // Role requirements from employee_role_requirements
  roleRequirementsMissingCritical: number;
  roleRequirementsExpired: number;
  // Site readiness override
  existingSiteReadiness?: ReadinessStatus | null;
}

export interface ReadinessResult {
  status: ReadinessStatus;
  missingRequirements: MissingRequirement[];
  canAssignToSite: boolean;
  summary: string;
}

export function calculateEmployeeReadiness(input: ReadinessInput): ReadinessResult {
  const missing: MissingRequirement[] = [];

  // Blocked always takes precedence
  if (input.activeBlockCount > 0) {
    return {
      status: "blocked",
      missingRequirements: [
        {
          code: "ACTIVE_BLOCK",
          label: `${input.activeBlockCount} active operational block(s) preventing readiness`,
          category: "block",
          severity: "critical",
        },
      ],
      canAssignToSite: false,
      summary: "Employee has active operational blocks.",
    };
  }

  // Expired items
  if (input.identityDocExpired) {
    missing.push({
      code: "IDENTITY_EXPIRED",
      label: "Identity document has expired",
      category: "document",
      severity: "critical",
    });
  }

  if (input.accessCardExpired && input.requiredAccessCardTypeId) {
    missing.push({
      code: "ACCESS_CARD_EXPIRED",
      label: "Site access card has expired",
      category: "access_card",
      severity: "critical",
    });
  }

  if (input.medicalFitnessExpired) {
    missing.push({
      code: "MEDICAL_EXPIRED",
      label: "Medical fitness certificate has expired",
      category: "medical",
      severity: "critical",
    });
  }

  if (input.insuranceExpired) {
    missing.push({
      code: "INSURANCE_EXPIRED",
      label: "Medical insurance has expired",
      category: "medical",
      severity: "warning",
    });
  }

  if (input.roleRequirementsExpired > 0) {
    missing.push({
      code: "ROLE_REQ_EXPIRED",
      label: `${input.roleRequirementsExpired} role requirement(s) expired`,
      category: "document",
      severity: "critical",
    });
  }

  for (const t of input.trainingRequirements) {
    if (t.required && t.expired) {
      missing.push({
        code: "TRAINING_EXPIRED",
        label: `Required training expired: ${t.name}`,
        category: "training",
        severity: "critical",
      });
    }
  }

  if (missing.some((m) => m.severity === "critical")) {
    return {
      status: "expired",
      missingRequirements: missing,
      canAssignToSite: false,
      summary: "One or more critical certifications or documents have expired.",
    };
  }

  // Missing required items
  if (!input.hasCurrentAssignment) {
    missing.push({
      code: "NO_ASSIGNMENT",
      label: "No current active assignment",
      category: "assignment",
      severity: "info",
    });
  }

  if (!input.hasValidIdentityDoc) {
    missing.push({
      code: "MISSING_IDENTITY",
      label: "No valid identity document on record",
      category: "document",
      severity: "critical",
    });
  }

  if (input.requiredAccessCardTypeId && !input.hasValidAccessCard) {
    missing.push({
      code: "MISSING_ACCESS_CARD",
      label: "Required site access card not issued",
      category: "access_card",
      severity: "critical",
    });
  }

  if (!input.hasMedicalFitness) {
    missing.push({
      code: "MISSING_MEDICAL",
      label: "Medical fitness status: missing",
      category: "medical",
      severity: "warning",
    });
  }

  if (input.medicalRestricted) {
    missing.push({
      code: "MEDICAL_RESTRICTED",
      label: "Medical fitness status: restricted",
      category: "medical",
      severity: "warning",
    });
  }

  for (const t of input.trainingRequirements) {
    if (t.required && !t.met) {
      missing.push({
        code: "TRAINING_MISSING",
        label: `Required training not completed: ${t.name}`,
        category: "training",
        severity: "warning",
      });
    }
  }

  if (input.roleRequirementsMissingCritical > 0) {
    missing.push({
      code: "ROLE_REQ_MISSING",
      label: `${input.roleRequirementsMissingCritical} critical role requirement(s) not met`,
      category: "document",
      severity: "critical",
    });
  }

  const criticalMissing = missing.filter((m) => m.severity === "critical").length;
  const warningMissing = missing.filter((m) => m.severity === "warning").length;

  if (criticalMissing > 0) {
    return {
      status: "not_ready",
      missingRequirements: missing,
      canAssignToSite: false,
      summary: `${criticalMissing} critical requirement(s) missing.`,
    };
  }

  if (warningMissing > 0) {
    return {
      status: "needs_review",
      missingRequirements: missing,
      canAssignToSite: true,
      summary: `Ready with ${warningMissing} warning(s). Review recommended.`,
    };
  }

  return {
    status: "ready",
    missingRequirements: [],
    canAssignToSite: true,
    summary: "Employee meets all operational readiness requirements.",
  };
}
