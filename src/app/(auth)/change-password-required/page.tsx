import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChangePasswordRequiredForm } from "@/features/auth/change-password-required-form";

export const dynamic = "force-dynamic";

export default async function ChangePasswordRequiredPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Not authenticated — go to login
  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("must_change_password, must_change_password_reason, status")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  // Inactive/suspended — let account-disabled handle it
  if (profile?.status && profile.status !== "active") {
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
