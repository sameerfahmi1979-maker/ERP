/**
 * Report Designer — Report Field Registry Types
 * Phase: REPORT DESIGNER UX.2 — Dynamic Expandable Module Field Registry
 *
 * SECURITY RULES (inherited from binding-registry.ts):
 *  - No automatic DB column scanning.
 *  - Every field must be EXPLICITLY defined here.
 *  - Restricted/confidential fields shown locked — never resolved until UX.3.
 *  - Planned fields from future modules shown as "Coming Soon" — not insertable.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Sensitivity levels
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Field sensitivity classification.
 *
 * public      — safe to print on any document, no restriction
 * internal    — HR/company internal data, allowed in controlled templates
 * restricted  — requires explicit governance unlock (UX.3). Not insertable in UX.2.
 * confidential— salary, IBAN, passport, EID. Never insertable without UX.3+.
 */
export type ReportFieldSensitivityLevel =
  | "public"
  | "internal"
  | "restricted"
  | "confidential";

// ─────────────────────────────────────────────────────────────────────────────
// Data types
// ─────────────────────────────────────────────────────────────────────────────

export type ReportFieldDataType =
  | "string"
  | "date"
  | "number"
  | "money"
  | "boolean"
  | "url";

// ─────────────────────────────────────────────────────────────────────────────
// Module grouping
// ─────────────────────────────────────────────────────────────────────────────

export interface ReportFieldModule {
  moduleCode: string;
  moduleLabel: string;
  isPlanned: boolean;
  sortOrder: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Registry entry
// ─────────────────────────────────────────────────────────────────────────────

export interface ReportFieldRegistryEntry {
  /** Module code — e.g. "HR", "COMPANY", "FLEET" */
  moduleCode: string;
  /** Human-readable module label */
  moduleLabel: string;
  /** Entity/group code within the module — e.g. "employee", "company" */
  entityCode: string;
  /** Human-readable entity label */
  entityLabel: string;
  /** Full dot-notation path used in {{...}} placeholders */
  fieldPath: string;
  /** Human-readable field label for the picker UI */
  fieldLabel: string;
  /** Value data type — used for display/formatting hints */
  dataType: ReportFieldDataType;
  /** Sensitivity classification */
  sensitivityLevel: ReportFieldSensitivityLevel;
  /**
   * RBAC permission required to insert this field.
   * If undefined, any authenticated user may insert.
   */
  requiredPermission?: string;
  /**
   * If set, this field may only be used with these template types.
   * e.g. ["letter", "certificate"]
   */
  allowedTemplateTypes?: string[];
  /**
   * Which output modes allow this field to resolve.
   * If undefined, all modes are allowed (subject to sensitivityLevel).
   */
  allowedOutputModes?: Array<"preview" | "test" | "official">;
  /**
   * Server-side resolver key — maps to the resolution function.
   * Must correspond to an existing safe resolver, not a raw column name.
   */
  resolverKey: string;
  /** Sample value used in "sample" test mode */
  sampleValue: string;
  /**
   * Masking strategy for restricted/confidential fields in preview/test.
   * hidden = no value shown; stars = "***"; label = "[Restricted — not shown in preview]"
   * Defaults to "label" if omitted.
   */
  maskingStrategy?: "hidden" | "stars" | "label";
  /**
   * Logical grouping for governance purposes.
   * Used to determine which permission gate applies.
   */
  fieldGroup?: "salary" | "banking" | "identity" | "visa" | "medical" | "general";
  /** Whether this field is currently active and insertable */
  isActive: boolean;
  /** Whether this is a planned/future field — shown as "Coming Soon" in picker */
  isPlanned: boolean;
  /** Sort order within entity group */
  sortOrder: number;
  /** Optional description shown in the picker tooltip */
  description?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Field Picker Context (UX.3 — governance-aware insertability)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runtime context passed to the field picker to determine if restricted
 * fields can be inserted by the current user for the current template.
 */
export interface FieldPickerContext {
  /** Current user's RBAC permission codes */
  userPermissions: string[];
  /** Template type code — e.g. "letter", "salary_certificate" */
  templateType: string;
  /** Template governance status — affects what can be inserted */
  governanceStatus?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Grouped structure (for the picker UI)
// ─────────────────────────────────────────────────────────────────────────────

export interface ReportFieldEntityGroup {
  entityCode: string;
  entityLabel: string;
  fields: ReportFieldRegistryEntry[];
}

export interface ReportFieldModuleGroup {
  moduleCode: string;
  moduleLabel: string;
  isPlanned: boolean;
  entities: ReportFieldEntityGroup[];
}
