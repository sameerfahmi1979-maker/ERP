"use client";
import { queryKeys } from "@/lib/query/query-keys";
import { useConfigurationChoices } from "./use-configuration-choices";
import { mapCurrencyToOption, mapBankToOption, mapPaymentTermToOption, mapTaxTypeToOption } from "@/lib/lookups/option-mappers";
export interface CurrenciesQueryOptions { includeInactive?: boolean; enabled?: boolean; selectedId?: number | null }
export interface BanksQueryOptions extends CurrenciesQueryOptions { countryId?: number | null }
export type PaymentTermsQueryOptions = CurrenciesQueryOptions;
export type TaxTypesQueryOptions = CurrenciesQueryOptions;
export function useCurrenciesQuery(options: CurrenciesQueryOptions = {}) {
  const {includeInactive = false, enabled = true, selectedId} = options;
  return useConfigurationChoices("currencies", queryKeys.currencies(includeInactive), {includeInactive, selectedId}, mapCurrencyToOption, enabled);
}
export function useBanksQuery(options: BanksQueryOptions = {}) {
  const {includeInactive = false, enabled = true, selectedId, countryId = null} = options;
  return useConfigurationChoices("banks", queryKeys.banks(countryId, includeInactive), {includeInactive, selectedId, parentId: countryId}, mapBankToOption, enabled);
}
export function usePaymentTermsQuery(options: PaymentTermsQueryOptions = {}) {
  const {includeInactive = false, enabled = true, selectedId} = options;
  return useConfigurationChoices("paymentTerms", queryKeys.paymentTerms(includeInactive), {includeInactive, selectedId}, mapPaymentTermToOption, enabled);
}
export function useTaxTypesQuery(options: TaxTypesQueryOptions = {}) {
  const {includeInactive = false, enabled = true, selectedId} = options;
  return useConfigurationChoices("taxTypes", queryKeys.taxTypes(includeInactive), {includeInactive, selectedId}, mapTaxTypeToOption, enabled);
}
