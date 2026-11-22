import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { literalContains } from "@/lib/reads/search";
import { readAllPages } from "@/server/reads/all-pages";
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
  CompanySummary,
  BranchSummary,
} from "@/types/domain";

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
    owner_company: (owner_companies as CompanySummary | null) ?? null,
    branch: (branches as BranchSummary | null) ?? null,
    email: email ?? null,
    auth_metadata: authMetadata ?? null,
  };
}

async function fetchRolesForProfiles(profileIds: number[]): Promise<Map<number, UserRoleAssignment[]>> {
  const rolesByProfile = new Map<number, UserRoleAssignment[]>();
  if (profileIds.length === 0) return rolesByProfile;

  const supabase = await createClient();
  const userRoles = await readAllPages(
    async (from, to) => supabase.from("user_roles").select(USER_ROLES_SELECT, { count: "exact" })
      .in("user_profile_id", profileIds).eq("is_active", true).order("id").range(from, to),
    { identity: row => row.id },
  );

  for (const ur of userRoles) {
    const mapped = mapUserRoleRow(ur as Record<string, unknown>);
    if (!mapped) throw Error("User role assignments could not be verified.");
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
    .maybeSingle();

  if (error) {
    logger.error("getUserById error", error.message);
    throw Error("User profile could not be loaded.");
  }
  if (!profile) return null;

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
  if (!Number.isSafeInteger(page) || !Number.isSafeInteger(pageSize) || !Number.isSafeInteger(to)) {
    throw Error("The Users page number or size is invalid.");
  }
  const search = params.search?.trim() ?? "";

  const supabase = await createClient();

  // Role filter — resolve matching profile IDs first
  let roleFilterProfileIds: number[] | null = null;
  if (params.roleId) {
    const roleId = params.roleId;
    const roleRows = await readAllPages(
      async (start, end) => supabase.from("user_roles").select("id, user_profile_id", { count: "exact" })
        .eq("role_id", roleId).eq("is_active", true).order("id").range(start, end),
      { identity: row => row.id },
    );
    roleFilterProfileIds = [...new Set(roleRows.map(row => row.user_profile_id))];
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
    const emailProfiles = await readAllPages(
      async (start, end) => supabase.from("user_profiles").select("id", { count: "exact" })
        .in("auth_user_id", authIds).order("id").range(start, end),
      { identity: row => row.id },
    );
    emailSearchProfileIds = emailProfiles.map(profile => profile.id);
    if (emailSearchProfileIds.length === 0) {
      return { rows: [], totalCount: 0, page, pageSize };
    }
  }

  const buildQuery = (head = false) => {
    let query = supabase.from("user_profiles").select(PROFILE_SELECT, { count: "exact", head });
    if (params.status) query = query.eq("status", params.status);
    if (params.ownerCompanyId) query = query.eq("owner_company_id", params.ownerCompanyId);
    if (params.branchId) query = query.eq("branch_id", params.branchId);
    if (params.mustChangePassword) query = query.eq("must_change_password", true);
    if (roleFilterProfileIds) query = query.in("id", roleFilterProfileIds);
    if (emailSearchProfileIds) query = query.in("id", emailSearchProfileIds);
    if (search && !search.includes("@")) {
      const term = literalContains(search);
      query = query.or(
        `full_name.ilike.${term},display_name.ilike.${term},user_code.ilike.${term}`,
      );
    }
    return query;
  };

  const result = await buildQuery().order("id").range(from, to);
  const fallback = from > 0 && result.status === 416 ? await buildQuery(true) : null;
  const count = fallback ? fallback.count : result.count;
  const error = fallback ? fallback.error : result.error;
  const profiles = fallback ? [] : result.data;

  if (error) {
    logger.error("listUsersPaginated error", error.message);
    throw Error("Users could not be loaded.");
  }
  if (count === null || !Number.isSafeInteger(count) || count < 0 ||
      !Array.isArray(profiles) || profiles.length !== Math.min(pageSize, Math.max(0, count - from)) ||
      new Set(profiles.map(profile => profile.id)).size !== profiles.length) {
    throw Error("Users could not be loaded completely.");
  }

  const profileList = profiles;
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
    totalCount: count,
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
