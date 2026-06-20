/**
 * ERP COMMON AI.1A — Registry, Types, Prompt Contract, Output Schema
 *
 * Non-updatable field guard for the Common AI engine.
 *
 * These guards enforce that AI suggestions can never target forbidden fields
 * such as primary keys, system codes, audit fields, or numbering fields.
 * All registry validation must call these guards before accepting a field.
 */

import type { ErpAiFieldType } from "./types";

// ── Globally forbidden field names ────────────────────────────────────────────

/**
 * Field names that are ALWAYS forbidden for AI suggestion — regardless of entity.
 * These are the global non-updatable fields per the Common AI Engine Standard §12.
 */
const GLOBALLY_NON_UPDATABLE_FIELDS: ReadonlySet<string> = new Set([
  // Primary keys
  "id",

  // Audit columns (all entities)
  "created_at",
  "created_by",
  "updated_at",
  "updated_by",
  "deleted_at",
  "deleted_by",

  // Soft delete
  "is_deleted",
  "is_active", // controlled by status, not AI

  // System / ERP codes — human-assigned or auto-generated, never AI-updatable
  "party_code",
  "site_code",
  "branch_code",
  "organization_code",
  "company_code",
  "department_code",
  "designation_code",
  "employee_code",
  "vehicle_code",

  // Numbering / reference fields
  "document_no",
  "reference_no",
  "reference_number",
  "code",
  "slug",

  // DMS-specific (never in ERP form fields)
  "doc_no",
  "batch_code",
  "session_code",

  // Embedded version/meta
  "version",
  "revision",
]);

// ── Pattern-based denial ───────────────────────────────────────────────────────

/**
 * Patterns for field names that are denied by default.
 * These run as suffix/prefix checks.
 *
 * Note: `_number` suffix was intentionally removed — it is too broad and
 * incorrectly blocks legitimate business fields such as `license_number`.
 * Specific numbering fields (reference_number, document_no, etc.) are covered
 * by the explicit GLOBALLY_NON_UPDATABLE_FIELDS set above.
 */
const NON_UPDATABLE_PATTERNS: ReadonlyArray<RegExp> = [
  /^.+_code$/i,       // any field ending in _code (party_code, site_code, etc.)
  /^.+_no$/i,         // any field ending in _no (document_no, reference_no, etc.)
  /^audit_/i,         // any field starting with audit_
  /^meta_/i,          // internal meta fields
];

// ── Primary guard function ────────────────────────────────────────────────────

/**
 * Returns true if the field name is globally forbidden from AI suggestions.
 *
 * This is the primary guard. Registry validation must call this for every
 * registered field to ensure forbidden fields cannot be registered.
 *
 * @param fieldName - The DB column name (targetField) to check.
 */
export function isGloballyNonUpdatableField(fieldName: string): boolean {
  if (GLOBALLY_NON_UPDATABLE_FIELDS.has(fieldName)) return true;

  for (const pattern of NON_UPDATABLE_PATTERNS) {
    if (pattern.test(fieldName)) return true;
  }

  return false;
}

// ── Registration assertion ─────────────────────────────────────────────────────

export interface AiFieldRegistrationCandidate {
  targetField: string;
  fieldType: ErpAiFieldType;
  /** Must be explicitly true to allow FK fields (default: denied). */
  allowForeignKeyUpdate?: boolean;
  /** Must be explicitly true to allow status fields (default: denied). */
  allowStatusUpdate?: boolean;
}

/**
 * Asserts that a field is safe to register as AI-eligible.
 *
 * Throws a descriptive error if:
 * - The field is globally non-updatable.
 * - The field is a foreign key (fieldType = "fk") without explicit opt-in.
 * - The field name is "status" without explicit opt-in.
 *
 * Called at registry construction time — not at runtime.
 */
export function assertAiFieldCanBeRegistered(
  field: AiFieldRegistrationCandidate
): void {
  const { targetField, fieldType, allowForeignKeyUpdate, allowStatusUpdate } =
    field;

  if (isGloballyNonUpdatableField(targetField)) {
    throw new Error(
      `[CommonAI] Field "${targetField}" is globally non-updatable and cannot be registered as AI-eligible. ` +
        `Forbidden fields include: primary keys, audit columns, system codes, numbering fields.`
    );
  }

  if (fieldType === "fk" && !allowForeignKeyUpdate) {
    throw new Error(
      `[CommonAI] Field "${targetField}" has fieldType "fk" (foreign key) but allowForeignKeyUpdate is not set to true. ` +
        `FK fields are denied by default. Set allowForeignKeyUpdate: true and safetyClassification: "requires_review" ` +
        `to register FK fields, and ensure the apply handler resolves the FK safely.`
    );
  }

  if (
    (targetField === "status" || targetField.endsWith("_status")) &&
    !allowStatusUpdate
  ) {
    throw new Error(
      `[CommonAI] Field "${targetField}" appears to be a status field. ` +
        `Status fields are denied by default. Set allowStatusUpdate: true only if explicitly approved.`
    );
  }
}

// ── Bulk field name filtering ──────────────────────────────────────────────────

/**
 * Filters a list of field names, returning only those that are NOT globally forbidden.
 * Useful for the output validator to discard any AI-hallucinated forbidden fields.
 */
export function filterNonUpdatableFields(fieldNames: string[]): string[] {
  return fieldNames.filter((f) => !isGloballyNonUpdatableField(f));
}

/**
 * Returns a list of globally forbidden field names from a given set,
 * for use in validation error messages.
 */
export function findForbiddenFields(fieldNames: string[]): string[] {
  return fieldNames.filter((f) => isGloballyNonUpdatableField(f));
}
