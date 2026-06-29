import { ShieldOff } from "lucide-react";
import { getAuthContext } from "@/lib/rbac/check";
import { getFirstPermittedRoute } from "@/lib/rbac/route-access-registry";
import { redirect } from "next/navigation";

/**
 * ERP USERS.4 — No Access page.
 * Shown when an authenticated user has no permissions at all (e.g. newly created user
 * with no roles yet assigned). If a permitted route is found on re-check, redirects there.
 */
export default async function NoAccessPage() {
  const ctx = await getAuthContext();
  if (ctx.isAccountActive && ctx.permissionCodes.length > 0) {
    const firstRoute = getFirstPermittedRoute(ctx.permissionCodes, ctx.roleCodes.some((r) => r === "system_admin" || r === "group_admin"));
    redirect(firstRoute);
  }

  const displayName = ctx.profile?.display_name ?? ctx.profile?.full_name ?? "User";

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-4 text-center">
      <div className="flex items-center justify-center h-16 w-16 rounded-full bg-muted">
        <ShieldOff className="h-8 w-8 text-muted-foreground" />
      </div>

      <div className="space-y-2 max-w-md">
        <h1 className="text-2xl font-bold tracking-tight">No Modules Assigned</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Welcome, <strong>{displayName}</strong>. Your account is active but you
          don&apos;t have access to any ERP modules yet.
          Please contact your system administrator to have a role assigned to your account.
        </p>
      </div>

      <p className="text-xs text-muted-foreground/60">
        Reference your account to your administrator for role assignment.
      </p>
    </div>
  );
}
