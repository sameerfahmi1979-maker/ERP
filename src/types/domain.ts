/** Application projections, separate from the replaceable generated database schema. */
import type { Tables } from "./database";
import type { RoleScopeKind } from "@/lib/users/role-scope";

export type UserProfile = Tables<"user_profiles">;
export type OwnerCompany = Tables<"owner_companies">;
export type OwnerCompanyWithGeography = OwnerCompany & {
  country_rel: Pick<Tables<"countries">, "id" | "name_en" | "name_ar" | "country_code"> | null;
  emirate_rel: Pick<Tables<"emirates">, "id" | "name_en" | "name_ar"> | null;
  city_rel: Pick<Tables<"cities">, "id" | "name_en" | "name_ar"> | null;
  area_zone_rel: Pick<Tables<"areas_zones">, "id" | "name_en" | "name_ar"> | null;
};
export type Branch = Tables<"branches">;
export type Role = Tables<"roles">;
export type Permission = Tables<"permissions">;
export type AuditLog = Tables<"audit_logs">;
export type CompanySummary = Pick<OwnerCompany, "id" | "legal_name_en" | "company_code" | "status">;
export type BranchSummary = Pick<Branch, "id" | "branch_code" | "branch_name_en" | "status" | "owner_company_id">;
export type BranchWithCompany = Branch & { owner_company: CompanySummary | null };

/** These are the safe fields returned by the server Auth metadata adapter. */
export type UserAuthMetadata = {
  email: string | null;
  last_sign_in_at: string | null;
  auth_created_at: string | null;
  email_confirmed_at: string | null;
};
export type UserRoleAssignment = {
  user_role_id: number;
  role_id: number;
  role_code: string;
  role_name: string;
  scope: RoleScopeKind;
  owner_company_id: number | null;
  branch_id: number | null;
  assigned_at: string;
  scope_company_name: string | null;
  scope_branch_name: string | null;
};
export type UserWithRoles = UserProfile & {
  roles: UserRoleAssignment[];
  owner_company: CompanySummary | null;
  branch: BranchSummary | null;
  email: string | null;
  auth_metadata: UserAuthMetadata | null;
};
