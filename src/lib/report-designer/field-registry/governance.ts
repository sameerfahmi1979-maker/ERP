/**
 * Report Designer — Field Registry Governance
 * Phase: REPORT DESIGNER UX.3 — Restricted/Sensitive Field Governance
 *
 * Pure TypeScript governance helpers for determining whether restricted/
 * confidential fields can be inserted or resolved in a given context.
 *
 * RULES:
 *  - No I/O — pure functions only.
 *  - Never bypass the permission gate.
 *  - Never bypass the template-type allowlist.
 *  - "official" output mode is the only mode that may resolve real values.
 *  - Always mask in preview/test.
 */

import type { ReportFieldRegistryEntry, FieldPickerContext } from "./types";
import { REPORT_FIELD_REGISTRY } from "./registry";
import { getReportFieldByPath } from "./registry-utils";

// ─────────────────────────────────────────────────────────────────────────────
// Output mode type
// ─────────────────────────────────────────────────────────────────────────────

export type ReportOutputMode = "preview" | "test" | "official";

// ─────────────────────────────────────────────────────────────────────────────
// Sensitivity checks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if the field path maps to a restricted or confidential
 * field in the registry (active or inactive).
 */
export function isRestrictedOrConfidentialField(path: string): boolean {
  const entry = getReportFieldByPath(path);
  if (!entry) return false;
  return (
    entry.sensitivityLevel === "restricted" ||
    entry.sensitivityLevel === "confidential"
  );
}

/**
 * Returns true if the field path is a registered restricted/confidential
 * entry (even if inactive/planned). Used in security review to distinguish
 * between known governance fields and truly unknown suspicious paths.
 */
