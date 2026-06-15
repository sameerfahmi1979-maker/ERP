export const dynamic = "force-dynamic";
export const revalidate = 0;

import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { getServiceCategoriesAdmin } from "@/server/actions/master-data/party-admin-masters";
import { ServiceCategoriesAdminTable } from "@/features/master-data/parties/admin/service-categories-admin-table";

export default async function ServiceCategoriesPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "master_data.parties.view")) {
    redirect("/admin");
  }

  const result = await getServiceCategoriesAdmin();
  const rows = result.success ? result.data ?? [] : [];

  return (
    <div className="container mx-auto py-6 px-4 max-w-6xl">
      <div className="mb-6">
        <nav className="text-sm text-muted-foreground mb-2">
          Master Data / Party Master / <span className="text-foreground">Service Categories</span>
        </nav>
        <h1 className="text-2xl font-semibold">Party Service Categories</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage the hierarchical service category master for party assignments.</p>
      </div>
      <ServiceCategoriesAdminTable rows={rows} authContext={ctx} />
    </div>
  );
}
