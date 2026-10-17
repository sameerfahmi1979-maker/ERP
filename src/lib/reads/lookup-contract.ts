import type { LookupValue } from "@/features/master-data/lookups/types";
/** Only fields delivered by the authorized option reader; never a management row. */
export type LookupChoice = Pick<LookupValue,
  "id" | "category_id" | "value_code" | "value_label_en" | "value_label_ar" |
  "color_hex" | "icon_name" | "badge_variant" | "sort_order" | "is_default" |
  "parent_value_id" | "is_active">;
