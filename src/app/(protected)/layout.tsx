import { redirect } from "next/navigation";
import { ErpShell } from "@/components/layout/erp-shell";
import { isGlobalAdmin } from "@/lib/rbac/check";
import { loadRuntimeAppBranding } from "@/lib/branding/load-runtime-app-branding";
import { SessionBoundary } from "@/components/layout/session-boundary";
import { ReadCacheBoundary } from "@/components/layout/read-cache-boundary";
import { readScopeVersion } from "@/lib/reads/scope-version";
import { sessionFingerprint } from "@/features/messages/session-fingerprint";
import { getRenderAuthContext } from "@/server/reads/render-auth-context";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getRenderAuthContext();

  if (!ctx.profile) {
    redirect("/login");
  }

  if (!ctx.isAccountActive) {
    redirect("/account-disabled");
  }

  if (ctx.profile.must_change_password === true) {
    redirect("/change-password-required");
  }

  const authUserId = ctx.profile.auth_user_id;
  const globalAdmin = isGlobalAdmin(ctx);
  const [appBranding, sessionTag] = await Promise.all([
    loadRuntimeAppBranding(),
    sessionFingerprint(authUserId),
  ]);
  const scopeVersion = readScopeVersion(ctx);

  return (
    <ReadCacheBoundary key={`${authUserId}:${scopeVersion}`} authUserId={authUserId} scopeVersion={scopeVersion}>
      <SessionBoundary key={authUserId} authUserId={authUserId} scopeVersion={scopeVersion} sessionTag={sessionTag}>
        <ErpShell
          principalId={authUserId}
          displayName={ctx.profile.display_name ?? ctx.profile.full_name}
          email={ctx.email}
          permissionCodes={ctx.permissionCodes}
          globalPermissionCodes={ctx.globalPermissionCodes}
          isGlobalAdmin={globalAdmin}
          appBranding={appBranding}
        >
          {children}
        </ErpShell>
      </SessionBoundary>
    </ReadCacheBoundary>
  );
}
