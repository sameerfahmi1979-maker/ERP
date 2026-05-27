import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("auth_user_id", user?.id ?? "")
    .maybeSingle();

  return (
    <div className="flex flex-col gap-6">
      <PageBreadcrumb items={[{ label: "Profile" }]} />
      <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
      <Card>
        <CardHeader>
          <CardTitle>Your ERP profile</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-2">
          <p>
            <span className="text-muted-foreground">Profile ID:</span> {profile?.id ?? "—"}
          </p>
          <p>
            <span className="text-muted-foreground">User code:</span> {profile?.user_code ?? "—"}
          </p>
          <p>
            <span className="text-muted-foreground">Email:</span> {user?.email ?? "—"}
          </p>
          <p>
            <span className="text-muted-foreground">Full name:</span> {profile?.full_name ?? "—"}
          </p>
          <p>
            <span className="text-muted-foreground">Display name:</span> {profile?.display_name ?? "—"}
          </p>
          <p className="flex items-center gap-2">
            <span className="text-muted-foreground">Status:</span>
            {profile?.status ? <StatusBadge status={profile.status} /> : "—"}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
