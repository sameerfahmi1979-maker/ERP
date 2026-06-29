/**
 * ERP USERS.4 — /start: Post-login smart redirect
 *
 * After login the browser is directed here. This server page calls getAuthContext()
 * once and redirects the user to the first route they are permitted to access.
 * This prevents users without dashboard.view from ever landing on /dashboard.
 */
import { redirect } from "next/navigation";
import { getAuthContext, isGlobalAdmin } from "@/lib/rbac/check";
import { getFirstPermittedRoute } from "@/lib/rbac/route-access-registry";

export default async function StartPage() {
  const ctx = await getAuthContext();

  if (!ctx.profile || !ctx.isAccountActive) {
    redirect("/login");
  }

  const firstRoute = getFirstPermittedRoute(ctx.permissionCodes, isGlobalAdmin(ctx));
  redirect(firstRoute);
}
