import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthContext, hasPermission, type AuthContext } from "@/lib/rbac/check";
import { getBanks } from "@/features/master-data/finance-basics/actions";
import { ERPPageHeader } from "@/components/erp/page-header";
import { BanksTable } from "@/features/master-data/finance-basics/components/banks-table";

export const metadata = {
  title: "Banks | Finance Basics | Master Data | ERP",
  description: "Manage bank master data including SWIFT codes, country, and contact information",
};

async function BanksContent({ authContext }: { authContext: AuthContext }) {
  const result = await getBanks();

  if (!result.success || !result.data) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Failed to load banks</p>
        <p className="text-sm text-destructive mt-2">{result.error}</p>
      </div>
    );
  }

  return <BanksTable banks={result.data} authContext={authContext} />;
}

export default async function BanksPage() {
  const ctx = await getAuthContext();

  if (!hasPermission(ctx, "master_data.finance_basics.view")) {
    redirect("/dashboard");
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-6">
      <ERPPageHeader
        title="Banks"
        description="Manage bank institutions with SWIFT codes, country, type, and contact details"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Master Data", href: "/admin/master-data" },
          { label: "Finance Basics", href: "/admin/master-data/finance-basics/currencies" },
          { label: "Banks", href: "/admin/master-data/finance-basics/banks" },
        ]}
      />

      <Suspense
        fallback={
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        }
      >
        <BanksContent authContext={ctx} />
      </Suspense>
    </div>
  );
}
