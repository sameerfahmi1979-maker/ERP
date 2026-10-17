export const dynamic = "force-dynamic";
export const revalidate = 0;

import { getAuthContext, hasGlobalPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { getPartyTypesAdmin } from "@/server/actions/master-data/party-admin-masters";
import { PartyTypesAdminTable } from "@/features/master-data/parties/admin/party-types-admin-table";
import { ERPPageHeader } from "@/components/erp/page-header";

export default async function PartyTypesPage() {
  const ctx = await getAuthContext();
  if (!hasGlobalPermission(ctx, "master_data.parties.view")&&!hasGlobalPermission(ctx,"master_data.parties.manage_types")) {
    redirect("/admin");
  }

  const result = await getPartyTypesAdmin();
  const rows = result.success ? result.data ?? [] : [];

  return (
    <div className="p-6 space-y-4">
      <ERPPageHeader
        title="Party Types"
        description="Manage shared party classifications. Codes and system flags stay unchanged; inactive types retain their history."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Master Data", href: "/admin/master-data" },
          { label: "Party Master", href: "/admin/master-data/parties" },
          { label: "Party Types" },
        ]}
      />
      {result.success?<PartyTypesAdminTable rows={rows} authContext={ctx} />:<div role="alert" className="text-destructive">{result.error??'Party types could not be loaded.'}</div>}
    </div>
  );
}
