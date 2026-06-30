import { ShieldOff, LogOut, LayoutDashboard } from "lucide-react";
import { getAuthContext } from "@/lib/rbac/check";
import { getFirstPermittedRoute } from "@/lib/rbac/route-access-registry";
import { redirect } from "next/navigation";
import Link from "next/link";

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

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-4 text-center">
      <div className="flex items-center justify-center h-16 w-16 rounded-full bg-muted">
        <ShieldOff className="h-8 w-8 text-muted-foreground" />
      </div>

      <div className="space-y-2 max-w-md">
        <h1 className="text-2xl font-bold tracking-tight">No Modules Assigned</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Your account is active but you don&apos;t have access to any ERP modules yet.
          Please contact your ERP administrator to have a role assigned to your account.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-3">
        {/* Notifications is typically accessible without a module permission */}
        <Link
          href="/notifications"
          className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <LayoutDashboard className="h-4 w-4" />
          Notifications
        </Link>
        <form action="/api/auth/signout" method="post">
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-md border border-destructive/30 bg-background px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </form>
      </div>
    </div>
  );
}
