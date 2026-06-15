/**
 * TypeScript types for the Unified Party Master module.
 * Phase ERP BASE 002F.5A.2
 */

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

// ─── Core Party ──────────────────────────────────────────────────────────────

export type Party = {
  id: number;
  party_code: string;
  display_name: string;
  legal_name_en: string;
  legal_name_ar: string | null;
  trade_name_en: string | null;
  trade_name_ar: string | null;
  short_name: string | null;
  party_nature_id: number;
  primary_party_type_id: number | null;
  parent_party_id: number | null;
  main_phone: string | null;
  main_mobile: string | null;
  whatsapp: string | null;
  main_email: string | null;
  alternate_email: string | null;
  website: string | null;
  country_id: number;
  emirate_id: number | null;
  city_id: number | null;
  area_zone_id: number | null;
  po_box: string | null;
  full_address_text: string | null;
  google_map_url: string | null;
  latitude: number | null;
  longitude: number | null;
  party_status_id: number;
  is_active: boolean;
  is_locked: boolean;
  is_system: boolean;
  remarks: string | null;
  deactivated_at: string | null;
  deactivated_by: number | null;
  deactivation_reason: string | null;
  created_at: string;
  created_by: number | null;
  updated_at: string;
  updated_by: number | null;
  // Joined/computed fields from queries
  party_nature_name?: string | null;
  party_status_name?: string | null;
  primary_type_name?: string | null;
  country_name?: string | null;
  emirate_name?: string | null;
  city_name?: string | null;
  assigned_type_codes?: string[];
};

// ─── Lookup Tables ───────────────────────────────────────────────────────────

export type PartyType = {
  id: number;
  type_code: string;
  type_name: string;
  type_name_ar: string | null;
  is_system: boolean;
  is_active: boolean;
  sort_order: number;
};

export type PartyNature = {
  id: number;
  nature_code: string;
  name_en: string;
  name_ar: string | null;
  is_system: boolean;
  is_active: boolean;
  sort_order: number;
};

export type PartyStatus = {
  id: number;
  status_code: string;
  name_en: string;
  is_system: boolean;
  sort_order: number;
};

export type PartyLicenseType = {
  id: number;
  license_type_code: string;
  name_en: string;
  is_system: boolean;
  is_active: boolean;
  sort_order: number;
};

export type PartyLicenseStatus = {
  id: number;
  license_status_code: string;
  name_en: string;
  is_system: boolean;
  sort_order: number;
};

export type PartyTaxStatus = {
  id: number;
  tax_status_code: string;
  name_en: string;
  is_system: boolean;
  sort_order: number;
};

export type PartyContactRole = {
  id: number;
  contact_role_code: string;
  name_en: string;
  is_system: boolean;
  sort_order: number;
};

export type PartyContactDepartment = {
  id: number;
  contact_department_code: string;
  name_en: string;
  is_system: boolean;
  sort_order: number;
};

export type PartyAddressType = {
  id: number;
  address_type_code: string;
  name_en: string;
  is_system: boolean;
  sort_order: number;
};

export type PartyDocumentType = {
  id: number;
  document_type_code: string;
  name_en: string;
  is_system: boolean;
  sort_order: number;
};

export type PartyDocumentStatus = {
  id: number;
  document_status_code: string;
  name_en: string;
  is_system: boolean;
  sort_order: number;
};

export type PaymentMethod = {
  id: number;
  method_code: string;
  name_en: string;
  is_system: boolean;
  sort_order: number;
};

// ─── Child Tables ─────────────────────────────────────────────────────────────

export type PartyTypeAssignment = {
  id: number;
  party_id: number;
  party_type_id: number;
  is_primary: boolean;
  is_active: boolean;
  assigned_date: string | null;
  assigned_by: number | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  type_code?: string;
  type_name?: string;
};

export type PartyLicense = {
  id: number;
  license_code: string;
  party_id: number;
  license_type_id: number;
  license_number: string;
  license_name: string | null;
  issuing_authority_party_id: number | null;
  issuing_country_id: number | null;
  issuing_emirate_id: number | null;
  issue_date: string | null;
  expiry_date: string | null;
  renewal_required: boolean;
  renewal_notice_days: number | null;
  license_status_id: number;
  license_activity_text: string | null;
  license_document_id: number | null;
  dms_license_document_id: number | null;
  is_primary: boolean;
  is_active: boolean;
  remarks: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  license_type_name?: string;
  license_status_name?: string;
};

