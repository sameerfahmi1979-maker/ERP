export const dynamic = "force-dynamic";
export const revalidate = 0;

import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { getRelationshipTypesAdmin } from "@/server/actions/master-data/party-admin-masters";
import { RelationshipTypesAdminTable } from "@/features/master-data/parties/admin/relationship-types-admin-table";

export default async function RelationshipTypesPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "master_data.parties.view")) {
    redirect("/admin");
  }

  const result = await getRelationshipTypesAdmin();
  const rows = result.success ? result.data ?? [] : [];

  return (
    <div className="container mx-auto py-6 px-4 max-w-6xl">
      <div className="mb-6">
        <nav className="text-sm text-muted-foreground mb-2">
          Master Data / Party Master / <span className="text-foreground">Relationship Types</span>
        </nav>
        <h1 className="text-2xl font-semibold">Party Relationship Types</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage relationship type codes used to classify party-to-party relationships.</p>
      </div>
      <RelationshipTypesAdminTable rows={rows} authContext={ctx} />
    </div>
  );
}
