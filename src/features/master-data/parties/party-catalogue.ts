import { z } from "zod";
import type { Party } from "./party-types";

export const partyCataloguePageSize = 25;

export const partyCatalogueColumns = {
  party_code: "Party Code",
  display_name: "Display Name",
  party_status_name: "Status",
  country_name: "Country",
  emirate_name: "Emirate",
  main_phone: "Phone",
  main_email: "Email",
  updated_at: "Updated",
} as const;
export type PartyCatalogueColumn = keyof typeof partyCatalogueColumns;
const safeColumn = z.custom<PartyCatalogueColumn>(value => typeof value === "string" && Object.hasOwn(partyCatalogueColumns, value));
const locale = z.string().max(100).refine(value => {
  try { return Intl.getCanonicalLocales(value).length === 1; } catch { return false; }
});
const view = z.object({
  typeCode: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/).optional(),
  search: z.string().default(""),
  filters: z.array(z.object({ id: safeColumn, value: z.string() }).strict()).max(8).default([]),
  sorting: z.array(z.object({ id: safeColumn, desc: z.boolean() }).strict()).max(8).default([]),
  locale: locale.optional(),
});
export const partyCataloguePageInput = view.extend({
  pageIndex: z.number().int().min(0).max(100_000).default(0),
  pageSize: z.union([z.literal(10), z.literal(25), z.literal(50), z.literal(100)]).default(partyCataloguePageSize),
}).strict();
export const partyCatalogueExportInput = view.extend({
  selectedIds: z.array(z.number().int().positive().safe()).min(1).refine(ids => ids.length === new Set(ids).size).optional(),
}).strict();
export type PartyCatalogueCriteria = z.output<typeof view>;

export type PartyCatalogueRow = Pick<Party,
  "id" | "workspace_revision" | "party_code" | "display_name" | "legal_name_en" |
  "main_phone" | "main_mobile" | "main_email" | "country_id" | "emirate_id" | "city_id" |
  "area_zone_id" | "is_active" | "is_locked" | "updated_at" | "party_status_name" |
  "primary_type_name" | "country_name" | "emirate_name" | "assigned_type_codes"> & {
  party_types?: { type_name?: string } | null;
};

export type PartyCataloguePage = {
  rows: PartyCatalogueRow[];
  totalCount: number;
  sortAscendingFirst?: PartyCatalogueColumn[];
};

export function partyCatalogueSortDirections(first?: PartyCatalogueRow) {
  return (Object.keys(partyCatalogueColumns) as PartyCatalogueColumn[]).filter(id => typeof first?.[id] === "string");
}
