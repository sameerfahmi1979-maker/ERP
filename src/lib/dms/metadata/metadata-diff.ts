/**
 * DMS Phase 6 — Metadata Diff Utility
 *
 * Pure utility module: no Supabase, no server actions, no React.
 * Compares AI extraction result against current approved metadata values
 * and returns typed diff rows that drive the Apply-to-Metadata UI.
 */

import type { DmsMetadataDefinitionBase } from "./metadata-definition-shared";

// ── Input types ───────────────────────────────────────────────────────────────

/** Minimal current metadata value row (subset of DmsMetadataValueRow). */
export type CurrentMetadataValueRow = {
  definition_id: number;
  value_text: string | null;
  value_number: number | null;
  value_date: string | null;
  value_datetime: string | null;
  value_boolean: boolean | null;
  value_json: unknown;
  updated_at?: string | null;
};

export type ConfidenceEntry = {
  score: number;
  label: string;
  source_snippet: string | null;
} | null;

// ── Diff state ────────────────────────────────────────────────────────────────

export type MetadataDiffState =
  | "new"            // no current value, AI has a value
  | "same"           // AI value matches current (after normalisation)
  | "changed"        // AI value differs from current
  | "conflict"       // AI value fails type conversion or validation
  | "low_confidence" // confidence below threshold or review_required_if_low_confidence
  | "no_ai_value"    // AI result has no value for this field
  | "not_extractable"; // definition.is_ai_extractable = false

// ── Diff row ──────────────────────────────────────────────────────────────────

export type MetadataDiffRow = {
  definitionId: number;
  fieldCode: string;
  fieldLabelEn: string;
  fieldLabelAr?: string | null;
  fieldType: string;
  fieldGroup?: string | null;
  fieldSection?: string | null;
  isRequired: boolean;
  /** Serialised current approved value (for display and comparison). */
  currentValueRaw: string | null;
  /** updated_at of the current value row (for concurrency guard). */
  currentUpdatedAt?: string | null;
  /** Raw string from extracted_fields_json. */
  aiValueRaw: string | null;
  /** Type-converted AI value ready for DB write. */
  aiValueConverted: unknown | null;
  confidenceScore: number | null;
  confidenceLabel: string | null;
  sourceSnippet: string | null;
  diffState: MetadataDiffState;
  /** Why the field is in conflict state. */
  validationError: string | null;
  /** True if the user must explicitly confirm (changed or low_confidence). */
  requiresConfirmation: boolean;
  /** False for conflict / no_ai_value / same / not_extractable. */
  canApply: boolean;
};

// ── Value conversion ──────────────────────────────────────────────────────────

