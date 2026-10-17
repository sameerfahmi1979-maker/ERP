export const dynamic = "force-dynamic";
export const revalidate = 0;

import { getAuthContext, hasGlobalPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { getServiceCategoriesAdmin } from "@/server/actions/master-data/party-admin-masters";
import { ServiceCategoriesAdminTable } from "@/features/master-data/parties/admin/service-categories-admin-table";
import { ERPPageHeader } from "@/components/erp/page-header";

export default async function ServiceCategoriesPage() {
  const ctx = await getAuthContext();
  if (!hasGlobalPermission(ctx, "master_data.parties.view") && !hasGlobalPermission(ctx, "master_data.parties.manage_services")) {
    redirect("/admin");
  }

  const result = await getServiceCategoriesAdmin();
  if (!result.success) return <div role="alert" className="p-6">{result.error ?? "The catalogue could not be loaded. Retry before making changes."}</div>;
  const rows = result.data ?? [];

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
