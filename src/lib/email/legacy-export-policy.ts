import "server-only";
import { hasGlobalPermission, type AuthContext } from "@/lib/rbac/check";

/** Temporary owner-approved containment. Browser-supplied bytes have no trusted
 * company provenance. F08 must replace this path with server-generated delivery.
 * Neither a module label nor a scoped role establishes global sending authority.
 */
export function canSendLegacyExport(ctx: AuthContext): boolean {
  return hasGlobalPermission(ctx, "reports.email") && hasGlobalPermission(ctx, "reports.export");
}
