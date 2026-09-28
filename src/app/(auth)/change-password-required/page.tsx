import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/rbac/check";
import { ChangePasswordRequiredForm } from "@/features/auth/change-password-required-form";

export const dynamic = "force-dynamic";

export default async function ChangePasswordRequiredPage() {
  const ctx = await getAuthContext();
  const profile = ctx.profile;
  if (!profile) {
    redirect("/login");
  }

  if (!ctx.isAccountActive) {
    redirect("/account-disabled");
  }

  // must_change_password is false — user shouldn't be here
  if (!profile?.must_change_password) {
    redirect("/dashboard");
  }

  return (
    <ChangePasswordRequiredForm
      reason={profile.must_change_password_reason ?? undefined}
    />
  );
}
