import { createClient } from "@/lib/supabase/client";
import { collectCompletePages } from "@/lib/reads/complete-pages";
import { ReadError } from "@/lib/reads/client";

// This is an internal, closed allowlist, not a client-supplied table/projection API.
const definitions = {
  currencies: { table: "currencies", columns: "id,currency_code,currency_name_en,currency_name_ar,symbol,is_base_currency", order: ["sort_order", "currency_name_en"], active: "is_active" },
  banks: { table: "banks", columns: "id,bank_code,bank_name_en,bank_name_ar,short_name", order: ["sort_order", "bank_name_en"], active: "is_active", parent: "country_id" },
  paymentTerms: { table: "payment_terms", columns: "id,term_code,term_name_en,term_name_ar,due_days", order: ["sort_order", "term_name_en"], active: "is_active" },
  taxTypes: { table: "tax_types", columns: "id,tax_code,tax_name_en,tax_name_ar,tax_rate", order: ["sort_order", "tax_name_en"], active: "is_active" },
  uomCategories: { table: "uom_categories", columns: "id,category_code,category_name_en,category_name_ar", order: ["sort_order", "category_name_en"], active: "is_active" },
  unitsOfMeasure: { table: "units_of_measure", columns: "id,unit_code,unit_name_en,unit_name_ar,symbol,is_base_unit", order: ["sort_order", "unit_name_en"], active: "is_active", parent: "uom_category_id" },
  ownerCompanies: { table: "owner_companies", columns: "id,company_code,legal_name_en,legal_name_ar,short_name", order: ["legal_name_en"], active: "status" },
  branches: { table: "branches", columns: "id,branch_code,branch_name_en,branch_name_ar,owner_company_id", order: ["branch_name_en"], active: "status", parent: "owner_company_id" },
  costCenters: { table: "cost_centers", columns: "id,cost_center_code,cost_center_name_en,cost_center_name_ar,owner_company_id", order: ["sort_order", "cost_center_name_en"], active: "is_active", parent: "owner_company_id" },
  profitCenters: { table: "profit_centers", columns: "id,profit_center_code,profit_center_name_en,profit_center_name_ar,owner_company_id", order: ["sort_order", "profit_center_name_en"], active: "is_active", parent: "owner_company_id" },
  countries: { table: "countries", columns: "id,country_code,name_en,name_ar,is_gcc", order: ["sort_order", "name_en"], active: "is_active", filter: "is_gcc" },
  emirates: { table: "emirates", columns: "id,emirate_code,name_en,name_ar", order: ["sort_order"], active: "is_active", parent: "country_id" },
  cities: { table: "cities", columns: "id,city_code,name_en,name_ar,emirate_id", order: ["sort_order", "name_en"], active: "is_active", parent: "emirate_id" },
  areas: { table: "areas_zones", columns: "id,area_code,name_en,name_ar,city_id,area_type_code", order: ["sort_order", "name_en"], active: "is_active", parent: "city_id", filter: "area_type_code" },
  ports: { table: "ports", columns: "id,port_code,name_en,name_ar,emirate_id,port_type_code", order: ["sort_order", "name_en"], active: "is_active", parent: "emirate_id", filter: "port_type_code" },
} as const;
export type ConfigurationResource = keyof typeof definitions;
export type ConfigurationParams = { includeInactive?: boolean; parentId?: number | null; filter?: string | boolean | null; selectedId?: number | null };

/** Preserve existing browser-client RLS and lean mapper shapes; no service-role reads. */
export async function fetchConfigurationChoices<T extends { id: number }>(resource: ConfigurationResource, params: ConfigurationParams = {}, signal?: AbortSignal): Promise<T[]> {
  const definition = definitions[resource];
  if (!definition || (params.parentId != null && (!Number.isSafeInteger(params.parentId) || params.parentId <= 0)) || (params.selectedId != null && (!Number.isSafeInteger(params.selectedId) || params.selectedId <= 0))) throw new ReadError("Invalid choice parameters", 400);
  const db = createClient();
  return collectCompletePages<T>(async (from, to) => {
    // Runtime projection is fixed by the closed allowlist; avoid expanding a
    // combinatorial union of every table's unrelated generated relationships.
    let query = db.from(definition.table).select(definition.columns as string, { count: "exact" }).retry(false);
    for (const order of definition.order) query = query.order(order, { ascending: true });
    query = query.order("id", { ascending: true });
    if ("parent" in definition && params.parentId != null) query = query.eq(definition.parent, params.parentId);
    if ("filter" in definition && params.filter != null && params.filter !== false && params.filter !== "") query = query.eq(definition.filter, params.filter);
    // Selected legacy values retain the SAME parent/filter and RLS predicates.
    // Only the active predicate is omitted; this grants no new row access.
    if (params.selectedId != null) query = query.eq("id", params.selectedId);
    else if (!params.includeInactive) query = query.eq(definition.active, definition.active === "status" ? "active" : true);
    query = query.range(from, to);
    if (signal) query = query.abortSignal(signal);
    const result = await query;
    if (result.error) throw new ReadError("Choices could not be loaded. Please retry.", result.status || 503);
    return { data: result.data as unknown as T[] | null, count: result.count, error: null };
  }, { signal, identity: row => row.id, maxRows: 10_000 });
}
