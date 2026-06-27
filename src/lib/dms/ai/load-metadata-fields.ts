import type { SupabaseClient } from "@supabase/supabase-js";
import type { DmsAiMetadataField } from "./types";
import {
  DMS_METADATA_DEFINITION_SELECT,
  filterMetadataDefinitionsByContext,
  mapMetadataDefinitionRow,
  type DmsMetadataDefinitionContext,
} from "@/lib/dms/metadata/metadata-definition-shared";

/** Load active metadata field definitions for a document type (AI intake / analysis). */
export async function loadMetadataFieldsForDocumentType(
  supabase: SupabaseClient,
  documentTypeId: number,
  context: DmsMetadataDefinitionContext = "all"
): Promise<DmsAiMetadataField[]> {
  const { data } = await supabase
    .from("dms_metadata_definitions")
    .select(DMS_METADATA_DEFINITION_SELECT)
    .eq("document_type_id", documentTypeId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });

  const mapped = (data ?? []).map((row) =>
    mapMetadataDefinitionRow(row as Record<string, unknown>)
  );

  return filterMetadataDefinitionsByContext(mapped, context)
    .filter((f) => f.is_ai_extractable !== false)
    .map((f) => ({
      fieldCode: f.field_code,
      labelEn: f.field_label_en,
      labelAr: f.field_label_ar,
      fieldType: f.field_type,
      isRequired: f.is_required,
      aiFieldHint: f.ai_field_hint,
      optionsJson: f.options_json,
      validationJson: f.validation_json,
      aiPossibleLabelsEn: f.ai_possible_labels_en,
      aiPossibleLabelsAr: f.ai_possible_labels_ar,
      aiKeywords: f.ai_keywords,
      aiNegativeKeywords: f.ai_negative_keywords,
      aiExpectedFormat: f.ai_expected_format,
      aiExampleValues: f.ai_example_values,
      aiConfidenceThreshold: f.ai_confidence_threshold,
      normalizationRule: f.normalization_rule,
      fieldGroup: f.field_group,
      fieldSection: f.field_section,
    }));
}
