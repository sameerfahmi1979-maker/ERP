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
};

export type Role = {
  id: number;
  role_code: string;
  role_name: string;
  description: string | null;
  is_system_role: boolean;
  is_active: boolean;
};

export type Permission = {
  id: number;
  permission_code: string;
  permission_name: string;
  module_code: string;
  action_code: string;
  description: string | null;
  is_active: boolean;
};

export type OwnerCompany = {
  id: number;
  legal_name_en: string;
  company_code: string;
  status: string;
};

export type Branch = {
  id: number;
  owner_company_id: number;
  branch_code: string;
  branch_name_en: string;
  status: string;
};

export type UserWithRoles = UserProfile & {
  email?: string | null;
  roles?: { role_code: string; role_name: string }[];
  owner_company?: OwnerCompany | null;
  branch?: Branch | null;
};
