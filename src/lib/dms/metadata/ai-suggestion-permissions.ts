/**
 * DMS AI META.2 — AI Metadata Suggestion Approval Permission Guard
 *
 * Shared, synchronous permission check used by:
 *   - server actions that generate/approve AI metadata suggestions
 *   - server components/pages that decide whether to show the
 *     "Suggest Fields with AI" action vs. the "Ask a DMS Manager" message
 *
 * Kept in a plain (non "use server") module because Next.js requires every
 * export of a "use server" file to be an async function, and this needs to
 * be callable synchronously from server components.
 */

import type { AuthContext } from "@/lib/rbac/check";
import { hasPermission } from "@/lib/rbac/check";

/**
 * True if the current user is authorized to review AI metadata suggestions
 * and create the metadata definitions they select.
 *
 * Authorized when ANY of the following is true:
 *   - dms.metadata.ai_suggestions.approve (DMS AI META.2 dedicated permission)
 *   - dms.documents.manage_types (existing META.1 metadata management permission)
 *   - dms.admin
 *   - system_admin / group_admin role
 */
export function canApproveAiMetadataSuggestions(ctx: AuthContext): boolean {
  return (
    hasPermission(ctx, "dms.metadata.ai_suggestions.approve") ||
    hasPermission(ctx, "dms.documents.manage_types") ||
    hasPermission(ctx, "dms.admin") ||
    (ctx.roleCodes?.includes("system_admin") ?? false) ||
    (ctx.roleCodes?.includes("group_admin") ?? false)
  );
}