/** Convert an AI-returned string to the typed value for a given field_type. */
export function convertAiValueForFieldType(
  rawValue: string,
  fieldType: string,
  optionsJson: unknown
): { converted: unknown; error: string | null } {
  const trimmed = rawValue.trim();
  if (!trimmed) return { converted: null, error: "Empty value" };

  switch (fieldType) {
    case "text":
    case "textarea":
    case "url":
    case "email":
    case "phone":
      return { converted: trimmed, error: null };

    case "select": {
      const options = extractSelectOptions(optionsJson);
      if (options.length > 0) {
        const exact = options.find((o) => o === trimmed);
        if (exact) return { converted: exact, error: null };
        const ci = options.find((o) => o.toLowerCase() === trimmed.toLowerCase());
        if (ci) return { converted: ci, error: null };
        return {
          converted: null,
          error: `"${trimmed}" is not a valid option. Allowed: ${options.slice(0, 5).join(", ")}${options.length > 5 ? "…" : ""}`,
        };
      }
      return { converted: trimmed, error: null };
    }

    case "multiselect": {
      let items: string[];
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        items = Array.isArray(parsed) ? parsed.map(String) : [trimmed];
      } catch {
        items = trimmed.split(",").map((s) => s.trim()).filter(Boolean);
      }
      const options = extractSelectOptions(optionsJson);
      if (options.length > 0) {
        const invalid = items.filter(
          (i) => !options.includes(i) && !options.some((o) => o.toLowerCase() === i.toLowerCase())
        );
        if (invalid.length > 0) {
          return { converted: null, error: `Invalid option(s): ${invalid.join(", ")}` };
        }
        items = items.map(
          (i) => options.find((o) => o.toLowerCase() === i.toLowerCase()) ?? i
        );
      }
      return { converted: items, error: null };
    }

    case "number":
    case "currency": {
      const num = parseFloat(trimmed.replace(/,/g, ""));
      if (isNaN(num)) return { converted: null, error: `"${trimmed}" is not a valid number` };
      return { converted: num, error: null };
    }

    case "date": {
      // Accept YYYY-MM-DD directly
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        const d = new Date(trimmed + "T00:00:00Z");
        if (isNaN(d.getTime())) return { converted: null, error: `"${trimmed}" is not a valid calendar date` };
        return { converted: trimmed, error: null };
      }
      // Try general parse
      const d = new Date(trimmed);
      if (isNaN(d.getTime())) {
        return { converted: null, error: `"${trimmed}" is not a valid date (expected YYYY-MM-DD)` };
      }
      const iso = d.toISOString().split("T")[0];
      return { converted: iso, error: null };
    }

    case "datetime": {
      const d = new Date(trimmed);
      if (isNaN(d.getTime())) return { converted: null, error: `"${trimmed}" is not a valid datetime` };
      return { converted: d.toISOString(), error: null };
    }

    case "boolean": {
      const lower = trimmed.toLowerCase();
      if (["true", "yes", "1", "on"].includes(lower)) return { converted: true, error: null };
      if (["false", "no", "0", "off"].includes(lower)) return { converted: false, error: null };
      return { converted: null, error: `"${trimmed}" cannot be interpreted as true/false` };
    }

    case "json": {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        return { converted: parsed, error: null };
      } catch {
        return { converted: null, error: "Value is not valid JSON" };
      }
    }

    default:
      // Unknown types treated as text
      return { converted: trimmed, error: null };
  }
}

function extractSelectOptions(optionsJson: unknown): string[] {
  if (!optionsJson || typeof optionsJson !== "object") return [];
  const obj = optionsJson as Record<string, unknown>;
  const raw = obj.values ?? obj.options;
  if (!Array.isArray(raw)) return [];
  return raw.map(String).filter(Boolean);
}

// ── Value serialisation ───────────────────────────────────────────────────────

/** Serialise a current DB row value to a display string for comparison. */
export function serializeMetadataValue(
  row: CurrentMetadataValueRow | null,
  fieldType: string
): string | null {
  if (!row) return null;
  switch (fieldType) {
    case "boolean":
      return row.value_boolean === null ? null : row.value_boolean ? "true" : "false";
    case "number":
    case "currency":
      return row.value_number !== null ? String(row.value_number) : null;
    case "date":
      return row.value_date ?? null;
    case "datetime":
      return row.value_datetime ?? null;
    case "multiselect":
    case "json":
      return row.value_json != null ? JSON.stringify(row.value_json) : null;
    default:
      return row.value_text ?? null;
  }
}

/** Truncated summary of a value for audit logging (never logs full content). */
export function summarizeMetadataValue(value: unknown, fieldType: string): string | null {
  if (value === null || value === undefined) return null;
  if (fieldType === "json" || fieldType === "multiselect") return "[json]";
  const str = String(value);
  return str.length > 100 ? str.slice(0, 100) + "…" : str;
}

// ── Normalisation helpers ─────────────────────────────────────────────────────

function normalizeForComparison(value: string | null, fieldType: string): string | null {
  if (value === null || value === undefined) return null;
  const str = value.trim();
  if (!str) return null;
  switch (fieldType) {
    case "number":
    case "currency": {
      const num = parseFloat(str.replace(/,/g, ""));
      return isNaN(num) ? str.toLowerCase() : String(num);
    }
    case "boolean":
      return ["true", "yes", "1", "on"].includes(str.toLowerCase()) ? "true" : "false";
    default:
      return str.toLowerCase();
  }
}

