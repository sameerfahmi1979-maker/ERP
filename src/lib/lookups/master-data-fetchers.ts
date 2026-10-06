import { fetchConfigurationChoices } from "./configuration-fetchers";
import type { CountryRow, CurrencyRow, PaymentTermRow, TaxTypeRow } from "./option-mappers";
// Prefetch and mounted hooks retain the same projection and complete-result contract.
export const fetchCountries = (gccOnly = false, includeInactive = false, signal?: AbortSignal) =>
  fetchConfigurationChoices<CountryRow>("countries", {filter: gccOnly, includeInactive}, signal);
export const fetchCurrencies = (includeInactive = false, signal?: AbortSignal) =>
  fetchConfigurationChoices<CurrencyRow>("currencies", {includeInactive}, signal);
export const fetchPaymentTerms = (includeInactive = false, signal?: AbortSignal) =>
  fetchConfigurationChoices<PaymentTermRow>("paymentTerms", {includeInactive}, signal);
export const fetchTaxTypes = (includeInactive = false, signal?: AbortSignal) =>
  fetchConfigurationChoices<TaxTypeRow>("taxTypes", {includeInactive}, signal);
