import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthContext, hasPermission, type AuthContext } from "@/lib/rbac/check";
import { getProfitCenters } from "@/features/master-data/finance-basics/actions";
import { ERPPageHeader } from "@/components/erp/page-header";
import { ProfitCentersTable } from "@/features/master-data/finance-basics/components/profit-centers-table";

export const metadata = {
  title: "Profit Centers | Finance Basics | Master Data | ERP",
  description: "Manage profit center master data for reporting and organizational allocation",
};

async function ProfitCentersContent({ authContext }: { authContext: AuthContext }) {
  const result = await getProfitCenters();

  if (!result.success || !result.data) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Failed to load profit centers</p>
        <p className="text-sm text-destructive mt-2">{result.error}</p>
      </div>
    );
  }

  return <ProfitCentersTable profitCenters={result.data} authContext={authContext} />;
}

export default async function ProfitCentersPage() {
  const ctx = await getAuthContext();

  if (!hasPermission(ctx, "master_data.finance_basics.view")) {
    redirect("/access-denied");
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-6">
      <ERPPageHeader
        title="Profit Centers"
        description="Manage profit centers with hierarchy, type classification, and company/branch scope"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Master Data", href: "/admin/master-data" },
          { label: "Finance Basics", href: "/admin/master-data/finance-basics/currencies" },
          { label: "Profit Centers", href: "/admin/master-data/finance-basics/profit-centers" },
        ]}
      />

      <Suspense
        fallback={
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        }
      >
        <ProfitCentersContent authContext={ctx} />
      </Suspense>
    </div>
  );
}
