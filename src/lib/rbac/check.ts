import "server-only";
import { z } from "zod";
import { traceRequest } from "@/lib/performance/request";
import { traceSpan } from "@/lib/performance/trace";

import type { UserProfile } from "@/types/domain";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { hasPermission } from "./scope";
import { assignmentScopeError } from "./administrator-policy";
export { canUseApplication, hasRole, hasPermission, isGlobalAdmin, hasGlobalPermission, hasPermissionInScope } from "./scope";

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
  return traceRequest("auth.context", getAuthContextImpl);
}

async function getAuthContextImpl(): Promise<AuthContext> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await traceSpan("auth.session", () => supabase.auth.getUser());

  if (authError || !user) {
    return { profile: null, email: null, roleCodes: [], permissionCodes: [], accountStatus: "none", isAccountActive: false };
  }

  // An unexpired JWT alone is not proof that the underlying session remains live.
  const { data: sessionValid, error: sessionError } = await supabase.rpc("f03_current_session_valid");
  if (sessionError || sessionValid !== true) {
    return { profile: null, email: null, roleCodes: [], permissionCodes: [], accountStatus: "none", isAccountActive: false };
  }
  return traceSpan("auth.permissions", async () => {
    // Only the identity verified by GoTrue can select this bootstrap graph.
    const { data, error } = await createAdminClient().rpc("erp_current_auth_graph", { p_auth_user_id: user.id });
    if (error) throw new Error("Unable to resolve authorization context");
    if (data === null) {
      return { profile: null, email: user.email ?? null, roleCodes: [], permissionCodes: [], accountStatus: "none", isAccountActive: false };
    }
    const graph = authGraphEnvelope.safeParse(data);
    if (!graph.success || graph.data.profile.auth_user_id !== user.id) {
      throw new Error("Unable to resolve authorization context");
    }
    return buildAuthContext(graph.data.profile as UserProfile, user.email ?? null, graph.data);
  });
}

// The graph is a single JSON value so PostgREST row limits cannot truncate
// individual role, link or permission sets. Validate fields used for authority
// and retain the full profile shape for the application and forced-change page.
const authGraph = z.strictObject({
  assignments: z.array(z.strictObject({ role_id: z.int(), owner_company_id: z.int().nullable(), branch_id: z.int().nullable() })),
  roles: z.array(z.strictObject({ id: z.int(), role_code: z.string() })),
  links: z.array(z.strictObject({ role_id: z.int(), permission_id: z.int() })),
  permissions: z.array(z.strictObject({ id: z.int(), permission_code: z.string() })),
});
const authGraphEnvelope = authGraph.extend({
  profile: z.looseObject({
    id: z.int().positive(),
    auth_user_id: z.string(),
    status: z.string(),
    must_change_password: z.boolean(),
    owner_company_id: z.int().nullable(),
    branch_id: z.int().nullable(),
  }),
});
type AuthGraph = z.infer<typeof authGraph>;

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

