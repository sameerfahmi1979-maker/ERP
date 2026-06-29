import type { UserProfile } from "@/types/database";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AccountStatus = "active" | "inactive" | "suspended" | "none";

export type AuthContext = {
  profile: UserProfile | null;
  roleCodes: string[];
  permissionCodes: string[];
  /** ERP USERS.1 — live account status from user_profiles.status */
  accountStatus: AccountStatus;
  /** True only when accountStatus === "active" */
  isAccountActive: boolean;
};

// ── Account-disabled error ────────────────────────────────────────────────────

export class AccountDisabledError extends Error {
  readonly code = "ACCOUNT_DISABLED" as const;
  readonly accountStatus: "inactive" | "suspended";

  constructor(status: "inactive" | "suspended") {
    super("Your account is not active. Please contact your administrator.");
    this.name = "AccountDisabledError";
    this.accountStatus = status;
  }
}

// ── getAuthContext ────────────────────────────────────────────────────────────

export async function getAuthContext(): Promise<AuthContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { profile: null, roleCodes: [], permissionCodes: [], accountStatus: "none", isAccountActive: false };
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!profile) {
    return { profile: null, roleCodes: [], permissionCodes: [], accountStatus: "none", isAccountActive: false };
  }

  const rawStatus = (profile.status ?? "active") as string;
  const accountStatus: AccountStatus =
    rawStatus === "active" || rawStatus === "inactive" || rawStatus === "suspended"
      ? rawStatus
      : "active";
  const isAccountActive = accountStatus === "active";

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
    accountStatus,
    isAccountActive,
  };
}

// ── Boolean helpers ───────────────────────────────────────────────────────────

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

/**
 * ERP USERS.1 — Composite helper for user management operations.
 *
 * The DB has granular permissions (users.create / users.update / users.delete)
 * but NOT a "users.manage" permission. This helper returns true when the caller
 * holds at least one of those granular permissions (or is a global admin via
 * hasPermission bypass). Use this instead of hasPermission(ctx, "users.manage").
 */
export function canManageUsers(ctx: AuthContext): boolean {
  return (
    hasPermission(ctx, "users.create") ||
    hasPermission(ctx, "users.update") ||
    hasPermission(ctx, "users.delete")
  );
}

// ── Active-account guard ──────────────────────────────────────────────────────

/**
 * ERP USERS.1 — Throws AccountDisabledError if the user account is not active.
 * Call from server actions that mutate data to block inactive/suspended users.
 */
export function assertAccountActive(ctx: AuthContext): void {
  if (!ctx.profile) {
    throw new Error("Unauthorized");
  }
  if (!ctx.isAccountActive) {
    logger.warn("assertAccountActive: blocked inactive/suspended user", {
      profileId: ctx.profile.id,
      status: ctx.accountStatus,
    });
    throw new AccountDisabledError(ctx.accountStatus as "inactive" | "suspended");
  }
}

/**
 * ERP USERS.1 — Loads auth context and asserts the account is active.
 * Use in server actions that must block inactive/suspended users.
 */
export async function requireActiveAuthContext(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  assertAccountActive(ctx);
  return ctx;
}

// ── Permission guards ─────────────────────────────────────────────────────────

/**
 * Requires a valid active session + the specified permission.
 * Throws if account is inactive/suspended (USERS.1) or permission missing.
 */
export async function requirePermission(permissionCode: string): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx.profile) {
    throw new Error("Unauthorized");
  }
  assertAccountActive(ctx);
  if (!hasPermission(ctx, permissionCode)) {
    throw new Error("Forbidden");
  }
  return ctx;
}

export async function requireAdmin(): Promise<AuthContext> {
  return requirePermission("erp.admin");
}
