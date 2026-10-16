/**
 * TanStack Query hooks for organisation and finance-centre master-data.
 * Phase 002F.3E.3B.6D — Apply Optimized Hooks to Current Forms
 *
 * Covers: owner companies, branches, cost centres, profit centres.
 */

"use client";
import { queryKeys } from "@/lib/query/query-keys";
import { useConfigurationChoices } from "./use-configuration-choices";
import { mapOwnerCompanyToOption, mapBranchToOption, mapCostCenterToOption, mapProfitCenterToOption } from "@/lib/lookups/option-mappers";
import type { FinanceCenterChoiceMode } from "@/features/master-data/finance-basics/types";
import { isFinanceParentChoiceScope } from "@/lib/lookups/configuration-fetchers";

export interface OwnerCompaniesQueryOptions { includeInactive?: boolean; enabled?: boolean; selectedId?: number | null }
export interface BranchesQueryOptions extends OwnerCompaniesQueryOptions { ownerCompanyId?: number | null }
export type CostCentersQueryOptions = BranchesQueryOptions & FinanceCenterChoiceMode;
export type ProfitCentersQueryOptions = CostCentersQueryOptions;

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
  const parent = options.choiceMode === "finance-parent" && isFinanceParentChoiceScope(options.parentScope) ? options.parentScope : null;
  // Invalid parent context must never hit a warm ordinary/global-parent key.
  return useConfigurationChoices("costCenters", options.choiceMode === "finance-parent"
    ? (parent ? queryKeys.costCenterParents(parent.companyId, parent.branchId, parent.excludeId) : ["master", "cost_centers", "finance-parent", "invalid"])
    : queryKeys.costCenters(ownerCompanyId, includeInactive),
    options.choiceMode === "finance-parent" ? { choiceMode: options.choiceMode, parentScope: options.parentScope, includeInactive: options.includeInactive, selectedId }
      : { parentId: ownerCompanyId, includeInactive, selectedId }, mapCostCenterToOption, enabled);
}
export function useProfitCentersQuery(options: ProfitCentersQueryOptions = {}) {
  const { ownerCompanyId = null, includeInactive = false, enabled = true, selectedId } = options;
  const parent = options.choiceMode === "finance-parent" && isFinanceParentChoiceScope(options.parentScope) ? options.parentScope : null;
  return useConfigurationChoices("profitCenters", options.choiceMode === "finance-parent"
    ? (parent ? queryKeys.profitCenterParents(parent.companyId, parent.branchId, parent.excludeId) : ["master", "profit_centers", "finance-parent", "invalid"])
    : queryKeys.profitCenters(ownerCompanyId, includeInactive),
    options.choiceMode === "finance-parent" ? { choiceMode: options.choiceMode, parentScope: options.parentScope, includeInactive: options.includeInactive, selectedId }
      : { parentId: ownerCompanyId, includeInactive, selectedId }, mapProfitCenterToOption, enabled);
}
