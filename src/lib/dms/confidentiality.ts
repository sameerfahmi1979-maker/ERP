/**
 * Shared confidentiality-level utilities for DMS.
 * This is NOT a "use server" file — it exports plain synchronous helpers
 * that can be imported by both server actions and other server-side modules.
 */

import { hasPermission } from "@/lib/rbac/check";
import type { getAuthContext } from "@/lib/rbac/check";

export const SENSITIVE_LEVELS = ["hr", "finance", "legal", "executive"] as const;
export type ConfidentialityLevel =
  | "internal"
  | "company"
  | "hr"
  | "finance"
  | "legal"
  | "executive";

/**
 * Returns the set of confidentiality levels the current user may access.
 * Admins/system_admin get all levels.
 * Otherwise, `internal` and `company` are always included (base view permission already checked).
 * Per-sensitive level: included only when the user holds the matching per-level permission.
 */
export function getAllowedConfidentialityLevels(
  ctx: Awaited<ReturnType<typeof getAuthContext>>
): ConfidentialityLevel[] {
  const isAdmin =
    hasPermission(ctx, "dms.admin") || ctx.roleCodes.includes("system_admin");
  if (isAdmin) return ["internal", "company", "hr", "finance", "legal", "executive"];

  const allowed: ConfidentialityLevel[] = ["internal", "company"];
  for (const level of SENSITIVE_LEVELS) {
    if (hasPermission(ctx, `dms.documents.view.${level}`)) {
      allowed.push(level);
    }
  }
  return allowed;
}
