import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthContext, hasGlobalPermission } from "@/lib/rbac/check";
import { getParties } from "@/server/actions/master-data/parties";
import { PartiesTable } from "@/features/master-data/parties/parties-table";
import { ERPPageHeader } from "@/components/erp/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadError } from "@/components/erp/load-error";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function PartiesContent() {
  const authContext = await getAuthContext();

  if (!hasGlobalPermission(authContext, "master_data.parties.view") && !hasGlobalPermission(authContext, "master_data.party_master.view")) {
    redirect("/access-denied");
  }

  const result = await getParties();
  if (!result.success && result.kind === 'forbidden') redirect('/access-denied');
  if (!result.success || !result.data) return <LoadError title="Parties" retryHref="/admin/master-data/parties" />;
  const parties = result.data;

  return <PartiesTable parties={parties} authContext={authContext} />;
}

export default async function PartiesPage() {
  return (
    <div className="p-6 space-y-4">
      <ERPPageHeader
        title="Party Master"
        description="Unified master registry for customers, vendors, subcontractors, government authorities, and all other business parties."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Master Data", href: "/admin/master-data" },
          { label: "Party Master" },
        ]}
      />
      <Suspense fallback={<Skeleton className="h-[400px] w-full" />}>
        <PartiesContent />
      </Suspense>
    </div>
  );
}