export function isRegisteredSensitiveField(path: string): boolean {
  return REPORT_FIELD_REGISTRY.some(
    (e) =>
      e.fieldPath === path &&
      (e.sensitivityLevel === "restricted" || e.sensitivityLevel === "confidential")
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Insertability gate (field picker)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if a restricted/confidential field can be INSERTED into
 * a template given the current field picker context.
 *
 * Conditions that must ALL be met:
 * 1. Field is active and not planned.
 * 2. User has the required permission (requiredPermission).
 * 3. Template type is in allowedTemplateTypes for the field.
 */
export function canFieldBeInsertedForTemplate(
  field: ReportFieldRegistryEntry,
  context: FieldPickerContext
): boolean {
  if (!field.isActive || field.isPlanned) return false;

  // Public and internal fields are always insertable (no governance gate)
  if (
    field.sensitivityLevel === "public" ||
    field.sensitivityLevel === "internal"
  ) {
    return true;
  }

  // Restricted / confidential: check permission
  if (field.requiredPermission) {
    if (!context.userPermissions.includes(field.requiredPermission)) {
      return false;
    }
  }

  // Check template type allowlist
  if (field.allowedTemplateTypes && field.allowedTemplateTypes.length > 0) {
    if (!field.allowedTemplateTypes.includes(context.templateType)) {
      return false;
    }
  }

  return true;
}

/**
 * Returns a human-readable explanation for why a restricted field
 * cannot be inserted in the current context (for tooltip display).
 */
export function getFieldInsertBlockReason(
  field: ReportFieldRegistryEntry,
  context: FieldPickerContext
): string {
  if (!field.isActive || field.isPlanned) {
    return "Coming soon — not yet implemented";
  }

  if (field.sensitivityLevel === "public" || field.sensitivityLevel === "internal") {
    return "";
  }

  // Check permission
  if (field.requiredPermission && !context.userPermissions.includes(field.requiredPermission)) {
    return `Restricted — requires permission: ${field.requiredPermission}`;
  }

  // Check template type
  if (field.allowedTemplateTypes && field.allowedTemplateTypes.length > 0) {
    if (!field.allowedTemplateTypes.includes(context.templateType)) {
      const allowedList = field.allowedTemplateTypes.join(", ");
      return `Restricted — allowed only for template types: ${allowedList}. Current: "${context.templateType || "(none)"}"`;
    }
  }

  return "";
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolution gate (server-side rendering)
// ─────────────────────────────────────────────────────────────────────────────

export interface ReportRenderContext {
  /** preview = editor/puck canvas, test = test panel, official = production output */
  outputMode: ReportOutputMode;
  /** Current user's RBAC permission codes */
  userPermissions: string[];
  /** Template type code */
  templateType: string;
  /** Template governance status */
  governanceStatus?: string;
}

/**
 * Returns true if a field may resolve its REAL value in the given render context.
 *
 * Restricted/confidential fields may only resolve in "official" mode when:
 * 1. The user has the requiredPermission.
 * 2. The template type is in allowedTemplateTypes.
 * 3. The template is approved or published.
 */
export function canFieldResolveInOutputMode(
  field: ReportFieldRegistryEntry,
  context: ReportRenderContext
): boolean {
  // Public/internal fields always resolve
  if (
    field.sensitivityLevel === "public" ||
    field.sensitivityLevel === "internal"
  ) {
    return true;
  }

  // Restricted/confidential require official mode
  if (context.outputMode !== "official") return false;

  // Check allowedOutputModes if defined
  if (field.allowedOutputModes && !field.allowedOutputModes.includes("official")) {
    return false;
  }

  // Check permission
  if (field.requiredPermission) {
    if (!context.userPermissions.includes(field.requiredPermission)) {
      return false;
    }
  }

  // Check template type
  if (field.allowedTemplateTypes && field.allowedTemplateTypes.length > 0) {
    if (!field.allowedTemplateTypes.includes(context.templateType)) {
      return false;
    }
  }

  // Check governance status (must be approved or published for official output)
  const issuableStatuses = ["approved", "published"];
  if (
    context.governanceStatus &&
    !issuableStatuses.includes(context.governanceStatus)
  ) {
    return false;
  }

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Masking
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the safe masked display string for a field in preview/test mode.
 */
export function getRestrictedFieldMask(
  field: ReportFieldRegistryEntry,
  mode: ReportOutputMode = "test"
): string {
  const strategy = field.maskingStrategy ?? "label";

  switch (strategy) {
    case "hidden":
      return "";
    case "stars":
      return "***";
    case "label":
    default:
      if (field.sensitivityLevel === "confidential") {
        return mode === "preview"
          ? "[Confidential — not shown in preview]"
          : "[Confidential — official output only]";
      }
      return mode === "preview"
        ? "[Restricted — not shown in preview]"
        : "[Restricted — official output only]";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout extraction helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Given a list of binding paths extracted from a layout, returns only those
 * that are registered restricted/confidential fields.
 */
export function getRestrictedFieldsFromPaths(
  paths: string[]
): ReportFieldRegistryEntry[] {
  const result: ReportFieldRegistryEntry[] = [];
  for (const path of paths) {
    const entry = getReportFieldByPath(path);
    if (
      entry &&
      (entry.sensitivityLevel === "restricted" || entry.sensitivityLevel === "confidential")
    ) {
      result.push(entry);
    }
  }
  return result;
}

/**
 * Build a safe audit metadata payload for sensitive field resolution.
 * Never includes actual sensitive values.
 */
export function buildSensitiveFieldAuditMetadata(opts: {
  templateId: number;
  templateCode: string;
  templateType: string;
  fieldPaths: string[];
  employeeId?: number | null;
  runId?: number | null;
}): Record<string, unknown> {
  return {
    template_id: opts.templateId,
    template_code: opts.templateCode,
    template_type: opts.templateType,
    field_paths: opts.fieldPaths,
    output_mode: "official",
    ...(opts.employeeId != null ? { employee_id: opts.employeeId } : {}),
    ...(opts.runId != null ? { run_id: opts.runId } : {}),
  };
}
