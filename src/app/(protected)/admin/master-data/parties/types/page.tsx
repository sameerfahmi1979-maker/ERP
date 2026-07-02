export const dynamic = "force-dynamic";
export const revalidate = 0;

import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { getPartyTypesAdmin } from "@/server/actions/master-data/party-admin-masters";
import { PartyTypesAdminTable } from "@/features/master-data/parties/admin/party-types-admin-table";
import { ERPPageHeader } from "@/components/erp/page-header";

export default async function PartyTypesPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "master_data.parties.view")) {
    redirect("/admin");
  }

  const result = await getPartyTypesAdmin();
  const rows = result.success ? result.data ?? [] : [];

  return (
    <div className="p-6 space-y-4">
      <ERPPageHeader
        title="Party Types"
        description="Manage party type master records. System types cannot have their code changed."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Master Data", href: "/admin/master-data" },
          { label: "Party Master", href: "/admin/master-data/parties" },
          { label: "Party Types" },
        ]}
      />
      <PartyTypesAdminTable rows={rows} authContext={ctx} />
    </div>
  );
}
