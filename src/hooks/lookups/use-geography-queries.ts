"use client";
import { queryKeys } from "@/lib/query/query-keys";
import { useConfigurationChoices } from "./use-configuration-choices";
import { mapCountryToOption, mapEmirateToOption, mapCityToOption, mapAreaZoneToOption, mapPortToOption } from "@/lib/lookups/option-mappers";

interface ChoiceOptions { includeInactive?: boolean; enabled?: boolean; selectedId?: number | null }
export interface CountriesQueryOptions extends ChoiceOptions { gccOnly?: boolean }
export interface EmiratesQueryOptions extends ChoiceOptions { countryId?: number | null }
export interface CitiesQueryOptions extends ChoiceOptions { emirateId?: number | null }
export interface AreasQueryOptions extends ChoiceOptions { cityId?: number | null; areaTypeCode?: string | null }
export interface PortsQueryOptions extends ChoiceOptions { emirateId?: number | null; portTypeCode?: string | null }

export function useCountriesQuery(options: CountriesQueryOptions = {}) {
  const { gccOnly = false, includeInactive = false, enabled = true, selectedId } = options;
  return useConfigurationChoices("countries", queryKeys.countries(gccOnly, includeInactive), { filter: gccOnly, includeInactive, selectedId }, mapCountryToOption, enabled);
}
export function useEmiratesQuery(options: EmiratesQueryOptions = {}) {
  const { countryId = null, includeInactive = false, enabled = true, selectedId } = options;
  return useConfigurationChoices("emirates", queryKeys.emirates(countryId, includeInactive), { parentId: countryId, includeInactive, selectedId }, mapEmirateToOption, enabled);
}
export function useCitiesQuery(options: CitiesQueryOptions = {}) {
  const { emirateId = null, includeInactive = false, enabled = true, selectedId } = options;
  return useConfigurationChoices("cities", queryKeys.cities(emirateId, includeInactive), { parentId: emirateId, includeInactive, selectedId }, mapCityToOption, enabled);
}
export function useAreasQuery(options: AreasQueryOptions = {}) {
  const { cityId = null, areaTypeCode = null, includeInactive = false, enabled = true, selectedId } = options;
  return useConfigurationChoices("areas", [...queryKeys.areas(cityId, includeInactive), areaTypeCode], { parentId: cityId, filter: areaTypeCode, includeInactive, selectedId }, mapAreaZoneToOption, enabled);
}
export function usePortsQuery(options: PortsQueryOptions = {}) {
  const { emirateId = null, portTypeCode = null, includeInactive = false, enabled = true, selectedId } = options;
  return useConfigurationChoices("ports", queryKeys.ports(emirateId, portTypeCode, includeInactive), { parentId: emirateId, filter: portTypeCode, includeInactive, selectedId }, mapPortToOption, enabled);
}
