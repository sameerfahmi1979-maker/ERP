"use client";

import {queryKeys} from "@/lib/query/query-keys";
import {useConfigurationChoices} from "./use-configuration-choices";
import {mapCurrencyToOption,mapBankToOption,mapPaymentTermToOption,mapTaxTypeToOption,type CurrencyRow,type BankRow,type PaymentTermRow,type TaxTypeRow} from "@/lib/lookups/option-mappers";

// Keep the established catalogue keys; exact saved rows use the shared selected-only suffix.
export interface CurrenciesQueryOptions {
  includeInactive?: boolean;
  enabled?: boolean;
  selectedId?: number | null;
}
export function useCurrenciesQuery(options: CurrenciesQueryOptions = {}) {
  const {includeInactive = false, enabled = true, selectedId = null} = options;
  return useConfigurationChoices<CurrencyRow>("currencies", queryKeys.currencies(includeInactive), {includeInactive, selectedId}, mapCurrencyToOption, enabled);
}

export interface BanksQueryOptions {
  includeInactive?: boolean;
  enabled?: boolean;
  selectedId?: number | null;
  countryId?: number | null;
}
export function useBanksQuery(options: BanksQueryOptions = {}) {
  const {includeInactive = false, enabled = true, selectedId = null, countryId = null} = options;
  return useConfigurationChoices<BankRow>("banks", queryKeys.banks(countryId, includeInactive), {includeInactive, selectedId, parentId: countryId}, mapBankToOption, enabled);
}

export interface PaymentTermsQueryOptions {
  includeInactive?: boolean;
  enabled?: boolean;
  selectedId?: number | null;
}
export function usePaymentTermsQuery(options: PaymentTermsQueryOptions = {}) {
  const {includeInactive = false, enabled = true, selectedId = null} = options;
  return useConfigurationChoices<PaymentTermRow>("paymentTerms", queryKeys.paymentTerms(includeInactive), {includeInactive, selectedId}, mapPaymentTermToOption, enabled);
}

export interface TaxTypesQueryOptions {
  includeInactive?: boolean;
  enabled?: boolean;
  selectedId?: number | null;
}
export function useTaxTypesQuery(options: TaxTypesQueryOptions = {}) {
  const {includeInactive = false, enabled = true, selectedId = null} = options;
  return useConfigurationChoices<TaxTypeRow>("taxTypes", queryKeys.taxTypes(includeInactive), {includeInactive, selectedId}, mapTaxTypeToOption, enabled);
}
