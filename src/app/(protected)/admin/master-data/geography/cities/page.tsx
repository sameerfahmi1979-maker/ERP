import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthContext, hasPermission, type AuthContext } from "@/lib/rbac/check";
import { getCities } from "@/features/master-data/geography/actions";
import { ERPPageHeader } from "@/components/erp/page-header";
import { CitiesTable } from "@/features/master-data/geography/components/cities-table";

export const metadata = {
  title: "Cities | Geography & Locations | Master Data | ERP",
  description: "Manage city master data and emirate relationships",
};

async function CitiesContent({ authContext }: { authContext: AuthContext }) {
  const result = await getCities();
  
  if (!result.success || !result.data) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Failed to load cities</p>
        <p className="text-sm text-destructive mt-2">{result.error}</p>
      </div>
    );
  }

  return <CitiesTable cities={result.data} authContext={authContext} />;
}

export default async function CitiesPage() {
  const ctx = await getAuthContext();
  
  if (!hasPermission(ctx, "master_data.geography.view")) {
    redirect("/access-denied");
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-6">
      <ERPPageHeader
        title="Cities"
        description="Manage city master data and emirate relationships"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Master Data", href: "/admin/master-data" },
          { label: "Geography & Locations", href: "/admin/master-data/geography/countries" },
          { label: "Cities", href: "/admin/master-data/geography/cities" },
        ]}
      />
      
      <Suspense fallback={
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      }>
        <CitiesContent authContext={ctx} />
      </Suspense>
    </div>
  );
}

