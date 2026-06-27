/**
 * Shared DMS metadata definition types and helpers (Phase 2).
 */

/** Columns selected for document UI / intake review (non-AI context). */
export const DMS_METADATA_DEFINITION_SELECT =
  "id, document_type_id, field_code, field_label_en, field_label_ar, field_type, is_required, is_ai_extractable, ai_field_hint, sort_order, options_json, validation_json, is_active, field_group, field_section, show_in_review, show_in_detail, show_in_list, show_in_upload_review, is_searchable, is_filterable, is_unique, placeholder_en, placeholder_ar, help_text_en, help_text_ar, ai_possible_labels_en, ai_possible_labels_ar, ai_keywords, ai_negative_keywords, ai_expected_format, ai_example_values, ai_confidence_threshold, normalization_rule, review_required_if_missing, review_required_if_low_confidence, metadata_version, ai_rules_json";

export type DmsMetadataDefinitionContext = "all" | "intake" | "analysis";

export type DmsMetadataDefinitionBase = {
  id: number;
  document_type_id: number;
  field_code: string;
  field_label_en: string;
  field_label_ar: string | null;
  field_type: string;
  is_required: boolean;
  is_ai_extractable: boolean;
  ai_field_hint: string | null;
  sort_order: number;
  options_json: unknown;
  validation_json: unknown;
  field_group: string | null;
  field_section: string | null;
  show_in_review: boolean;
  show_in_detail: boolean;
  show_in_list: boolean;
  show_in_upload_review: boolean;
  is_searchable: boolean;
  is_filterable: boolean;
  is_unique: boolean;
  placeholder_en: string | null;
  placeholder_ar: string | null;
  help_text_en: string | null;
  help_text_ar: string | null;
  ai_possible_labels_en: string[] | null;
  ai_possible_labels_ar: string[] | null;
  ai_keywords: string[] | null;
  ai_negative_keywords: string[] | null;
  ai_expected_format: string | null;
  ai_example_values: string[] | null;
  ai_confidence_threshold: number | null;
  normalization_rule: string | null;
  review_required_if_missing: boolean;
  review_required_if_low_confidence: boolean;
  metadata_version: number;
  ai_rules_json: unknown;
};

/** Parse JSONB that should be a string array. */
export function parseJsonStringArray(value: unknown): string[] | null {
  if (value == null) return null;
  if (Array.isArray(value)) {
    const arr = value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
    return arr.length > 0 ? arr : null;
  }
  return null;
}

/** Map a raw DB row to typed definition (handles missing Phase 2 columns on older rows). */
export function mapMetadataDefinitionRow(row: Record<string, unknown>): DmsMetadataDefinitionBase {
  return {
    id: row.id as number,
    document_type_id: row.document_type_id as number,
    field_code: row.field_code as string,
    field_label_en: row.field_label_en as string,
    field_label_ar: (row.field_label_ar as string | null) ?? null,
    field_type: row.field_type as string,
    is_required: (row.is_required as boolean) ?? false,
    is_ai_extractable: (row.is_ai_extractable as boolean) ?? false,
    ai_field_hint: (row.ai_field_hint as string | null) ?? null,
    sort_order: (row.sort_order as number) ?? 0,
    options_json: row.options_json ?? null,
    validation_json: row.validation_json ?? null,
    field_group: (row.field_group as string | null) ?? null,
    field_section: (row.field_section as string | null) ?? null,
    show_in_review: row.show_in_review !== false,
    show_in_detail: row.show_in_detail !== false,
    show_in_list: row.show_in_list === true,
    show_in_upload_review: row.show_in_upload_review !== false,
    is_searchable: row.is_searchable === true,
    is_filterable: row.is_filterable === true,
    is_unique: row.is_unique === true,
    placeholder_en: (row.placeholder_en as string | null) ?? null,
    placeholder_ar: (row.placeholder_ar as string | null) ?? null,
    help_text_en: (row.help_text_en as string | null) ?? null,
    help_text_ar: (row.help_text_ar as string | null) ?? null,
    ai_possible_labels_en: parseJsonStringArray(row.ai_possible_labels_en),
    ai_possible_labels_ar: parseJsonStringArray(row.ai_possible_labels_ar),
    ai_keywords: parseJsonStringArray(row.ai_keywords),
    ai_negative_keywords: parseJsonStringArray(row.ai_negative_keywords),
    ai_expected_format: (row.ai_expected_format as string | null) ?? null,
    ai_example_values: parseJsonStringArray(row.ai_example_values),
    ai_confidence_threshold:
      row.ai_confidence_threshold != null ? Number(row.ai_confidence_threshold) : null,
    normalization_rule: (row.normalization_rule as string | null) ?? null,
    review_required_if_missing: row.review_required_if_missing === true,
    review_required_if_low_confidence: row.review_required_if_low_confidence === true,
    metadata_version: (row.metadata_version as number) ?? 1,
    ai_rules_json: row.ai_rules_json ?? null,
  };
}

export function filterMetadataDefinitionsByContext(
  rows: DmsMetadataDefinitionBase[],
  context: DmsMetadataDefinitionContext
): DmsMetadataDefinitionBase[] {
  if (context === "all") return rows;
  if (context === "intake") {
    return rows.filter((r) => r.show_in_upload_review !== false);
  }
  return rows;
}

/** Convert newline-separated admin input to JSON string array. */
export function linesToJsonStringArray(text: string): string[] | null {
  const lines = text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  return lines.length > 0 ? lines : null;
}

/** Convert JSON string array to newline-separated text for admin textarea. */
export function jsonStringArrayToLines(value: string[] | null | undefined): string {
  if (!value?.length) return "";
  return value.join("\n");
}

/** Truncate string array for AI prompt inclusion. */
export function truncateStringList(items: string[] | null | undefined, max = 5): string | null {
  if (!items?.length) return null;
  const slice = items.slice(0, max);
  const suffix = items.length > max ? ` (+${items.length - max} more)` : "";
  return slice.join(", ") + suffix;
}

/** Safe validation hints for AI prompt from validation_json. */
export function validationJsonToPromptHint(validation: unknown): string | null {
  if (!validation || typeof validation !== "object") return null;
  const v = validation as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof v.pattern === "string") parts.push(`pattern: ${v.pattern.slice(0, 80)}`);
  if (v.min != null) parts.push(`min: ${String(v.min)}`);
  if (v.max != null) parts.push(`max: ${String(v.max)}`);
  if (typeof v.date_rule === "string") parts.push(`date: ${v.date_rule}`);
  return parts.length > 0 ? parts.join("; ") : null;
}

/** Group definitions by field_group for intake UI. */
export function groupMetadataDefinitionsByFieldGroup(
  definitions: DmsMetadataDefinitionBase[]
): Array<{ group: string; items: DmsMetadataDefinitionBase[] }> {
  const map = new Map<string, DmsMetadataDefinitionBase[]>();
  for (const def of definitions) {
    const key = def.field_group?.trim() || "General";
    const list = map.get(key) ?? [];
    list.push(def);
    map.set(key, list);
  }
  return Array.from(map.entries()).map(([group, items]) => ({
    group,
    items: items.sort((a, b) => a.sort_order - b.sort_order),
  }));
}
