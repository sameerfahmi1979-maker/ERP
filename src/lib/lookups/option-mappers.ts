/**
 * Typed option-mapper utilities for converting ERP master-data rows into
 * ERPComboboxOption objects.
 * Phase 002F.3E.3B.6B — Global Lookup Cache and Hook Standard
 *
 * Rules:
 *  - value  must be a stable primitive (id as number)
 *  - label  must be a human-readable English name
 *  - code   included where available for searchability
 *  - raw    preserves the original row so renderOption callbacks can access it
 */

import type { ERPComboboxOption } from "@/components/erp/combobox";
import type { LookupValue } from "@/features/master-data/lookups/types";

// ── Lookup engine ─────────────────────────────────────────────────────────────

export function mapLookupValueToOption(row: LookupValue): ERPComboboxOption {
  return {
    value: row.id,
    label: row.value_label_en,
    labelAr: row.value_label_ar,
    code: row.value_code,
    colorHex: row.color_hex,
    badge: row.badge_variant,
    raw: row,
  };
}

// ── Geography ─────────────────────────────────────────────────────────────────

export interface CountryRow {
  id: number;
  country_code: string;
  name_en: string;
  name_ar: string | null;
  is_gcc: boolean;
}

export function mapCountryToOption(row: CountryRow): ERPComboboxOption {
  return {
    value: row.id,
    label: row.name_en,
    labelAr: row.name_ar,
    code: row.country_code,
    raw: row,
  };
}

export interface EmirateRow {
  id: number;
  emirate_code: string;
  name_en: string;
  name_ar: string | null;
}

export function mapEmirateToOption(row: EmirateRow): ERPComboboxOption {
  return {
    value: row.id,
    label: row.name_en,
    labelAr: row.name_ar,
    code: row.emirate_code,
    raw: row,
  };
}

export interface CityRow {
  id: number;
  city_code: string;
  name_en: string;
  name_ar: string | null;
  emirate_id: number;
}

export function mapCityToOption(row: CityRow): ERPComboboxOption {
  return {
    value: row.id,
    label: row.name_en,
    labelAr: row.name_ar,
    code: row.city_code,
    raw: row,
  };
}

export interface AreaZoneRow {
  id: number;
  area_code: string;
  name_en: string;
  name_ar: string | null;
  city_id: number;
  area_type_code: string | null;
}

export function mapAreaZoneToOption(row: AreaZoneRow): ERPComboboxOption {
  return {
    value: row.id,
    label: row.name_en,
    labelAr: row.name_ar,
    code: row.area_code,
    raw: row,
  };
}

// ── Finance basics ─────────────────────────────────────────────────────────────

export interface CurrencyRow {
  id: number;
  currency_code: string;
  currency_name_en: string;
  currency_name_ar: string | null;
  symbol: string | null;
  is_base_currency: boolean;
}

export function mapCurrencyToOption(row: CurrencyRow): ERPComboboxOption {
  return {
    value: row.id,
    label: row.currency_name_en,
    labelAr: row.currency_name_ar,
    code: row.currency_code,
    description: row.symbol,
    raw: row,
  };
}

export interface BankRow {
  id: number;
  bank_code: string;
  bank_name_en: string;
  bank_name_ar: string | null;
  short_name: string | null;
}

export function mapBankToOption(row: BankRow): ERPComboboxOption {
  return {
    value: row.id,
    label: row.bank_name_en,
    labelAr: row.bank_name_ar,
    code: row.bank_code,
    description: row.short_name,
    raw: row,
  };
}

export interface PaymentTermRow {
  id: number;
  term_code: string;
  term_name_en: string;
  term_name_ar: string | null;
  due_days: number;
}

export function mapPaymentTermToOption(row: PaymentTermRow): ERPComboboxOption {
  return {
    value: row.id,
    label: row.term_name_en,
    labelAr: row.term_name_ar,
    code: row.term_code,
    raw: row,
  };
}

export interface TaxTypeRow {
  id: number;
  tax_code: string;
  tax_name_en: string;
  tax_name_ar: string | null;
  tax_rate: number;
}

