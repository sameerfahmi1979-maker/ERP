import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import {
  batchSafeAuthMetadata,
  findAuthUserIdsByEmailSearch,
  getSafeAuthMetadataByAuthUserId,
} from "@/lib/users/auth-metadata";
import { resolveRoleScope } from "@/lib/users/role-scope";
import type {
  UserWithRoles,
  UserRoleAssignment,
  UserAuthMetadata,
  OwnerCompany,
  Branch,
} from "@/types/database";

const PROFILE_SELECT = `
  *,
  owner_companies:owner_company_id ( id, legal_name_en, company_code, status ),
  branches:branch_id ( id, branch_code, branch_name_en, status, owner_company_id )
`;

const USER_ROLES_SELECT = `
  id,
  user_profile_id,
  role_id,
  owner_company_id,
  branch_id,
  is_active,
  assigned_at,
  roles ( role_code, role_name ),
  owner_companies:owner_company_id ( legal_name_en ),
  branches:branch_id ( branch_name_en )
`;

function mapUserRoleRow(ur: Record<string, unknown>): UserRoleAssignment | null {
  const roleData = ur.roles as { role_code?: string; role_name?: string } | null;
  if (!roleData?.role_code || !roleData?.role_name) return null;

  const scopeCompany = ur.owner_companies as { legal_name_en?: string } | null;
  const scopeBranch = ur.branches as { branch_name_en?: string } | null;
  const ownerCompanyId = (ur.owner_company_id as number | null) ?? null;
  const branchId = (ur.branch_id as number | null) ?? null;

  return {
    user_role_id: ur.id as number,
    role_id: ur.role_id as number,
    role_code: String(roleData.role_code),
    role_name: String(roleData.role_name),
    scope: resolveRoleScope(ownerCompanyId, branchId),
    owner_company_id: ownerCompanyId,
    branch_id: branchId,
    assigned_at: String(ur.assigned_at),
    scope_company_name: scopeCompany?.legal_name_en ?? null,
    scope_branch_name: scopeBranch?.branch_name_en ?? null,
  };
}

function mergeProfileRow(
  profile: Record<string, unknown>,
  roles: UserRoleAssignment[],
  email?: string | null,
  authMetadata?: UserAuthMetadata | null,
): UserWithRoles {
  const { owner_companies, branches, ...rest } = profile;
  return {
    ...(rest as UserWithRoles),
    roles,
    owner_company: (owner_companies as OwnerCompany | null) ?? null,
    branch: (branches as Branch | null) ?? null,
    email: email ?? null,
    auth_metadata: authMetadata ?? null,
  };
}

async function fetchRolesForProfiles(profileIds: number[]): Promise<Map<number, UserRoleAssignment[]>> {
  const rolesByProfile = new Map<number, UserRoleAssignment[]>();
  if (profileIds.length === 0) return rolesByProfile;

  const supabase = await createClient();
  const { data: userRoles, error } = await supabase
    .from("user_roles")
    .select(USER_ROLES_SELECT)
    .in("user_profile_id", profileIds)
    .eq("is_active", true);

  if (error) {
    logger.error("fetchRolesForProfiles error", error.message);
    return rolesByProfile;
  }

  for (const ur of userRoles ?? []) {
    const mapped = mapUserRoleRow(ur as Record<string, unknown>);
    if (!mapped) continue;
    const profileId = ur.user_profile_id as number;
    if (!rolesByProfile.has(profileId)) rolesByProfile.set(profileId, []);
    rolesByProfile.get(profileId)!.push(mapped);
  }

  return rolesByProfile;
}

export type ListUsersParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  ownerCompanyId?: number;
  branchId?: number;
  roleId?: number;
  mustChangePassword?: boolean;
};

export type PaginatedUsersResult = {
  rows: UserWithRoles[];
  totalCount: number;
  page: number;
  pageSize: number;
};

