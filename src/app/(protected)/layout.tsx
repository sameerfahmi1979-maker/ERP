import { redirect } from "next/navigation";
import { ErpShell } from "@/components/layout/erp-shell";
import { getAuthContext, isGlobalAdmin } from "@/lib/rbac/check";
import { loadRuntimeAppBranding } from "@/lib/branding/load-runtime-app-branding";

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

  return (
    <ErpShell
      displayName={ctx.profile.display_name ?? ctx.profile.full_name}
      email={ctx.email}
      permissionCodes={ctx.permissionCodes}
      isGlobalAdmin={globalAdmin}
      appBranding={appBranding}
    >
      {children}
    </ErpShell>
  );
}
