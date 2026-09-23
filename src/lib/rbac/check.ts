import "server-only";

import type { UserProfile } from "@/types/domain";
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
  /** Explicit scope is retained; legacy permissionCodes is a capability list, not a row-access grant. */
  roleAssignments?: Array<{ roleId: number; roleCode: string; ownerCompanyId: number | null; branchId: number | null; permissionCodes: string[] }>;
  globalPermissionCodes?: string[];
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

  return buildAuthContext(profile as UserProfile, user.email ?? null);
}

/** Internal worker entry point. Never expose this through a Server Action. */
export async function getAuthContextForProfileId(profileId: number): Promise<AuthContext> {
  if (!Number.isSafeInteger(profileId) || profileId <= 0) throw new Error("Invalid principal");
  const { data: profile, error } = await createAdminClient().from("user_profiles")
    .select("*").eq("id", profileId).maybeSingle();
  if (error || !profile) throw new Error("Principal not found");
  const ctx = await buildAuthContext(profile as UserProfile, null);
  assertAccountActive(ctx);
  return ctx;
}

async function buildAuthContext(profile: UserProfile, email: string | null): Promise<AuthContext> {
  const rawStatus = profile.status as string;
  const accountStatus: AccountStatus =
    rawStatus === "active" || rawStatus === "inactive" || rawStatus === "suspended"
      ? rawStatus
      : "none";
  const isAccountActive = accountStatus === "active";
  if (!isAccountActive) return { profile, email, roleCodes: [], permissionCodes: [], roleAssignments: [], globalPermissionCodes: [], accountStatus, isAccountActive: false };

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
    .select("role_id, owner_company_id, branch_id")
    .eq("user_profile_id", profile.id)
    .eq("is_active", true);

  if (err1) throw new Error("Unable to resolve role assignments");

  const roleIds = (userRoleRows ?? []).map((r) => r.role_id as number).filter(Boolean);

  // Step 2 — get active role records (filter inactive roles at role level)
  const roleCodes: string[] = [];
  const activeRoleIds: number[] = [];
  const roleNames = new Map<number, string>();

  if (roleIds.length > 0) {
    const { data: activeRoles, error: err2 } = await admin
      .from("roles")
      .select("id, role_code")
      .in("id", roleIds)
      .eq("is_active", true);

    if (err2) throw new Error("Unable to resolve active roles");

    for (const r of activeRoles ?? []) {
      if (r.role_code) {
        roleNames.set(r.id as number, r.role_code as string);
        // Existing callers inspect roleCodes directly. Privileged codes must NEVER
        // acquire global meaning from a company/branch assignment.
        const isGlobal = (userRoleRows ?? []).some(a => a.role_id === r.id && a.owner_company_id === null && a.branch_id === null);
        if (isGlobal || !["system_admin", "group_admin"].includes(r.role_code as string)) roleCodes.push(r.role_code as string);
      }
      if (r.id) activeRoleIds.push(r.id as number);
    }
  }

  // Step 3 — get permission_ids linked to the active roles
  const permissionSet = new Set<string>();
  const globalPermissionSet = new Set<string>();
  const rolePermissions = new Map<number, string[]>();

  if (activeRoleIds.length > 0) {
    const { data: rolePermRows, error: err3 } = await admin
      .from("role_permissions")
      .select("role_id, permission_id")
      .in("role_id", activeRoleIds);

    if (err3) throw new Error("Unable to resolve role permissions");

    const permissionIds = (rolePermRows ?? []).map((r) => r.permission_id as number).filter(Boolean);

    // Step 4 — get active permission codes
    if (permissionIds.length > 0) {
      const { data: activePerms, error: err4 } = await admin
        .from("permissions")
        .select("id, permission_code")
        .in("id", permissionIds)
        .eq("is_active", true);

      if (err4) throw new Error("Unable to resolve permissions");

      for (const p of activePerms ?? []) {
        if (!p.permission_code) continue;
        for (const link of rolePermRows ?? []) {
          if (link.permission_id !== p.id) continue;
          const codes = rolePermissions.get(link.role_id as number) ?? [];
          codes.push(p.permission_code as string);
          rolePermissions.set(link.role_id as number, codes);
          const assignments = (userRoleRows ?? []).filter(a => a.role_id === link.role_id);
          const global = assignments.some(a => a.owner_company_id === null && a.branch_id === null);
          if (global) globalPermissionSet.add(p.permission_code as string);
          // These are platform-wide capabilities, not company capabilities.
          if (global || (p.permission_code !== "erp.admin" && !p.permission_code.startsWith("settings.") && !p.permission_code.startsWith("numbering.rules.") && !["roles.manage", "permissions.manage"].includes(p.permission_code))) permissionSet.add(p.permission_code as string);
        }
      }
    }
  }

  if (roleCodes.includes("system_admin")) {
    permissionSet.add("erp.admin");
  }

  return {
    profile: profile as UserProfile,
    email,
    roleCodes,
    permissionCodes: Array.from(permissionSet),
    accountStatus,
    isAccountActive,
    globalPermissionCodes: Array.from(globalPermissionSet),
    roleAssignments: (userRoleRows ?? []).filter(a => activeRoleIds.includes(a.role_id as number)).map(a => ({ roleId: a.role_id as number, roleCode: roleNames.get(a.role_id as number)!, ownerCompanyId: a.owner_company_id as number | null, branchId: a.branch_id as number | null, permissionCodes: rolePermissions.get(a.role_id as number) ?? [] })),
  };
}

// ── Boolean helpers ───────────────────────────────────────────────────────────

export function hasRole(ctx: AuthContext, roleCode: string): boolean {
  if (["system_admin", "group_admin"].includes(roleCode)) return isGlobalAdmin(ctx) && ctx.roleCodes.includes(roleCode);
  return ctx.isAccountActive && !!ctx.profile && ctx.roleCodes.includes(roleCode);
}

export function hasPermission(ctx: AuthContext, permissionCode: string): boolean {
  return ctx.isAccountActive && !!ctx.profile && (
    ctx.permissionCodes.includes(permissionCode) ||
    isGlobalAdmin(ctx)
  );
}

export function isGlobalAdmin(ctx: AuthContext): boolean {
  return ctx.isAccountActive && !!ctx.profile && !!ctx.roleAssignments?.some(a => a.ownerCompanyId === null && a.branchId === null && ["system_admin", "group_admin"].includes(a.roleCode));
}

/** Global configuration must not use the flattened capability list. */
export function hasGlobalPermission(ctx: AuthContext, code: string): boolean {
  return ctx.isAccountActive && !!ctx.profile && (isGlobalAdmin(ctx) || !!ctx.globalPermissionCodes?.includes(code));
}

/** Row-scoped authority; a branch grant cannot authorize a company-wide action. */
export function hasPermissionInScope(ctx: AuthContext, code: string, companyId: number, branchId: number | null = null): boolean {
  if (!ctx.isAccountActive || !ctx.profile || !Number.isSafeInteger(companyId) || companyId <= 0) return false;
  return isGlobalAdmin(ctx) || !!ctx.roleAssignments?.some(a => a.permissionCodes.includes(code) &&
    ((a.ownerCompanyId === null && a.branchId === null) ||
      (a.ownerCompanyId === companyId && (a.branchId === null || (branchId !== null && a.branchId === branchId)))));
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
    if (ctx.accountStatus === "inactive" || ctx.accountStatus === "suspended") throw new AccountDisabledError(ctx.accountStatus);
    throw new Error("Account status could not be verified");
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
