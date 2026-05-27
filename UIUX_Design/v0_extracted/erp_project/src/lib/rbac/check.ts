import type { UserProfile } from "@/types/database";
import { createClient } from "@/lib/supabase/server";

export type AuthContext = {
  profile: UserProfile | null;
  roleCodes: string[];
  permissionCodes: string[];
};

export async function getAuthContext(): Promise<AuthContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { profile: null, roleCodes: [], permissionCodes: [] };
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!profile) {
    return { profile: null, roleCodes: [], permissionCodes: [] };
  }

  const { data: userRoles } = await supabase
    .from("user_roles")
    .select("role_id, roles(role_code)")
    .eq("user_profile_id", profile.id)
    .eq("is_active", true);

  const roleCodes: string[] = [];
  const roleIds: number[] = [];

  for (const row of userRoles ?? []) {
    const role = row.roles as { role_code?: string } | null;
    if (role?.role_code) roleCodes.push(role.role_code);
    if (row.role_id) roleIds.push(row.role_id);
  }

  const permissionSet = new Set<string>();

  if (roleIds.length > 0) {
    const { data: rolePerms } = await supabase
      .from("role_permissions")
      .select("permissions(permission_code)")
      .in("role_id", roleIds);

    for (const row of rolePerms ?? []) {
      const perm = row.permissions as { permission_code?: string } | null;
      if (perm?.permission_code) permissionSet.add(perm.permission_code);
    }
  }

  if (roleCodes.includes("system_admin")) {
    permissionSet.add("erp.admin");
  }

  return {
    profile: profile as UserProfile,
    roleCodes,
    permissionCodes: Array.from(permissionSet),
  };
}

export function hasRole(ctx: AuthContext, roleCode: string): boolean {
  return ctx.roleCodes.includes(roleCode);
}

export function hasPermission(ctx: AuthContext, permissionCode: string): boolean {
  return (
    ctx.permissionCodes.includes(permissionCode) ||
    ctx.roleCodes.includes("system_admin") ||
    ctx.roleCodes.includes("group_admin")
  );
}

export function isGlobalAdmin(ctx: AuthContext): boolean {
  return (
    ctx.roleCodes.includes("system_admin") || ctx.roleCodes.includes("group_admin")
  );
}

export async function requirePermission(permissionCode: string): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx.profile || !hasPermission(ctx, permissionCode)) {
    throw new Error("Forbidden");
  }
  return ctx;
}

export async function requireAdmin(): Promise<AuthContext> {
  return requirePermission("erp.admin");
}