export async function getUserById(id: number): Promise<UserWithRoles | null> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "users.view")) return null;

  const supabase = await createClient();

  const { data: profile, error } = await supabase
    .from("user_profiles")
    .select(PROFILE_SELECT)
    .eq("id", id)
    .single();

  if (error || !profile) return null;

  const rolesMap = await fetchRolesForProfiles([id]);
  const roles = rolesMap.get(id) ?? [];

  const authMeta = await getSafeAuthMetadataByAuthUserId(profile.auth_user_id as string);

  return mergeProfileRow(
    profile as Record<string, unknown>,
    roles,
    authMeta?.email ?? null,
    authMeta,
  );
}

/**
 * USERS.2 — Server-side paginated users list with search and filters.
 */
export async function listUsersPaginated(
  params: ListUsersParams = {},
): Promise<PaginatedUsersResult> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "users.view")) {
    logger.warn("listUsersPaginated: access denied — missing users.view");
    return { rows: [], totalCount: 0, page: 1, pageSize: 25 };
  }

  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 25));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const search = params.search?.trim() ?? "";

  const supabase = await createClient();

  // Role filter — resolve matching profile IDs first
  let roleFilterProfileIds: number[] | null = null;
  if (params.roleId) {
    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("user_profile_id")
      .eq("role_id", params.roleId)
      .eq("is_active", true);
    roleFilterProfileIds = [...new Set((roleRows ?? []).map((r) => r.user_profile_id as number))];
    if (roleFilterProfileIds.length === 0) {
      return { rows: [], totalCount: 0, page, pageSize };
    }
  }

  // Email search — resolve auth IDs then profile IDs
  let emailSearchProfileIds: number[] | null = null;
  if (search.includes("@")) {
    const authIds = await findAuthUserIdsByEmailSearch(search);
    if (authIds.length === 0) {
      return { rows: [], totalCount: 0, page, pageSize };
    }
    const { data: emailProfiles } = await supabase
      .from("user_profiles")
      .select("id")
      .in("auth_user_id", authIds);
    emailSearchProfileIds = (emailProfiles ?? []).map((p) => p.id as number);
    if (emailSearchProfileIds.length === 0) {
      return { rows: [], totalCount: 0, page, pageSize };
    }
  }

  let query = supabase
    .from("user_profiles")
    .select(PROFILE_SELECT, { count: "exact" });

  if (params.status) query = query.eq("status", params.status);
  if (params.ownerCompanyId) query = query.eq("owner_company_id", params.ownerCompanyId);
  if (params.branchId) query = query.eq("branch_id", params.branchId);
  if (params.mustChangePassword) query = query.eq("must_change_password", true);
  if (roleFilterProfileIds) query = query.in("id", roleFilterProfileIds);
  if (emailSearchProfileIds) query = query.in("id", emailSearchProfileIds);

  if (search && !search.includes("@")) {
    const term = `%${search}%`;
    query = query.or(
      `full_name.ilike.${term},display_name.ilike.${term},user_code.ilike.${term}`,
    );
  }

  const { data: profiles, error, count } = await query
    .order("id", { ascending: true })
    .range(from, to);

  if (error) {
    logger.error("listUsersPaginated error", error.message);
    return { rows: [], totalCount: 0, page, pageSize };
  }

  const profileList = profiles ?? [];
  const profileIds = profileList.map((p) => p.id as number);
  const rolesMap = await fetchRolesForProfiles(profileIds);

  const authMetaMap = await batchSafeAuthMetadata(
    profileList.map((p) => p.auth_user_id as string),
  );

  const rows = profileList.map((profile) => {
    const authUserId = profile.auth_user_id as string;
    const meta = authMetaMap.get(authUserId) ?? null;
    return mergeProfileRow(
      profile as Record<string, unknown>,
      rolesMap.get(profile.id as number) ?? [],
      meta?.email ?? null,
      meta,
    );
  });

  return {
    rows,
    totalCount: count ?? 0,
    page,
    pageSize,
  };
}

/**
 * @deprecated Use listUsersPaginated for the admin users page.
 * Retained for backward compatibility — loads all profiles (not scalable).
 */
export async function listUsers(): Promise<UserWithRoles[]> {
  const result = await listUsersPaginated({ page: 1, pageSize: 1000 });
  return result.rows;
}
