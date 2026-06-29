import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthContext, hasPermission, type AuthContext } from "@/lib/rbac/check";
import { getAreasZones } from "@/features/master-data/geography/actions";
import { ERPPageHeader } from "@/components/erp/page-header";
import { AreasTable } from "@/features/master-data/geography/components/areas-table";

export const metadata = {
  title: "Areas & Zones | Geography & Locations | Master Data | ERP",
  description: "Manage area and zone master data including free zones, industrial areas, and port areas",
};

async function AreasContent({ authContext }: { authContext: AuthContext }) {
  const result = await getAreasZones();
  
  if (!result.success || !result.data) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Failed to load areas</p>
        <p className="text-sm text-destructive mt-2">{result.error}</p>
      </div>
    );
  }

  return <AreasTable areas={result.data} authContext={authContext} />;
}

export default async function AreasPage() {
  const ctx = await getAuthContext();
  
  if (!hasPermission(ctx, "master_data.geography.view")) {
    redirect("/access-denied");
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-6">
      <ERPPageHeader
        title="Areas & Zones"
        description="Manage areas and zones including free zones, industrial areas, and port areas"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Master Data", href: "/admin/master-data" },
          { label: "Geography & Locations", href: "/admin/master-data/geography/countries" },
          { label: "Areas & Zones", href: "/admin/master-data/geography/areas" },
        ]}
      />
      
      <Suspense fallback={
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      }>
        <AreasContent authContext={ctx} />
      </Suspense>
    </div>
  );
}
