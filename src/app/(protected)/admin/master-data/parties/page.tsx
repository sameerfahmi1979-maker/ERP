import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { getParties } from "@/server/actions/master-data/parties";
import { PartiesTable } from "@/features/master-data/parties/parties-table";
import { ERPPageHeader } from "@/components/erp/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function PartiesContent() {
  const authContext = await getAuthContext();

  if (!hasPermission(authContext, "master_data.parties.view")) {
    redirect("/admin");
  }

  const result = await getParties();
  const parties = result.success && result.data ? result.data : [];

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
