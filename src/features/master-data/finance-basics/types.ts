/**
 * TypeScript types for Finance Basics Master Data
 * Phase 002F.3C.2
 */

// ============================================================================
// Database Types
// ============================================================================

export interface Currency {
  id: number;
  currency_code: string;
  currency_name_en: string;
  currency_name_ar: string | null;
  symbol: string | null;
  decimal_places: number;
  is_base_currency: boolean;
  description_en: string | null;
  description_ar: string | null;
  notes: string | null;
  is_system: boolean;
  is_locked: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  created_by: number | null;
  updated_at: string;
  updated_by: number | null;
  deactivated_at: string | null;
  deactivated_by: number | null;
  deactivation_reason: string | null;
}

export interface PaymentTerm {
  id: number;
  term_code: string;
  term_name_en: string;
  term_name_ar: string | null;
  due_days: number;
  advance_percentage: number;
  retention_percentage: number;
  calculation_notes: string | null;
  description_en: string | null;
  description_ar: string | null;
  notes: string | null;
  is_system: boolean;
  is_locked: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  created_by: number | null;
  updated_at: string;
  updated_by: number | null;
  deactivated_at: string | null;
  deactivated_by: number | null;
  deactivation_reason: string | null;
}

export interface TaxType {
  id: number;
  tax_code: string;
  tax_name_en: string;
  tax_name_ar: string | null;
  tax_rate: number;
  tax_treatment_code: string;
  is_vat: boolean;
  is_reverse_charge: boolean;
  applies_to_sales: boolean;
  applies_to_purchases: boolean;
  applies_to_scrap: boolean;
  effective_from: string;
  effective_to: string | null;
  description_en: string | null;
  description_ar: string | null;
  notes: string | null;
  is_system: boolean;
  is_locked: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  created_by: number | null;
  updated_at: string;
  updated_by: number | null;
  deactivated_at: string | null;
  deactivated_by: number | null;
  deactivation_reason: string | null;
}

export interface Bank {
  id: number;
  bank_code: string;
  bank_name_en: string;
  bank_name_ar: string | null;
  short_name: string | null;
  country_id: number | null;
  bank_type_code: string | null;
  swift_code: string | null;
  website_url: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  description_en: string | null;
  description_ar: string | null;
  notes: string | null;
  is_system: boolean;
  is_locked: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  created_by: number | null;
  updated_at: string;
  updated_by: number | null;
  deactivated_at: string | null;
  deactivated_by: number | null;
  deactivation_reason: string | null;
}

export interface CostCenter {
  id: number;
  cost_center_code: string;
  cost_center_name_en: string;
  cost_center_name_ar: string | null;
  cost_center_type_code: string | null;
  parent_cost_center_id: number | null;
  owner_company_id: number | null;
  branch_id: number | null;
  description_en: string | null;
  description_ar: string | null;
  notes: string | null;
  is_system: boolean;
  is_locked: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  created_by: number | null;
  updated_at: string;
  updated_by: number | null;
  deactivated_at: string | null;
  deactivated_by: number | null;
  deactivation_reason: string | null;
}

export interface ProfitCenter {
  id: number;
  profit_center_code: string;
  profit_center_name_en: string;
  profit_center_name_ar: string | null;
  profit_center_type_code: string | null;
  parent_profit_center_id: number | null;
  owner_company_id: number | null;
  branch_id: number | null;
  description_en: string | null;
  description_ar: string | null;
  notes: string | null;
  is_system: boolean;
  is_locked: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  created_by: number | null;
  updated_at: string;
  updated_by: number | null;
  deactivated_at: string | null;
  deactivated_by: number | null;
  deactivation_reason: string | null;
}

// ============================================================================
// Extended Types (with relationships)
// ============================================================================

export interface BankWithCountry extends Bank {
  country?: {
    country_code: string;
    name_en: string;
    name_ar: string | null;
  };
}

export interface CostCenterWithRelations extends CostCenter {
  parent?: {
    cost_center_code: string;
    cost_center_name_en: string;
    cost_center_name_ar: string | null;
  };
  owner_company?: {
    company_code: string;
    legal_name_en: string;
  };
  branch?: {
    branch_code: string;
    branch_name_en: string;
    branch_name_ar: string | null;
  };
}

