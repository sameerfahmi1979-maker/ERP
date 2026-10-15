"use client";
import { queryKeys } from "@/lib/query/query-keys";
import { useConfigurationChoices } from "./use-configuration-choices";
import { mapUomCategoryToOption, mapUnitOfMeasureToOption } from "@/lib/lookups/option-mappers";
export interface UomCategoriesQueryOptions { includeInactive?: boolean; enabled?: boolean; selectedId?: number | null }
export interface UnitsOfMeasureQueryOptions extends UomCategoriesQueryOptions { categoryId?: number | null }
export function useUomCategoriesQuery(options: UomCategoriesQueryOptions = {}) {
  const {includeInactive = false, enabled = true, selectedId} = options;
  return useConfigurationChoices("uomCategories", queryKeys.uomCategories(includeInactive), {includeInactive, selectedId}, mapUomCategoryToOption, enabled);
}
export function useUnitsOfMeasureQuery(options: UnitsOfMeasureQueryOptions = {}) {
  const {includeInactive = false, enabled = true, selectedId, categoryId = null} = options;
  return useConfigurationChoices("unitsOfMeasure", queryKeys.unitsOfMeasure(categoryId, includeInactive), {includeInactive, selectedId, parentId: categoryId}, mapUnitOfMeasureToOption, enabled);
}
