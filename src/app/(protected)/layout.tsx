import { redirect } from "next/navigation";
import { ErpShell } from "@/components/layout/erp-shell";
import { getAuthContext, isGlobalAdmin } from "@/lib/rbac/check";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // ERP USERS.4 — Single getAuthContext() call replaces the old direct user_profiles query.
  // ctx.profile contains all user_profiles columns; no separate DB round-trip needed.
  const ctx = await getAuthContext();

  if (!ctx.profile) {
    redirect("/login");
  }

  // ERP USERS.1 — Block inactive/suspended users before any other check.
  if (!ctx.isAccountActive) {
    redirect("/account-disabled");
  }

  // ERP USERS.2A — Force password change gate.
  if (ctx.profile.must_change_password === true) {
    redirect("/change-password-required");
  }

  const globalAdmin = isGlobalAdmin(ctx);

  return (
    <ErpShell
      displayName={ctx.profile.display_name ?? ctx.profile.full_name}
      email={ctx.email}
      permissionCodes={ctx.permissionCodes}
      isGlobalAdmin={globalAdmin}
    >
      {children}
    </ErpShell>
  );
}