async function buildAuthContext(profile: UserProfile, email: string | null, graph?: AuthGraph): Promise<AuthContext> {
  const rawStatus = profile.status as string;
  const accountStatus: AccountStatus =
    rawStatus === "active" || rawStatus === "inactive" || rawStatus === "suspended"
      ? rawStatus
      : "none";
  const isAccountActive = accountStatus === "active";
  if (!isAccountActive || profile.must_change_password === true) return { profile, email, roleCodes: [], permissionCodes: [], roleAssignments: [], globalPermissionCodes: [], accountStatus, isAccountActive };

  const { assignments, roles, links, permissions } = graph ?? await readWorkerAuthGraph(profile.id);
  const roleNames = new Map(roles.map(role => [role.id, role.role_code]));
  const validAssignments = assignments.filter(assignment =>
    !assignmentScopeError(roleNames.get(assignment.role_id) ?? "", assignment.owner_company_id, assignment.branch_id));
  const assignedRoles = new Set(validAssignments.map(assignment => assignment.role_id));
  const globalRoles = new Set(validAssignments
    .filter(assignment => assignment.owner_company_id === null && assignment.branch_id === null)
    .map(assignment => assignment.role_id));
  const roleCodes = roles.filter(role => role.role_code && assignedRoles.has(role.id)).map(role => role.role_code);
  const permissionSet = new Set<string>();
  const globalPermissionSet = new Set<string>();
  const rolePermissions = new Map<number, string[]>();
  const rolesByPermission = new Map<number, number[]>();
  for (const link of links) {
    const linkedRoles = rolesByPermission.get(link.permission_id) ?? [];
    linkedRoles.push(link.role_id);
    rolesByPermission.set(link.permission_id, linkedRoles);
  }

  for (const { id, permission_code: code } of permissions) {
    if (!code) continue;
    for (const roleId of rolesByPermission.get(id) ?? []) {
      const codes = rolePermissions.get(roleId) ?? [];
      codes.push(code);
      rolePermissions.set(roleId, codes);
      if (!assignedRoles.has(roleId)) continue;

      const global = globalRoles.has(roleId);
      if (global) globalPermissionSet.add(code);
      // These capabilities require global authority even when attached to a scoped role.
      if (global || (code !== "erp.admin" && !code.startsWith("settings.") && !code.startsWith("numbering.rules.") && !["roles.manage", "permissions.manage"].includes(code))) permissionSet.add(code);
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
    roleAssignments: validAssignments.filter(assignment => roleNames.has(assignment.role_id)).map(assignment => ({
      roleId: assignment.role_id,
      roleCode: roleNames.get(assignment.role_id)!,
      ownerCompanyId: assignment.owner_company_id,
      branchId: assignment.branch_id,
      permissionCodes: rolePermissions.get(assignment.role_id) ?? [],
    })),
  };
}

// Worker workflows identify their principal by profile ID and keep their
// existing transport. Reuse the same scope and capability mapping above.
async function readWorkerAuthGraph(profileId: number): Promise<AuthGraph> {
  const admin = createAdminClient();
  const assignments = await admin.from("user_roles").select("role_id, owner_company_id, branch_id")
    .eq("user_profile_id", profileId).eq("is_active", true);
  if (assignments.error) throw new Error("Unable to resolve role assignments");

  const roleIds = (assignments.data ?? []).map(row => row.role_id as number).filter(Boolean);
  if (roleIds.length === 0) return { assignments: assignments.data ?? [], roles: [], links: [], permissions: [] };

  const roles = await admin.from("roles").select("id, role_code").in("id", roleIds).eq("is_active", true);
  if (roles.error) throw new Error("Unable to resolve active roles");
  const activeRoleIds = (roles.data ?? []).map(row => row.id as number).filter(Boolean);
  if (activeRoleIds.length === 0) return { assignments: assignments.data ?? [], roles: roles.data ?? [], links: [], permissions: [] };

  const links = await admin.from("role_permissions").select("role_id, permission_id").in("role_id", activeRoleIds);
  if (links.error) throw new Error("Unable to resolve role permissions");
  const permissionIds = (links.data ?? []).map(row => row.permission_id as number).filter(Boolean);
  if (permissionIds.length === 0) return { assignments: assignments.data ?? [], roles: roles.data ?? [], links: links.data ?? [], permissions: [] };

  const permissions = await admin.from("permissions").select("id, permission_code").in("id", permissionIds).eq("is_active", true);
  if (permissions.error) throw new Error("Unable to resolve permissions");
  return { assignments: assignments.data ?? [], roles: roles.data ?? [], links: links.data ?? [], permissions: permissions.data ?? [] };
}

// ── Boolean helpers ───────────────────────────────────────────────────────────

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
  if (ctx.profile.must_change_password === true) throw new Error("Password change required before using the application");
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
