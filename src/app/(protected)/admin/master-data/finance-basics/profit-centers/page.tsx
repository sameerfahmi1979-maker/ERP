import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthContext, hasPermission, hasGlobalPermission, type AuthContext } from "@/lib/rbac/check";
import { getProfitCenters } from "@/features/master-data/finance-basics/actions";
import { ERPPageHeader } from "@/components/erp/page-header";
import { LoadError } from "@/components/erp/load-error";
import { ProfitCentersTable } from "@/features/master-data/finance-basics/components/profit-centers-table";

export const metadata = {
  title: "Profit Centers | Finance Basics | Master Data | ERP",
  description: "Manage profit center master data for reporting and organizational allocation",
};

async function ProfitCentersContent({ authContext }: { authContext: AuthContext }) {
  const result = await getProfitCenters();

  if (!result.success || !result.data) {
    return (
      <div className="space-y-2">
        <LoadError title="Profit centers" retryHref="/admin/master-data/finance-basics/profit-centers" />
        <p className="text-sm text-destructive mt-2">{result.error}</p>
      </div>
    );
  }

  return <ProfitCentersTable profitCenters={result.data} authContext={authContext} />;
}

export default async function ProfitCentersPage() {
  const ctx = await getAuthContext();

  if (!hasPermission(ctx, "master_data.finance_basics.view")&&!hasGlobalPermission(ctx,"master_data.finance_basics.manage")&&!hasGlobalPermission(ctx,"master_data.lookups.lock")) {
    redirect("/access-denied");
  }

  return (
    <div className="p-6 space-y-4">
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
          <div role="status" className="flex items-center justify-center py-12">
            <span className="sr-only">Loading profit centers</span>
            <div aria-hidden="true" className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        }
      >
        <ProfitCentersContent authContext={ctx} />
      </Suspense>
    </div>
  );
}
