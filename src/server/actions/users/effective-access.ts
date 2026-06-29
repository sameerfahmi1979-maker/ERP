"use server";

import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { logAudit } from "@/server/actions/audit";
import { sanitizeServerActionError } from "@/lib/audit/sanitizers";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

export type EffectivePermissionRow = {
  permission_code: string;
  permission_name: string | null;
  module_code: string | null;
  source_role_code: string;
  source_role_name: string | null;
  scope_type: "global" | "company" | "branch";
  owner_company_id: number | null;
  branch_id: number | null;
  assigned_at: string | null;
};

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Build the effective permission set for a given user_profile_id.
 * Uses admin client to bypass RLS on roles/permissions (bootstrap deadlock issue).
 */
async function buildEffectivePermissions(
  userProfileId: number,
): Promise<EffectivePermissionRow[]> {
  const admin = createAdminClient();

  // Step 1 — get active user_roles
  const { data: userRoles, error: err1 } = await admin
    .from("user_roles")
    .select("role_id, owner_company_id, branch_id, created_at")
    .eq("user_profile_id", userProfileId)
    .eq("is_active", true);

  if (err1) {
    logger.error("buildEffectivePermissions: user_roles error", err1);
    return [];
  }

  if (!userRoles?.length) return [];

  const roleIds = userRoles.map((r) => r.role_id as number);

  // Step 2 — get active role records
  const { data: roles, error: err2 } = await admin
    .from("roles")
    .select("id, role_code, role_name")
    .in("id", roleIds)
    .eq("is_active", true);

  if (err2) {
    logger.error("buildEffectivePermissions: roles error", err2);
    return [];
  }

  const activeRoleIds = (roles ?? []).map((r) => r.id as number);
  if (!activeRoleIds.length) return [];

  // Build role map
  const roleMap = new Map(
    (roles ?? []).map((r) => [r.id as number, { role_code: r.role_code as string, role_name: r.role_name as string | null }])
  );

  // Step 3 — get role_permissions
  const { data: rolePerms, error: err3 } = await admin
    .from("role_permissions")
    .select("role_id, permission_id")
    .in("role_id", activeRoleIds);

  if (err3) {
    logger.error("buildEffectivePermissions: role_permissions error", err3);
    return [];
  }

  const permissionIds = [...new Set((rolePerms ?? []).map((rp) => rp.permission_id as number))];
  if (!permissionIds.length) return [];

  // Step 4 — get active permissions
  const { data: permissions, error: err4 } = await admin
    .from("permissions")
    .select("id, permission_code, permission_name, module_code")
    .in("id", permissionIds)
    .eq("is_active", true);

  if (err4) {
    logger.error("buildEffectivePermissions: permissions error", err4);
    return [];
  }

  const permMap = new Map(
    (permissions ?? []).map((p) => [
      p.id as number,
      { permission_code: p.permission_code as string, permission_name: p.permission_name as string | null, module_code: p.module_code as string | null },
    ])
  );

  // Build result rows
  const rows: EffectivePermissionRow[] = [];

  for (const rp of rolePerms ?? []) {
    const roleId = rp.role_id as number;
    const permId = rp.permission_id as number;
    const perm = permMap.get(permId);
    const role = roleMap.get(roleId);
    if (!perm || !role) continue;

    // Find the user_role entry for scope info
    const userRole = userRoles.find((ur) => ur.role_id === roleId);
    const ownerCompanyId = (userRole?.owner_company_id ?? null) as number | null;
    const branchId = (userRole?.branch_id ?? null) as number | null;
    const scopeType: "global" | "company" | "branch" =
      branchId ? "branch" : ownerCompanyId ? "company" : "global";

    rows.push({
      permission_code: perm.permission_code,
      permission_name: perm.permission_name,
      module_code: perm.module_code,
      source_role_code: role.role_code,
      source_role_name: role.role_name,
      scope_type: scopeType,
      owner_company_id: ownerCompanyId,
      branch_id: branchId,
      assigned_at: userRole?.created_at as string | null,
    });
  }

  return rows;
}

// ── Server Actions ─────────────────────────────────────────────────────────────

/**
 * Get the current user's own effective access.
 * Any active authenticated user may call this.
 */
export async function getMyEffectiveAccess(): Promise<ActionResult<EffectivePermissionRow[]>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile || !ctx.isAccountActive) {
      return { success: false, error: "Not authenticated or account inactive." };
    }

    const rows = await buildEffectivePermissions(ctx.profile.id);
    return { success: true, data: rows };
  } catch (error) {
    logger.error("getMyEffectiveAccess exception", error);
    return { success: false, error: sanitizeServerActionError(error) };
  }
}

/**
 * Get the effective access for any user (admin/security view).
 * Requires users.view OR permissions.view OR audit.view.
 */
export async function getUserEffectiveAccess(
  userProfileId: number,
): Promise<ActionResult<EffectivePermissionRow[]>> {
  try {
    const ctx = await getAuthContext();

    if (!ctx.profile) {
      return { success: false, error: "Not authenticated." };
    }

    const canView =
      hasPermission(ctx, "users.view") ||
      hasPermission(ctx, "permissions.view") ||
      hasPermission(ctx, "audit.view");

    if (!canView) {
      return { success: false, error: "You do not have permission to view effective access." };
    }

    const rows = await buildEffectivePermissions(userProfileId);

    // Audit the admin view
    await logAudit({
      module_code: "users",
      entity_name: "user_profiles",
      entity_id: userProfileId,
      entity_reference: `user-${userProfileId}`,
      action: "EFFECTIVE_ACCESS_VIEWED",
      new_values: {
        viewed_by_profile_id: ctx.profile.id,
        target_user_profile_id: userProfileId,
        permission_count: rows.length,
      },
    }).catch(() => {});

    return { success: true, data: rows };
  } catch (error) {
    logger.error("getUserEffectiveAccess exception", error);
    return { success: false, error: sanitizeServerActionError(error) };
  }
}