export function mapTaxTypeToOption(row: TaxTypeRow): ERPComboboxOption {
  return {
    value: row.id,
    label: row.tax_name_en,
    labelAr: row.tax_name_ar,
    code: row.tax_code,
    raw: row,
  };
}

// ── Ports ─────────────────────────────────────────────────────────────────────

export interface PortRow {
  id: number;
  port_code: string;
  name_en: string;
  name_ar: string | null;
  emirate_id: number | null;
  port_type_code: string | null;
}

export function mapPortToOption(row: PortRow): ERPComboboxOption {
  return {
    value: row.id,
    label: row.name_en,
    labelAr: row.name_ar,
    code: row.port_code,
    raw: row,
  };
}

// ── UOM ───────────────────────────────────────────────────────────────────────

export interface UomCategoryRow {
  id: number;
  category_code: string;
  category_name_en: string;
  category_name_ar: string | null;
}

export function mapUomCategoryToOption(row: UomCategoryRow): ERPComboboxOption {
  return {
    value: row.id,
    label: row.category_name_en,
    labelAr: row.category_name_ar,
    code: row.category_code,
    raw: row,
  };
}

export interface UnitOfMeasureRow {
  id: number;
  unit_code: string;
  unit_name_en: string;
  unit_name_ar: string | null;
  symbol: string | null;
  is_base_unit: boolean;
}

export function mapUnitOfMeasureToOption(row: UnitOfMeasureRow): ERPComboboxOption {
  return {
    value: row.id,
    label: row.unit_name_en,
    labelAr: row.unit_name_ar,
    code: row.unit_code,
    description: row.symbol,
    raw: row,
  };
}

// ── Organisation ─────────────────────────────────────────────────────────────

export interface OwnerCompanyRow {
  id: number;
  company_code: string;
  legal_name_en: string;
  legal_name_ar: string | null;
  short_name: string | null;
}

export function mapOwnerCompanyToOption(row: OwnerCompanyRow): ERPComboboxOption {
  return {
    value: row.id,
    label: row.short_name ?? row.legal_name_en,
    labelAr: row.legal_name_ar,
    code: row.company_code,
    description: row.short_name ? row.legal_name_en : null,
    raw: row,
  };
}

export interface BranchRow {
  id: number;
  branch_code: string;
  branch_name_en: string;
  branch_name_ar: string | null;
  owner_company_id: number;
}

export function mapBranchToOption(row: BranchRow): ERPComboboxOption {
  return {
    value: row.id,
    label: row.branch_name_en,
    labelAr: row.branch_name_ar,
    code: row.branch_code,
    raw: row,
  };
}

// ── Finance cost / profit centres ─────────────────────────────────────────────

export interface CostCenterRow {
  id: number;
  cost_center_code: string;
  cost_center_name_en: string;
  cost_center_name_ar: string | null;
  owner_company_id: number | null;
}

export function mapCostCenterToOption(row: CostCenterRow): ERPComboboxOption {
  return {
    value: row.id,
    label: row.cost_center_name_en,
    labelAr: row.cost_center_name_ar,
    code: row.cost_center_code,
    raw: row,
  };
}

export interface ProfitCenterRow {
  id: number;
  profit_center_code: string;
  profit_center_name_en: string;
  profit_center_name_ar: string | null;
  owner_company_id: number | null;
}

export function mapProfitCenterToOption(row: ProfitCenterRow): ERPComboboxOption {
  return {
    value: row.id,
    label: row.profit_center_name_en,
    labelAr: row.profit_center_name_ar,
    code: row.profit_center_code,
    raw: row,
  };
}

// ── Generic helpers ───────────────────────────────────────────────────────────

/**
 * Generic mapper for rows that have {id, code, name_en, name_ar}.
 * Useful for UOM categories, ports, and any future simple lookup tables.
 */
export function mapGenericCodeNameToOption(row: {
  id: number;
  code: string;
  name_en: string;
  name_ar: string | null;
  [key: string]: unknown;
}): ERPComboboxOption {
  return {
    value: row.id,
    label: row.name_en,
    labelAr: row.name_ar,
    code: row.code,
    raw: row,
  };
}