export interface ProfitCenterWithRelations extends ProfitCenter {
  parent?: {
    profit_center_code: string;
    profit_center_name_en: string;
    profit_center_name_ar: string | null;
  };
  owner_company?: {
    company_code: string;
    legal_name_en: string;
  };
  branch?: {
    branch_code: string;
    branch_name_en: string;
    branch_name_ar: string | null;
  };
}

// ============================================================================
// Input Types (for create/update operations)
// ============================================================================

export interface CreateCurrencyInput {
  currency_code: string;
  currency_name_en: string;
  currency_name_ar?: string | null;
  symbol?: string | null;
  decimal_places?: number;
  is_base_currency?: boolean;
  description_en?: string | null;
  description_ar?: string | null;
  notes?: string | null;
  sort_order?: number;
}

export interface UpdateCurrencyInput {
  id: number;
  currency_name_en?: string;
  currency_name_ar?: string | null;
  symbol?: string | null;
  decimal_places?: number;
  is_base_currency?: boolean;
  description_en?: string | null;
  description_ar?: string | null;
  notes?: string | null;
  is_active?: boolean;
  sort_order?: number;
}

export interface CreatePaymentTermInput {
  term_code: string;
  term_name_en: string;
  term_name_ar?: string | null;
  due_days?: number;
  advance_percentage?: number;
  retention_percentage?: number;
  calculation_notes?: string | null;
  description_en?: string | null;
  description_ar?: string | null;
  notes?: string | null;
  sort_order?: number;
}

export interface UpdatePaymentTermInput {
  id: number;
  term_name_en?: string;
  term_name_ar?: string | null;
  due_days?: number;
  advance_percentage?: number;
  retention_percentage?: number;
  calculation_notes?: string | null;
  description_en?: string | null;
  description_ar?: string | null;
  notes?: string | null;
  is_active?: boolean;
  sort_order?: number;
}

export interface CreateTaxTypeInput {
  tax_code: string;
  tax_name_en: string;
  tax_name_ar?: string | null;
  tax_rate?: number;
  tax_treatment_code: string;
  is_vat?: boolean;
  is_reverse_charge?: boolean;
  applies_to_sales?: boolean;
  applies_to_purchases?: boolean;
  applies_to_scrap?: boolean;
  effective_from?: string;
  effective_to?: string | null;
  description_en?: string | null;
  description_ar?: string | null;
  notes?: string | null;
  sort_order?: number;
}

export interface UpdateTaxTypeInput {
  id: number;
  tax_name_en?: string;
  tax_name_ar?: string | null;
  tax_rate?: number;
  tax_treatment_code?: string;
  is_vat?: boolean;
  is_reverse_charge?: boolean;
  applies_to_sales?: boolean;
  applies_to_purchases?: boolean;
  applies_to_scrap?: boolean;
  effective_from?: string;
  effective_to?: string | null;
  description_en?: string | null;
  description_ar?: string | null;
  notes?: string | null;
  is_active?: boolean;
  sort_order?: number;
}

export interface CreateBankInput {
  bank_code: string;
  bank_name_en: string;
  bank_name_ar?: string | null;
  short_name?: string | null;
  country_id?: number | null;
  bank_type_code?: string | null;
  swift_code?: string | null;
  website_url?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  description_en?: string | null;
  description_ar?: string | null;
  notes?: string | null;
  sort_order?: number;
}

export interface UpdateBankInput {
  id: number;
  bank_name_en?: string;
  bank_name_ar?: string | null;
  short_name?: string | null;
  country_id?: number | null;
  bank_type_code?: string | null;
  swift_code?: string | null;
  website_url?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  description_en?: string | null;
  description_ar?: string | null;
  notes?: string | null;
  is_active?: boolean;
  sort_order?: number;
}

export interface CreateCostCenterInput {
  cost_center_code: string;
  cost_center_name_en: string;
  cost_center_name_ar?: string | null;
  cost_center_type_code?: string | null;
  parent_cost_center_id?: number | null;
  owner_company_id?: number | null;
  branch_id?: number | null;
  description_en?: string | null;
  description_ar?: string | null;
  notes?: string | null;
  sort_order?: number;
}