export type PartyTaxRegistration = {
  id: number;
  tax_registration_code: string;
  party_id: number;
  tax_type_id: number;
  tax_registration_number: string;
  tax_country_id: number | null;
  tax_status_id: number;
  effective_from: string | null;
  effective_to: string | null;
  certificate_document_id: number | null;
  dms_certificate_document_id: number | null;
  reverse_charge_applicable: boolean;
  vat_exempt: boolean;
  is_primary: boolean;
  is_active: boolean;
  remarks: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  tax_type_name?: string;
  tax_status_name?: string;
};

export type PartyFinanceProfile = {
  id: number;
  party_id: number;
  default_currency_id: number | null;
  default_payment_term_id: number | null;
  default_payment_method_id: number | null;
  credit_limit: number | null;
  credit_currency_id: number | null;
  finance_hold: boolean;
  finance_hold_reason: string | null;
  finance_hold_by: number | null;
  finance_hold_at: string | null;
  finance_remarks: string | null;
  created_at: string;
  updated_at: string;
};

export type PartyContact = {
  id: number;
  contact_code: string;
  party_id: number;
  full_name: string;
  designation: string | null;
  department_id: number | null;
  contact_role_id: number | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  whatsapp: string | null;
  is_primary: boolean;
  is_accounts_contact: boolean;
  is_sales_contact: boolean;
  is_operations_contact: boolean;
  is_hse_contact: boolean;
  is_documents_contact: boolean;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  department_name?: string;
  contact_role_name?: string;
};

export type PartyAddress = {
  id: number;
  address_code: string;
  party_id: number;
  address_type_id: number;
  address_name: string | null;
  country_id: number;
  emirate_id: number | null;
  city_id: number | null;
  area_zone_id: number | null;
  street: string | null;
  building: string | null;
  floor: string | null;
  office_no: string | null;
  po_box: string | null;
  landmark: string | null;
  google_map_url: string | null;
  latitude: number | null;
  longitude: number | null;
  is_primary: boolean;
  is_billing_address: boolean;
  is_shipping_address: boolean;
  is_site_address: boolean;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  address_type_name?: string;
  country_name?: string;
  emirate_name?: string;
  city_name?: string;
};

export type PartyBankDetail = {
  id: number;
  bank_detail_code: string;
  party_id: number;
  bank_id: number | null;
  bank_name_text: string | null;
  account_holder_name: string;
  account_number: string | null;
  iban: string | null;
  swift_code: string | null;
  currency_id: number | null;
  branch_name: string | null;
  country_id: number | null;
  is_primary: boolean;
  is_verified: boolean;
  verified_by: number | null;
  verified_at: string | null;
  verification_document_id: number | null;
  is_active: boolean;
  remarks: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  bank_name?: string;
  currency_code?: string;
  country_name?: string;
};

export type PartyDocument = {
  id: number;
  document_code: string;
  party_id: number;
  document_type_id: number;
  document_title: string;
  document_number: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  issuing_authority_party_id: number | null;
  file_path: string | null;
  file_name: string | null;
  file_mime_type: string | null;
  file_size: number | null;
  expiry_required: boolean;
  renewal_notice_days: number | null;
  document_status_id: number;
  uploaded_by: number | null;
  uploaded_at: string | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  document_type_name?: string;
  document_status_name?: string;
};

// ─── Form Inputs ──────────────────────────────────────────────────────────────

export type CreatePartyInput = {
  display_name: string;
  legal_name_en: string;
  legal_name_ar?: string | null;
  trade_name_en?: string | null;
  trade_name_ar?: string | null;
  short_name?: string | null;
  party_nature_id: number;
  primary_party_type_id?: number | null;
  parent_party_id?: number | null;
  main_phone?: string | null;
  main_mobile?: string | null;
  whatsapp?: string | null;
  main_email?: string | null;
  alternate_email?: string | null;
  website?: string | null;
  country_id: number;
  emirate_id?: number | null;
  city_id?: number | null;
  area_zone_id?: number | null;
  po_box?: string | null;
  full_address_text?: string | null;
  google_map_url?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  party_status_id: number;
  is_active?: boolean;
  remarks?: string | null;
};

export type UpdatePartyInput = CreatePartyInput & { id: number };

// ─── Duplicate Detection ──────────────────────────────────────────────────────

export type DuplicateMatch = {
  party_id: number;
  party_code: string;
  display_name: string;
  match_type: string;
  match_score: number;
};
