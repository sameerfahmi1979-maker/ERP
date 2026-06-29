import { redirect } from "next/navigation";
import { ErpShell } from "@/components/layout/erp-shell";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("display_name, full_name, status, must_change_password")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  // ERP USERS.1 — Block inactive/suspended users before any other check.
  const status = profile?.status ?? "active";
  if (status !== "active") {
    redirect("/account-disabled");
  }

  // ERP USERS.2A — Force password change gate.
  // Active users with must_change_password=true are redirected before ERP shell renders.
  if (profile?.must_change_password === true) {
    redirect("/change-password-required");
  }

  return (
    <ErpShell
      displayName={profile?.display_name ?? profile?.full_name}
      email={user.email}
    >
      {children}
    </ErpShell>
  );
}
