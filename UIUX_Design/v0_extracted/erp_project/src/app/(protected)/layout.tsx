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
    .select("display_name, full_name")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  return (
    <ErpShell
      displayName={profile?.display_name ?? profile?.full_name}
      email={user.email}
    >
      {children}
    </ErpShell>
  );
}
