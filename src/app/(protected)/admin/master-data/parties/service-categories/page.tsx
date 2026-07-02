export const dynamic = "force-dynamic";
export const revalidate = 0;

import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { getServiceCategoriesAdmin } from "@/server/actions/master-data/party-admin-masters";
import { ServiceCategoriesAdminTable } from "@/features/master-data/parties/admin/service-categories-admin-table";
import { ERPPageHeader } from "@/components/erp/page-header";

export default async function ServiceCategoriesPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "master_data.parties.view")) {
    redirect("/admin");
  }

  const result = await getServiceCategoriesAdmin();
  const rows = result.success ? result.data ?? [] : [];

  return (
    <div className="p-6 space-y-4">
      <ERPPageHeader
        title="Party Service Categories"
        description="Manage the hierarchical service category master for party assignments."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Master Data", href: "/admin/master-data" },
          { label: "Party Master", href: "/admin/master-data/parties" },
          { label: "Service Categories" },
        ]}
      />
      <ServiceCategoriesAdminTable rows={rows} authContext={ctx} />
    </div>
  );
}
