import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthContext, hasPermission, type AuthContext } from "@/lib/rbac/check";
import { getCostCenters } from "@/features/master-data/finance-basics/actions";
import { ERPPageHeader } from "@/components/erp/page-header";
import { CostCentersTable } from "@/features/master-data/finance-basics/components/cost-centers-table";

export const metadata = {
  title: "Cost Centers | Finance Basics | Master Data | ERP",
  description: "Manage cost center master data for reporting and organizational allocation",
};

async function CostCentersContent({ authContext }: { authContext: AuthContext }) {
  const result = await getCostCenters();

  if (!result.success || !result.data) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Failed to load cost centers</p>
        <p className="text-sm text-destructive mt-2">{result.error}</p>
      </div>
    );
  }

  return <CostCentersTable costCenters={result.data} authContext={authContext} />;
}

export default async function CostCentersPage() {
  const ctx = await getAuthContext();

  if (!hasPermission(ctx, "master_data.finance_basics.view")) {
    redirect("/access-denied");
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-6">
      <ERPPageHeader
        title="Cost Centers"
        description="Manage cost centers with hierarchy, type classification, and company/branch scope"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Master Data", href: "/admin/master-data" },
          { label: "Finance Basics", href: "/admin/master-data/finance-basics/currencies" },
          { label: "Cost Centers", href: "/admin/master-data/finance-basics/cost-centers" },
        ]}
      />

      <Suspense
        fallback={
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        }
      >
        <CostCentersContent authContext={ctx} />
      </Suspense>
    </div>
  );
}
