/**
 * Barrel export for all ERP lookup / master-data query hooks.
 * Phase 002F.3E.3B.6B — Global Lookup Cache and Hook Standard
 * Phase 002F.3E.3B.6D — Apply Optimized Hooks to Current Forms (extended)
 *
 * Import from "@/hooks/lookups" in components and forms.
 */

export {
  useLookupValuesQuery,
  useLookupBatchQuery,
  type LookupQueryOptions,
  type LookupQueryResult,
  type LookupBatchQueryResult,
} from "./use-lookup-queries";

export {
  useCountriesQuery,
  useEmiratesQuery,
  useCitiesQuery,
  useAreasQuery,
  usePortsQuery,
  type CountriesQueryOptions,
  type EmiratesQueryOptions,
  type CitiesQueryOptions,
  type AreasQueryOptions,
  type PortsQueryOptions,
} from "./use-geography-queries";

export {
  useCurrenciesQuery,
  useBanksQuery,
  usePaymentTermsQuery,
  useTaxTypesQuery,
  type CurrenciesQueryOptions,
  type BanksQueryOptions,
  type PaymentTermsQueryOptions,
  type TaxTypesQueryOptions,
} from "./use-finance-queries";

export {
  useOwnerCompaniesQuery,
  useBranchesQuery,
  useCostCentersQuery,
  useProfitCentersQuery,
  type OwnerCompaniesQueryOptions,
  type BranchesQueryOptions,
  type CostCentersQueryOptions,
  type ProfitCentersQueryOptions,
} from "./use-org-queries";

export {
  useUomCategoriesQuery,
  useUnitsOfMeasureQuery,
  type UomCategoriesQueryOptions,
  type UnitsOfMeasureQueryOptions,
} from "./use-uom-queries";
