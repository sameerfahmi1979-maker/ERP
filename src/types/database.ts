export type UserProfile = {
  id: number;
  auth_user_id: string;
  user_code: string | null;
  full_name: string | null;
  display_name: string | null;
  phone: string | null;
  job_title: string | null;
  department: string | null;
  owner_company_id: number | null;
  branch_id: number | null;
  status: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
  // Phase 002D additions
  employee_reference: string | null;
  manager_user_profile_id: number | null;
  preferred_language: string;
  timezone: string;
  last_admin_updated_at: string | null;
  notes: string | null;
  // USERS.2A — Password lifecycle
  must_change_password: boolean;
  must_change_password_reason: string | null;
  password_changed_at: string | null;
  password_reset_sent_at: string | null;
  password_set_by_admin_at: string | null;
  email_confirmed_by_admin_at: string | null;
  email_confirmed_by_admin_id: number | null;
  last_password_security_action_at: string | null;
  last_password_security_action: string | null;
  last_password_security_action_by: number | null;
};

export type Role = {
  id: number;
  role_code: string;
  role_name: string;
  description: string | null;
  is_system_role: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Phase 002D additions
  display_name: string | null;
  role_category: string | null;
  role_level: string | null;
  is_assignable: boolean;
  notes: string | null;
};

export type Permission = {
  id: number;
  permission_code: string;
  permission_name: string;
  module_code: string;
  action_code: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Phase 002D additions
  display_name: string | null;
  is_system_permission: boolean;
  is_visible: boolean;
  sort_order: number;
};

export type OwnerCompany = {
  id: number;
  legal_name_en: string;
  legal_name_ar: string | null;
  short_name: string | null;
  company_code: string;
  legal_form: string | null;
  country: string | null;
  emirate: string | null;
  trade_license_no: string | null;
  trn: string | null;
  corporate_tax_no: string | null;
  default_currency: string;
  status: string;
  primary_email: string | null;
  primary_phone: string | null;
  website: string | null;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
  // Phase 002D additions - UAE compliance fields
  city: string | null;
  area: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  po_box: string | null;
  makani_number: string | null;
  trade_license_issue_date: string | null;
  trade_license_expiry_date: string | null;
  licensing_authority: string | null;
  chamber_membership_no: string | null;
  chamber_membership_expiry_date: string | null;
  vat_registered: boolean;
  corporate_tax_registered: boolean;
  icv_certificate_no: string | null;
  icv_score: number | null;
  icv_issue_date: string | null;
  icv_expiry_date: string | null;
  adnoc_supplier_no: string | null;
  notes: string | null;
  // Phase 002F.3C.1B.1 - Geography FK fields
  country_id: number | null;
  emirate_id: number | null;
  city_id: number | null;
  area_zone_id: number | null;
  // Phase 002F.3C.4B - Optional joined geography relationships (when using expanded query)
  country_rel?: { id: number; name_en: string; name_ar: string | null; country_code: string } | null;
  emirate_rel?: { id: number; name_en: string; name_ar: string | null } | null;
  city_rel?: { id: number; name_en: string; name_ar: string | null } | null;
  area_zone_rel?: { id: number; name_en: string; name_ar: string | null } | null;
};

export type Branch = {
  id: number;
  owner_company_id: number;
  branch_code: string;
  branch_name_en: string;
  branch_name_ar: string | null;
  emirate: string | null;
  area: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  po_box: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
  // Phase 002D additions - operational & location fields
  branch_type: string | null;
  is_main_branch: boolean;
  operating_status: string;
  city: string | null;
  makani_number: string | null;
  latitude: number | null;
  longitude: number | null;
  contact_person_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  has_workshop: boolean;
  has_warehouse: boolean;
  has_yard: boolean;
  has_weighbridge: boolean;
  notes: string | null;
};

export type UserRoleAssignment = {
  user_role_id: number;
  role_id: number;
  role_code: string;
  role_name: string;
  scope: "global" | "company" | "branch";
  owner_company_id: number | null;
  branch_id: number | null;
  assigned_at: string;
  scope_company_name?: string | null;
  scope_branch_name?: string | null;
};

export type UserAuthMetadata = {
  email: string | null;
  last_sign_in_at: string | null;
  auth_created_at: string | null;
  // USERS.2A
  email_confirmed_at: string | null;
};

export type UserWithRoles = UserProfile & {
  email?: string | null;
  roles?: UserRoleAssignment[];
  owner_company?: OwnerCompany | null;
  branch?: Branch | null;
  auth_metadata?: UserAuthMetadata | null;
};

export type BranchWithCompany = Branch & {
  owner_company?: Pick<OwnerCompany, "id" | "legal_name_en" | "company_code" | "status"> | null;
};

export type AuditLog = {
  id: number;
  actor_user_profile_id: number | null;
  owner_company_id: number | null;
  branch_id: number | null;
  module_code: string | null;
  entity_name: string | null;
  entity_id: number | null;
  entity_reference: string | null;
  action: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};
