/**
 * DEV — Auth context diagnostic. Admin-only (system_admin / group_admin).
 * Access: /dev/auth-debug
 * USERS.5 — guarded with requireAdmin() + DEBUG_ROUTE_ACCESSED audit event.
 */
import "server-only";

import { getAuthContext, isGlobalAdmin, requireAdmin } from "@/lib/rbac/check";
import { notFound } from "next/navigation";
import { logAudit } from "@/server/actions/audit";
import { sanitizeAuditDisplayPayload } from "@/lib/audit/sanitizers";

export default async function AuthDebugPage() {
  const ctx = await getAuthContext();

  // Non-authenticated users → 404 (don't advertise this route)
  if (!ctx.profile) return notFound();

  // Non-admin users → UNAUTHORIZED_ACCESS_ATTEMPT audit + 404
  if (!isGlobalAdmin(ctx)) {
    await logAudit({
      module_code: "users",
      entity_name: "debug_route",
      entity_id: ctx.profile.id,
      entity_reference: ctx.profile.full_name ?? `user-${ctx.profile.id}`,
      action: "UNAUTHORIZED_ACCESS_ATTEMPT",
      new_values: sanitizeAuditDisplayPayload({
        attempted_action: "access_debug_route",
        route: "/dev/auth-debug",
        required_permission: "erp.admin",
        actor_role_codes: ctx.roleCodes,
      }) as Record<string, unknown>,
    }).catch(() => {});
    return notFound();
  }

  // Admin: audit the access
    await logAudit({
      module_code: "users",
      entity_name: "debug_route",
      entity_id: ctx.profile.id,
      entity_reference: ctx.profile.full_name ?? `user-${ctx.profile.id}`,
      action: "DEBUG_ROUTE_ACCESSED",
      new_values: sanitizeAuditDisplayPayload({
        route: "/dev/auth-debug",
        role_codes: ctx.roleCodes,
      }) as Record<string, unknown>,
    }).catch(() => {});

  return (
    <div className="p-8 font-mono text-sm space-y-4 max-w-4xl">
      <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 px-4 py-3">
        <span className="text-amber-700 dark:text-amber-300 font-sans text-xs font-medium">
          ⚠ Admin-only diagnostic page. All access to this page is audited and recorded in the security log.
          This page is not visible to non-administrators.
        </span>
      </div>

      <h1 className="text-xl font-bold">Auth Context Debug</h1>

      <section className="border rounded p-4 space-y-1">
        <p><strong>profile.id:</strong> {ctx.profile.id}</p>
        <p><strong>full_name:</strong> {ctx.profile.full_name}</p>
        <p><strong>display_name:</strong> {ctx.profile.display_name ?? "(null)"}</p>
        <p><strong>email:</strong> {ctx.email}</p>
        <p><strong>status:</strong> {ctx.accountStatus}</p>
        <p><strong>isAccountActive:</strong> {String(ctx.isAccountActive)}</p>
        <p><strong>isGlobalAdmin:</strong> {String(isGlobalAdmin(ctx))}</p>
      </section>

      <section className="border rounded p-4 space-y-1">
        <p><strong>roleCodes ({ctx.roleCodes.length}):</strong></p>
        <ul className="pl-4 list-disc">
          {ctx.roleCodes.map((r) => <li key={r}>{r}</li>)}
        </ul>
      </section>

      <section className="border rounded p-4 space-y-1">
        <p><strong>permissionCodes ({ctx.permissionCodes.length}):</strong></p>
        <p className="text-green-600">HR: {ctx.permissionCodes.filter(p => p.startsWith("hr.")).join(", ") || "NONE"}</p>
        <p className="text-blue-600">DMS: {ctx.permissionCodes.filter(p => p.startsWith("dms.")).join(", ") || "NONE"}</p>
        <p className="text-orange-600">dashboard.view: {String(ctx.permissionCodes.includes("dashboard.view"))}</p>
        <details>
          <summary className="cursor-pointer">All permissions (first 50)</summary>
          <ul className="pl-4 list-disc">
            {ctx.permissionCodes.slice(0, 50).map((p) => <li key={p}>{p}</li>)}
          </ul>
        </details>
      </section>
    </div>
  );
}
