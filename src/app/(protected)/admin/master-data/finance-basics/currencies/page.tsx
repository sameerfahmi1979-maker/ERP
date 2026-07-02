import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthContext, hasPermission, type AuthContext } from "@/lib/rbac/check";
import { getCurrencies } from "@/features/master-data/finance-basics/actions";
import { ERPPageHeader } from "@/components/erp/page-header";
import { CurrenciesTable } from "@/features/master-data/finance-basics/components/currencies-table";

export const metadata = {
  title: "Currencies | Finance Basics | Master Data | ERP",
  description: "Manage currency master data including ISO codes, decimal places, and base currency",
};

async function CurrenciesContent({ authContext }: { authContext: AuthContext }) {
  const result = await getCurrencies();

  if (!result.success || !result.data) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Failed to load currencies</p>
        <p className="text-sm text-destructive mt-2">{result.error}</p>
      </div>
    );
  }

  return <CurrenciesTable currencies={result.data} authContext={authContext} />;
}

export default async function CurrenciesPage() {
  const ctx = await getAuthContext();

  if (!hasPermission(ctx, "master_data.finance_basics.view")) {
    redirect("/access-denied");
  }

  return (
    <div className="p-6 space-y-4">
      <ERPPageHeader
        title="Currencies"
        description="Manage ISO 4217 currency codes, decimal places, and base currency configuration"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Master Data", href: "/admin/master-data" },
          { label: "Finance Basics", href: "/admin/master-data/finance-basics/currencies" },
          { label: "Currencies", href: "/admin/master-data/finance-basics/currencies" },
        ]}
      />

      <Suspense
        fallback={
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        }
      >
        <CurrenciesContent authContext={ctx} />
      </Suspense>
    </div>
  );
}
