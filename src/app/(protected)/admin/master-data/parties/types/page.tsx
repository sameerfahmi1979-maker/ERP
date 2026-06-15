export const dynamic = "force-dynamic";
export const revalidate = 0;

import { getAuthContext } from "@/lib/rbac/check";
import { hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { getPartyTypesAdmin } from "@/server/actions/master-data/party-admin-masters";
import { PartyTypesAdminTable } from "@/features/master-data/parties/admin/party-types-admin-table";

export default async function PartyTypesPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "master_data.parties.view")) {
    redirect("/admin");
  }

  const result = await getPartyTypesAdmin();
  const rows = result.success ? result.data ?? [] : [];

  return (
    <div className="container mx-auto py-6 px-4 max-w-6xl">
      <div className="mb-6">
        <nav className="text-sm text-muted-foreground mb-2">
          Master Data / Party Master / <span className="text-foreground">Party Types</span>
        </nav>
        <h1 className="text-2xl font-semibold">Party Types</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage party type master records. System types cannot have their code changed.</p>
      </div>
      <PartyTypesAdminTable rows={rows} authContext={ctx} />
    </div>
  );
}
