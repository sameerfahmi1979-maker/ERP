import type { UserProfile } from "@/types/database";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AccountStatus = "active" | "inactive" | "suspended" | "none";

export type AuthContext = {
  profile: UserProfile | null;
  /** ERP USERS.4 — auth email from supabase.auth.getUser() (not stored in user_profiles) */
  email: string | null;
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
    return { profile: null, email: null, roleCodes: [], permissionCodes: [], accountStatus: "none", isAccountActive: false };
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!profile) {
    return { profile: null, email: user.email ?? null, roleCodes: [], permissionCodes: [], accountStatus: "none", isAccountActive: false };
  }

  const rawStatus = (profile.status ?? "active") as string;
  const accountStatus: AccountStatus =
    rawStatus === "active" || rawStatus === "inactive" || rawStatus === "suspended"
      ? rawStatus
      : "active";
  const isAccountActive = accountStatus === "active";

  // ── USERS.4: flat separate queries to avoid !inner join ambiguity ──────────
  // IMPORTANT: use the admin client (service role) for roles/permissions lookups.
  // RLS on these tables requires roles.view / permissions.view — a bootstrapping
  // deadlock when we're *trying* to determine what the user can see. The cookie
  // client is only used for getUser() (authentication); all authorisation lookups
  // must bypass RLS via the service-role client.
  const admin = createAdminClient();

  // Step 1 — get role_ids the user is actively assigned to
  const { data: userRoleRows, error: err1 } = await admin
    .from("user_roles")
    .select("role_id")
    .eq("user_profile_id", profile.id)
    .eq("is_active", true);

  if (err1) logger.error("getAuthContext: user_roles query failed", { error: err1 });

  const roleIds = (userRoleRows ?? []).map((r) => r.role_id as number).filter(Boolean);

  // Step 2 — get active role records (filter inactive roles at role level)
  const roleCodes: string[] = [];
  const activeRoleIds: number[] = [];

  if (roleIds.length > 0) {
    const { data: activeRoles, error: err2 } = await admin
      .from("roles")
      .select("id, role_code")
      .in("id", roleIds)
      .eq("is_active", true);

    if (err2) logger.error("getAuthContext: roles query failed", { error: err2 });

    for (const r of activeRoles ?? []) {
      if (r.role_code) roleCodes.push(r.role_code as string);
      if (r.id) activeRoleIds.push(r.id as number);
    }
  }

  // Step 3 — get permission_ids linked to the active roles
  const permissionSet = new Set<string>();

  if (activeRoleIds.length > 0) {
    const { data: rolePermRows, error: err3 } = await admin
      .from("role_permissions")
      .select("permission_id")
      .in("role_id", activeRoleIds);

    if (err3) logger.error("getAuthContext: role_permissions query failed", { error: err3 });

    const permissionIds = (rolePermRows ?? []).map((r) => r.permission_id as number).filter(Boolean);

    // Step 4 — get active permission codes
    if (permissionIds.length > 0) {
      const { data: activePerms, error: err4 } = await admin
        .from("permissions")
        .select("permission_code")
        .in("id", permissionIds)
        .eq("is_active", true);

      if (err4) logger.error("getAuthContext: permissions query failed", { error: err4 });

      for (const p of activePerms ?? []) {
        if (p.permission_code) permissionSet.add(p.permission_code as string);
      }
    }
  }

  if (roleCodes.includes("system_admin")) {
    permissionSet.add("erp.admin");
  }

  return {
    profile: profile as UserProfile,
    email: user.email ?? null,
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
