import type { SupabaseClient } from "@supabase/supabase-js";
import type { DmsAiMetadataField } from "./types";

/** Load active metadata field definitions for a document type (AI intake extraction). */
export async function loadMetadataFieldsForDocumentType(
  supabase: SupabaseClient,
  documentTypeId: number
): Promise<DmsAiMetadataField[]> {
  const { data } = await supabase
    .from("dms_metadata_definitions")
    .select(
      "field_code, field_label_en, field_type, is_required, is_ai_extractable, ai_field_hint, options_json"
    )
    .eq("document_type_id", documentTypeId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  return (data ?? [])
    .filter((f) => f.is_ai_extractable !== false)
    .map((f) => ({
      fieldCode: f.field_code as string,
      labelEn: f.field_label_en as string,
      fieldType: f.field_type as string,
      isRequired: (f.is_required as boolean) ?? false,
      aiFieldHint: (f.ai_field_hint as string | null) ?? null,
      optionsJson: (f.options_json as unknown) ?? null,
    }));
}