export interface UpdateCostCenterInput {
  id: number;
  cost_center_name_en?: string;
  cost_center_name_ar?: string | null;
  cost_center_type_code?: string | null;
  parent_cost_center_id?: number | null;
  owner_company_id?: number | null;
  branch_id?: number | null;
  description_en?: string | null;
  description_ar?: string | null;
  notes?: string | null;
  is_active?: boolean;
  sort_order?: number;
}

export interface CreateProfitCenterInput {
  profit_center_code: string;
  profit_center_name_en: string;
  profit_center_name_ar?: string | null;
  profit_center_type_code?: string | null;
  parent_profit_center_id?: number | null;
  owner_company_id?: number | null;
  branch_id?: number | null;
  description_en?: string | null;
  description_ar?: string | null;
  notes?: string | null;
  sort_order?: number;
}

export interface UpdateProfitCenterInput {
  id: number;
  profit_center_name_en?: string;
  profit_center_name_ar?: string | null;
  profit_center_type_code?: string | null;
  parent_profit_center_id?: number | null;
  owner_company_id?: number | null;
  branch_id?: number | null;
  description_en?: string | null;
  description_ar?: string | null;
  notes?: string | null;
  is_active?: boolean;
  sort_order?: number;
}

// ============================================================================
// Filter/Query Types
// ============================================================================

export interface CurrencyFilters {
  search?: string;
  is_active?: boolean;
  is_base_currency?: boolean;
  is_system?: boolean;
  is_locked?: boolean;
}

export interface PaymentTermFilters {
  search?: string;
  is_active?: boolean;
  is_system?: boolean;
  is_locked?: boolean;
}

export interface TaxTypeFilters {
  search?: string;
  tax_treatment_code?: string;
  is_vat?: boolean;
  is_reverse_charge?: boolean;
  is_active?: boolean;
  is_system?: boolean;
  is_locked?: boolean;
}

export interface BankFilters {
  search?: string;
  country_id?: number;
  bank_type_code?: string;
  is_active?: boolean;
  is_system?: boolean;
  is_locked?: boolean;
}

export interface CostCenterFilters {
  search?: string;
  owner_company_id?: number;
  branch_id?: number;
  parent_cost_center_id?: number;
  cost_center_type_code?: string;
  is_active?: boolean;
  is_system?: boolean;
  is_locked?: boolean;
}

export interface ProfitCenterFilters {
  search?: string;
  owner_company_id?: number;
  branch_id?: number;
  parent_profit_center_id?: number;
  profit_center_type_code?: string;
  is_active?: boolean;
  is_system?: boolean;
  is_locked?: boolean;
}

// ============================================================================
// Select Component Props Types
// ============================================================================

export interface FinanceBasicsSelectOption {
  value: number;
  label: string;
  code?: string;
  parent_id?: number | null;
  is_system?: boolean;
  is_locked?: boolean;
}

export interface FinanceBasicsSelectProps {
  value?: number | null;
  onValueChange?: (value: number | null) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  includeInactive?: boolean;
  language?: "en" | "ar";
  showCode?: boolean;
  allowClear?: boolean;
  className?: string;
  name?: string;
  error?: string;
}

export interface CurrencySelectProps extends FinanceBasicsSelectProps {}

export interface PaymentTermSelectProps extends FinanceBasicsSelectProps {}

export interface TaxTypeSelectProps extends FinanceBasicsSelectProps {
  appliesToSales?: boolean;
  appliesToPurchases?: boolean;
  appliesToScrap?: boolean;
}

export interface BankSelectProps extends FinanceBasicsSelectProps {
  countryId?: number | null;
  bankTypeCode?: string | null;
}

export interface CostCenterSelectProps extends FinanceBasicsSelectProps {
  ownerCompanyId?: number | null;
  branchId?: number | null;
  parentCostCenterId?: number | null;
  excludeId?: number | null;
}

export interface ProfitCenterSelectProps extends FinanceBasicsSelectProps {
  ownerCompanyId?: number | null;
  branchId?: number | null;
  parentProfitCenterId?: number | null;
  excludeId?: number | null;
}
