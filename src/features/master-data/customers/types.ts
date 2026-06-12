/**
 * Customer Types
 * Generated from live Supabase schema
 * Phase: 002F.3E.3 — Customers Module
 */

export interface Customer {
  id: number;
  customer_code: string;
  customer_name_en: string;
  customer_name_ar: string | null;
  customer_type_code: string;
  industry_type_code: string | null;
  customer_segment_code: string | null;
  lead_source_code: string | null;
  trn: string | null;
  trade_license_number: string | null;
  license_expiry_date: string | null;
  website_url: string | null;
  primary_email: string | null;
  primary_phone: string | null;
  primary_mobile: string | null;
  country_id: number | null;
  emirate_id: number | null;
  city_id: number | null;
  area_zone_id: number | null;
  address_line_1: string | null;
  address_line_2: string | null;
  po_box: string | null;
  makani_number: string | null;
  currency_id: number | null;
  payment_term_id: number | null;
  tax_type_id: number | null;
  credit_limit: number | null;
  credit_days: number | null;
  sales_owner_user_profile_id: number | null;
  icv_certificate_number: string | null;
  icv_score_percentage: number | null;
  icv_issue_date: string | null;
  icv_expiry_date: string | null;
  icv_company_type: string | null;
  icv_financial_year_end_date: string | null;
  icv_certification_body: string | null;
  icv_version: string | null;
  icv_status_code: string | null;
  icv_document_path: string | null;
  cicpa_registration_number: string | null;
  notes: string | null;
  status_code: string;
  created_at: string;
  created_by: number | null;
  updated_at: string;
  updated_by: number | null;
  deactivated_at: string | null;
  deactivated_by: number | null;
  deactivation_reason: string | null;
  is_active: boolean;
  is_locked: boolean;
  is_system: boolean;
  sort_order: number;
}

export interface CustomerContact {
  id: number;
  customer_id: number;
  contact_code: string;
  contact_name_en: string;
  contact_name_ar: string | null;
  designation: string | null;
  department: string | null;
  contact_type_code: string | null;
  email: string | null;
  mobile: string | null;
  phone: string | null;
  whatsapp: string | null;
  is_primary: boolean;
  is_authorized_signatory: boolean;
  is_decision_maker: boolean;
  is_finance_contact: boolean;
  is_operations_contact: boolean;
  preferred_communication_code: string | null;
  notes: string | null;
  status_code: string;
  created_at: string;
  created_by: number | null;
  updated_at: string;
  updated_by: number | null;
  deactivated_at: string | null;
  deactivated_by: number | null;
  deactivation_reason: string | null;
  is_active: boolean;
  is_locked: boolean;
  is_system: boolean;
  sort_order: number;
}

export interface CustomerAddress {
  id: number;
  customer_id: number;
  address_type_code: string | null;
  country_id: number | null;
  emirate_id: number | null;
  city_id: number | null;
  area_zone_id: number | null;
  address_line_1: string | null;
  address_line_2: string | null;
  building_name: string | null;
  street_name: string | null;
  po_box: string | null;
  makani_number: string | null;
  latitude: number | null;
  longitude: number | null;
  is_primary: boolean;
  is_billing_address: boolean;
  is_shipping_address: boolean;
  notes: string | null;
  status_code: string;
  created_at: string;
  created_by: number | null;
  updated_at: string;
  updated_by: number | null;
  deactivated_at: string | null;
  deactivated_by: number | null;
  deactivation_reason: string | null;
  is_active: boolean;
  is_locked: boolean;
  is_system: boolean;
  sort_order: number;
}

export interface CustomerBankDetail {
  id: number;
  customer_id: number;
  bank_id: number | null;
  bank_account_type_code: string | null;
  account_name: string;
  account_number: string;
  iban: string | null;
  swift_code: string | null;
  currency_id: number | null;
  is_primary: boolean;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  created_by: number | null;
  updated_at: string;
  updated_by: number | null;
}

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};
