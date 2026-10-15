"use client";
import { queryKeys } from "@/lib/query/query-keys";
import { useConfigurationChoices } from "./use-configuration-choices";
import { mapOwnerCompanyToOption, mapBranchToOption, mapCostCenterToOption, mapProfitCenterToOption } from "@/lib/lookups/option-mappers";

export interface OwnerCompaniesQueryOptions { includeInactive?: boolean; enabled?: boolean; selectedId?: number | null }
export interface BranchesQueryOptions extends OwnerCompaniesQueryOptions { ownerCompanyId?: number | null }
export type CostCentersQueryOptions = BranchesQueryOptions;
export type ProfitCentersQueryOptions = BranchesQueryOptions;

// Preserve existing keys/mappers and browser RLS. Invalidation still covers
// every parent/active/selected variant; no competing organization cache.
export function useOwnerCompaniesQuery(options: OwnerCompaniesQueryOptions = {}) {
  const { includeInactive = false, enabled = true, selectedId } = options;
  return useConfigurationChoices("ownerCompanies", queryKeys.ownerCompanies(includeInactive), { includeInactive, selectedId }, mapOwnerCompanyToOption, enabled);
}
export function useBranchesQuery(options: BranchesQueryOptions = {}) {
  const { ownerCompanyId = null, includeInactive = false, enabled = true, selectedId } = options;
  return useConfigurationChoices("branches", queryKeys.branches(ownerCompanyId, includeInactive), { parentId: ownerCompanyId, includeInactive, selectedId }, mapBranchToOption, enabled);
}
export function useCostCentersQuery(options: CostCentersQueryOptions = {}) {
  const { ownerCompanyId = null, includeInactive = false, enabled = true, selectedId } = options;
  return useConfigurationChoices("costCenters", queryKeys.costCenters(ownerCompanyId, includeInactive), { parentId: ownerCompanyId, includeInactive, selectedId }, mapCostCenterToOption, enabled);
}
export function useProfitCentersQuery(options: ProfitCentersQueryOptions = {}) {
  const { ownerCompanyId = null, includeInactive = false, enabled = true, selectedId } = options;
  return useConfigurationChoices("profitCenters", queryKeys.profitCenters(ownerCompanyId, includeInactive), { parentId: ownerCompanyId, includeInactive, selectedId }, mapProfitCenterToOption, enabled);
}
