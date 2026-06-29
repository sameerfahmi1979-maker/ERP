import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthContext, hasPermission, type AuthContext } from "@/lib/rbac/check";
import { getCountries } from "@/features/master-data/geography/actions";
import { ERPPageHeader } from "@/components/erp/page-header";
import { CountriesTable } from "@/features/master-data/geography/components/countries-table";

export const metadata = {
  title: "Countries | Geography & Locations | Master Data | ERP",
  description: "Manage country master data including ISO codes, nationalities, and classifications",
};

async function CountriesContent({ authContext }: { authContext: AuthContext }) {
  const result = await getCountries();
  
  if (!result.success || !result.data) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Failed to load countries</p>
        <p className="text-sm text-destructive mt-2">{result.error}</p>
      </div>
    );
  }

  return <CountriesTable countries={result.data} authContext={authContext} />;
}

export default async function CountriesPage() {
  const ctx = await getAuthContext();
  
  if (!hasPermission(ctx, "master_data.geography.view")) {
    redirect("/access-denied");
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-6">
      <ERPPageHeader
        title="Countries"
        description="Manage country master data with ISO codes, nationalities, and GCC classifications"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Master Data", href: "/admin/master-data" },
          { label: "Geography & Locations", href: "/admin/master-data/geography/countries" },
          { label: "Countries", href: "/admin/master-data/geography/countries" },
        ]}
      />
      
      <Suspense fallback={
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      }>
        <CountriesContent authContext={ctx} />
      </Suspense>
    </div>
  );
}
