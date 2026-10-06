import { redirect } from "next/navigation";
import { ErpShell } from "@/components/layout/erp-shell";
import { getAuthContext, isGlobalAdmin } from "@/lib/rbac/check";
import { loadRuntimeAppBranding } from "@/lib/branding/load-runtime-app-branding";
import { SessionBoundary } from "@/components/layout/session-boundary";
import { ReadCacheBoundary } from "@/components/layout/read-cache-boundary";
import { readScopeVersion } from "@/lib/reads/scope-version";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getAuthContext();

  if (!ctx.profile) {
    redirect("/login");
  }

  if (!ctx.isAccountActive) {
    redirect("/account-disabled");
  }

  if (ctx.profile.must_change_password === true) {
    redirect("/change-password-required");
  }

  const globalAdmin = isGlobalAdmin(ctx);
  const appBranding = await loadRuntimeAppBranding();
  const scopeVersion = readScopeVersion(ctx);

  return (
    <SessionBoundary key={ctx.profile.auth_user_id} authUserId={ctx.profile.auth_user_id} scopeVersion={scopeVersion}><ReadCacheBoundary key={`${ctx.profile.auth_user_id}:${scopeVersion}`}><ErpShell
      principalId={ctx.profile.auth_user_id}
      displayName={ctx.profile.display_name ?? ctx.profile.full_name}
      email={ctx.email}
      permissionCodes={ctx.permissionCodes}
      globalPermissionCodes={ctx.globalPermissionCodes}
      isGlobalAdmin={globalAdmin}
      appBranding={appBranding}
    >
      {children}
    </ErpShell></ReadCacheBoundary></SessionBoundary>
  );
}
