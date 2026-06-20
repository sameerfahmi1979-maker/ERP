/**
 * Global ERP Report Center — Redaction Engine
 * Phase: REPORT.2 — Global Report Engine + Registry + Security Foundation
 *
 * Server-side only. Do NOT import in client components.
 * Never mutates the original data.
 * Never logs raw sensitive values.
 */

import type {
  ReportSensitiveProfile,
  RedactedValue,
  ReportRedactionSummary,
  ReportDataResult,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Field masking utilities
// ─────────────────────────────────────────────────────────────────────────────

/** Mask an IBAN — show last 4 digits only */
export function maskIban(value: string): string {
  if (!value || value.length < 5) return "****";
  return `****${value.slice(-4)}`;
}

/** Mask a bank account number — show last 3 digits only */
export function maskAccountNumber(value: string): string {
  if (!value || value.length < 4) return "***";
  return `***${value.slice(-3)}`;
}

/** Mask a document number — show first 2 and last 2 characters */
export function maskDocumentNumber(value: string): string {
  if (!value || value.length < 5) return "****";
  return `${value.slice(0, 2)}****${value.slice(-2)}`;
}

/** Apply a redaction action and return the safe replacement value */
export function redactValue(
  action: "masked" | "removed" | "replaced",
  originalValue: unknown,
  replacement = "[REDACTED]"
): unknown {
  switch (action) {
    case "removed":
      return null;
    case "replaced":
      return replacement;
    case "masked":
      if (typeof originalValue === "string") {
        const len = originalValue.length;
        if (len <= 4) return "****";
        return `****${originalValue.slice(-4)}`;
      }
      return replacement;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Field rule definitions per profile
// ─────────────────────────────────────────────────────────────────────────────

interface FieldRule {
  fields: string[];
  action: "masked" | "removed" | "replaced";
  requiredPermission: string;
  reason: string;
}

const REDACTION_RULES: Record<ReportSensitiveProfile, FieldRule[]> = {
  normal: [],
  payroll: [
    {
      fields: [
        "basic_salary",
        "gross_salary",
        "net_salary",
        "salary_amount",
        "housing_allowance",
        "transport_allowance",
        "other_allowances",
        "total_deductions",
        "wps_amount",
        "bank_account_number",
        "iban",
      ],
      action: "removed",
      requiredPermission: "hr.payroll.view",
      reason: "Payroll data — requires hr.payroll.view",
    },
  ],
  medical: [
    {
      fields: [
        "diagnosis",
        "medical_notes",
        "prescription",
        "treatment",
        "insurance_policy_number",
        "claim_amount",
        "medical_condition",
        "chronic_condition",
        "disability_details",
      ],
      action: "removed",
      requiredPermission: "hr.medical.view",
      reason: "Medical data — requires hr.medical.view",
    },
  ],
  disciplinary: [
    {
      fields: [
        "disciplinary_notes",
        "violation_details",
        "penalty_details",
        "warning_notes",
        "termination_reason",
        "action_details",
      ],
      action: "removed",
      requiredPermission: "hr.disciplinary.view",
      reason: "Disciplinary data — requires hr.disciplinary.view",
    },
  ],
  recruitment: [
    {
      fields: [
        "expected_salary",
        "current_salary",
        "candidate_notes",
        "interview_feedback",
        "offer_amount",
        "background_check_notes",
        "rejection_reason",
      ],
      action: "removed",
      requiredPermission: "hr.recruitment.view",
      reason: "Recruitment data — requires hr.recruitment.view",
    },
  ],
  dms_confidential: [
    {
      fields: [
        "document_content",
        "extracted_text",
        "ai_summary",
        "confidential_notes",
      ],
      action: "removed",
      requiredPermission: "dms.confidential.view",
      reason: "DMS confidential — requires dms.confidential.view",
    },
    {
      fields: ["document_number", "reference_number"],
      action: "masked",
      requiredPermission: "dms.confidential.view",
      reason: "DMS confidential reference — requires dms.confidential.view",
    },
  ],
  mixed_sensitive: [
    {
      fields: ["basic_salary", "gross_salary", "net_salary", "iban", "bank_account_number"],
      action: "removed",
      requiredPermission: "hr.payroll.view",
      reason: "Mixed sensitive — payroll fields require hr.payroll.view",
    },
    {
      fields: ["diagnosis", "medical_notes"],
      action: "removed",
      requiredPermission: "hr.medical.view",
      reason: "Mixed sensitive — medical fields require hr.medical.view",
    },
    {
      fields: ["disciplinary_notes", "violation_details"],
      action: "removed",
      requiredPermission: "hr.disciplinary.view",
      reason: "Mixed sensitive — disciplinary fields require hr.disciplinary.view",
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Summary builder
// ─────────────────────────────────────────────────────────────────────────────

export function buildRedactionSummary(
  profile: ReportSensitiveProfile,
  redactedFields: RedactedValue[]
): ReportRedactionSummary {
  return {
    profile,
    totalFieldsRedacted: redactedFields.length,
    redactedFields,
    wasRedacted: redactedFields.length > 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main redaction function
// ─────────────────────────────────────────────────────────────────────────────

export interface ApplyRedactionOptions {
  /** Report sensitivity profile */
  profile: ReportSensitiveProfile;
  /** Caller's permission codes */
  permissionCodes: string[];
  /** Additional field rules (from registry sensitive_field_rules_json) */
  extraRules?: FieldRule[];
}

export interface RedactionResult {
  sanitizedData: ReportDataResult;
  summary: ReportRedactionSummary;
}

/**
 * Apply server-side redaction to a ReportDataResult.
 *
 * - Does NOT mutate the original data.
 * - Returns sanitized rows and a summary of what was redacted.
 * - Does NOT log original sensitive values.
 */
export function applyRedaction(
  data: ReportDataResult,
  options: ApplyRedactionOptions
): RedactionResult {
  const { profile, permissionCodes } = options;

  if (profile === "normal") {
    return {
      sanitizedData: data,
      summary: buildRedactionSummary("normal", []),
    };
  }

  const rules = [
    ...(REDACTION_RULES[profile] ?? []),
    ...(options.extraRules ?? []),
  ];

  const redactedFieldLog: RedactedValue[] = [];
  const fieldSet = new Set<string>();

  // Determine which fields need redacting (caller lacks required permission)
  for (const rule of rules) {
    if (!permissionCodes.includes(rule.requiredPermission)) {
      for (const field of rule.fields) {
        if (!fieldSet.has(field)) {
          fieldSet.add(field);
          redactedFieldLog.push({
            field,
            action: rule.action,
            reason: rule.reason,
          });
        }
      }
    }
  }

  if (fieldSet.size === 0) {
    return {
      sanitizedData: data,
      summary: buildRedactionSummary(profile, []),
    };
  }

  // Build a map from field → action for fast lookup
  const fieldActionMap = new Map<string, "masked" | "removed" | "replaced">();
  for (const entry of redactedFieldLog) {
    fieldActionMap.set(entry.field, entry.action);
  }

  // Sanitize rows (immutable — create new row objects)
  const sanitizedRows = data.rows.map((row) => {
    const sanitized: Record<string, unknown> = { ...row };
    for (const [field, action] of fieldActionMap) {
      if (field in sanitized) {
        sanitized[field] = redactValue(action, sanitized[field]);
      }
    }
    return sanitized;
  });

  // Filter columns list if fields were completely removed
  const removedFields = new Set(
    redactedFieldLog
      .filter((f) => f.action === "removed")
      .map((f) => f.field)
  );
  const sanitizedColumns = data.columns.filter((c) => !removedFields.has(c));

  return {
    sanitizedData: {
      columns: sanitizedColumns,
      rows: sanitizedRows,
      meta: data.meta,
    },
    summary: buildRedactionSummary(profile, redactedFieldLog),
  };
}
