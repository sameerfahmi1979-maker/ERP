export const dynamic = "force-dynamic";
export const revalidate = 0;

import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { getRelationshipTypesAdmin } from "@/server/actions/master-data/party-admin-masters";
import { RelationshipTypesAdminTable } from "@/features/master-data/parties/admin/relationship-types-admin-table";
import { ERPPageHeader } from "@/components/erp/page-header";

export default async function RelationshipTypesPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "master_data.parties.view")) {
    redirect("/admin");
  }

  const result = await getRelationshipTypesAdmin();
  const rows = result.success ? result.data ?? [] : [];

  return (
    <div className="p-6 space-y-4">
      <ERPPageHeader
        title="Party Relationship Types"
        description="Manage relationship type codes used to classify party-to-party relationships."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Master Data", href: "/admin/master-data" },
          { label: "Party Master", href: "/admin/master-data/parties" },
          { label: "Relationship Types" },
        ]}
      />
      <RelationshipTypesAdminTable rows={rows} authContext={ctx} />
    </div>
  );
}
