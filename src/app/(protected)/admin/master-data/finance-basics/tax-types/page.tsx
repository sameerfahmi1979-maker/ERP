import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthContext, hasPermission, type AuthContext } from "@/lib/rbac/check";
import { getTaxTypes } from "@/features/master-data/finance-basics/actions";
import { ERPPageHeader } from "@/components/erp/page-header";
import { TaxTypesTable } from "@/features/master-data/finance-basics/components/tax-types-table";

export const metadata = {
  title: "Tax Types | Finance Basics | Master Data | ERP",
  description: "Manage tax types including VAT rates, treatment codes, and applicability flags",
};

async function TaxTypesContent({ authContext }: { authContext: AuthContext }) {
  const result = await getTaxTypes();

  if (!result.success || !result.data) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Failed to load tax types</p>
        <p className="text-sm text-destructive mt-2">{result.error}</p>
      </div>
    );
  }

  return <TaxTypesTable taxTypes={result.data} authContext={authContext} />;
}

export default async function TaxTypesPage() {
  const ctx = await getAuthContext();

  if (!hasPermission(ctx, "master_data.finance_basics.view")) {
    redirect("/dashboard");
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-6">
      <ERPPageHeader
        title="Tax Types"
        description="Manage tax types with rates, VAT treatment codes, and sales/purchase applicability"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Master Data", href: "/admin/master-data" },
          { label: "Finance Basics", href: "/admin/master-data/finance-basics/currencies" },
          { label: "Tax Types", href: "/admin/master-data/finance-basics/tax-types" },
        ]}
      />

      <Suspense
        fallback={
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        }
      >
        <TaxTypesContent authContext={ctx} />
      </Suspense>
    </div>
  );
}