function validateWithValidationJson(
  converted: unknown,
  fieldType: string,
  validationJson: unknown
): string | null {
  if (!validationJson || typeof validationJson !== "object") return null;
  const v = validationJson as Record<string, unknown>;

  if (typeof v.pattern === "string" && typeof converted === "string") {
    try {
      if (!new RegExp(v.pattern).test(converted)) {
        return "Value does not match the required pattern";
      }
    } catch {
      // Malformed regex — skip silently
    }
  }

  if ((fieldType === "number" || fieldType === "currency") && typeof converted === "number") {
    if (v.min !== undefined && converted < Number(v.min)) {
      return `Value must be at least ${String(v.min)}`;
    }
    if (v.max !== undefined && converted > Number(v.max)) {
      return `Value must be at most ${String(v.max)}`;
    }
  }

  return null;
}

// ── Main diff builder ─────────────────────────────────────────────────────────

/**
 * Build a diff between AI-suggested values and current approved metadata.
 *
 * @param definitions  Active metadata definitions for the document type
 * @param currentValues  Current dms_document_metadata_values rows
 * @param extractedFieldsJson  From dms_ai_extraction_results.extracted_fields_json
 * @param fieldConfidenceJson  From dms_ai_extraction_results.field_confidence_json
 */
export function buildMetadataDiff(
  definitions: DmsMetadataDefinitionBase[],
  currentValues: CurrentMetadataValueRow[],
  extractedFieldsJson: Record<string, unknown> | null,
  fieldConfidenceJson: Record<string, ConfidenceEntry> | null
): MetadataDiffRow[] {
  const currentMap = new Map<number, CurrentMetadataValueRow>();
  for (const v of currentValues) currentMap.set(v.definition_id, v);

  const rows: MetadataDiffRow[] = [];

  for (const def of definitions) {
    // Definitions passed in are already filtered to is_active = true by the caller.
    if (!def.is_ai_extractable) {
      rows.push({
        definitionId: def.id,
        fieldCode: def.field_code,
        fieldLabelEn: def.field_label_en,
        fieldLabelAr: def.field_label_ar,
        fieldType: def.field_type,
        fieldGroup: def.field_group,
        fieldSection: def.field_section,
        isRequired: def.is_required,
        currentValueRaw: null,
        currentUpdatedAt: null,
        aiValueRaw: null,
        aiValueConverted: null,
        confidenceScore: null,
        confidenceLabel: null,
        sourceSnippet: null,
        diffState: "not_extractable",
        validationError: null,
        requiresConfirmation: false,
        canApply: false,
      });
      continue;
    }

    const currentRow = currentMap.get(def.id) ?? null;
    const currentRaw = serializeMetadataValue(currentRow, def.field_type);

    const aiRaw = extractedFieldsJson?.[def.field_code];
    const aiValueStr =
      aiRaw !== undefined && aiRaw !== null && aiRaw !== "" ? String(aiRaw).trim() : null;

    const confEntry = fieldConfidenceJson?.[def.field_code] ?? null;
    const confidenceScore = confEntry?.score ?? null;
    const confidenceLabel = confEntry?.label ?? null;
    const sourceSnippet = confEntry?.source_snippet ?? null;

    // ── No AI value ──────────────────────────────────────────────────────────
    if (!aiValueStr) {
      rows.push({
        definitionId: def.id,
        fieldCode: def.field_code,
        fieldLabelEn: def.field_label_en,
        fieldLabelAr: def.field_label_ar,
        fieldType: def.field_type,
        fieldGroup: def.field_group,
        fieldSection: def.field_section,
        isRequired: def.is_required,
        currentValueRaw: currentRaw,
        currentUpdatedAt: currentRow?.updated_at ?? null,
        aiValueRaw: null,
        aiValueConverted: null,
        confidenceScore,
        confidenceLabel,
        sourceSnippet,
        diffState: "no_ai_value",
        validationError: null,
        requiresConfirmation: false,
        canApply: false,
      });
      continue;
    }

    // ── Type conversion ──────────────────────────────────────────────────────
    const { converted, error: convErr } = convertAiValueForFieldType(
      aiValueStr,
      def.field_type,
      def.options_json
    );

    if (convErr || converted === null) {
      rows.push({
        definitionId: def.id,
        fieldCode: def.field_code,
        fieldLabelEn: def.field_label_en,
        fieldLabelAr: def.field_label_ar,
        fieldType: def.field_type,
        fieldGroup: def.field_group,
        fieldSection: def.field_section,
        isRequired: def.is_required,
        currentValueRaw: currentRaw,
        currentUpdatedAt: currentRow?.updated_at ?? null,
        aiValueRaw: aiValueStr,
        aiValueConverted: null,
        confidenceScore,
        confidenceLabel,
        sourceSnippet,
        diffState: "conflict",
        validationError: convErr ?? "Value could not be converted",
        requiresConfirmation: false,
        canApply: false,
      });
      continue;
    }

    // ── Validation rules ─────────────────────────────────────────────────────
    const valErr = validateWithValidationJson(converted, def.field_type, def.validation_json);
    if (valErr) {
      rows.push({
        definitionId: def.id,
        fieldCode: def.field_code,
        fieldLabelEn: def.field_label_en,
        fieldLabelAr: def.field_label_ar,
        fieldType: def.field_type,
        fieldGroup: def.field_group,
        fieldSection: def.field_section,
        isRequired: def.is_required,
        currentValueRaw: currentRaw,
        currentUpdatedAt: currentRow?.updated_at ?? null,
        aiValueRaw: aiValueStr,
        aiValueConverted: converted,
        confidenceScore,
        confidenceLabel,
        sourceSnippet,
        diffState: "conflict",
        validationError: valErr,
        requiresConfirmation: false,
        canApply: false,
      });
      continue;
    }

    // ── Compare current vs AI ────────────────────────────────────────────────
    const normalCurrent = normalizeForComparison(currentRaw, def.field_type);
    const normalAi = normalizeForComparison(aiValueStr, def.field_type);

    let diffState: MetadataDiffState;
    if (normalCurrent !== null && normalCurrent === normalAi) {
      diffState = "same";
    } else if (!currentRaw || currentRaw.trim() === "") {
      diffState = "new";
    } else {
      diffState = "changed";
    }

    // ── Confidence check ─────────────────────────────────────────────────────
    if (diffState !== "same") {
      const threshold = def.ai_confidence_threshold ?? 0;
      const scoreBelow = confidenceScore !== null && threshold > 0 && confidenceScore < threshold;
      const lowLabel =
        def.review_required_if_low_confidence &&
        (confidenceLabel === "low" || confidenceLabel === "needs_manual_review");

      if (scoreBelow || lowLabel) {
        diffState = "low_confidence";
      }
    }

    const canApply: boolean =
      diffState === "new" ||
      diffState === "changed" ||
      diffState === "low_confidence";

    const requiresConfirmation: boolean =
      diffState === "changed" || diffState === "low_confidence";

    rows.push({
      definitionId: def.id,
      fieldCode: def.field_code,
      fieldLabelEn: def.field_label_en,
      fieldLabelAr: def.field_label_ar,
      fieldType: def.field_type,
      fieldGroup: def.field_group,
      fieldSection: def.field_section,
      isRequired: def.is_required,
      currentValueRaw: currentRaw,
      currentUpdatedAt: currentRow?.updated_at ?? null,
      aiValueRaw: aiValueStr,
      aiValueConverted: converted,
      confidenceScore,
      confidenceLabel,
      sourceSnippet,
      diffState,
      validationError: null,
      requiresConfirmation,
      canApply,
    });
  }

  return rows;
}
