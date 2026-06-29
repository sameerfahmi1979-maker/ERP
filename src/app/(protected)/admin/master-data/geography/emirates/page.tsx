import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthContext, hasPermission, type AuthContext } from "@/lib/rbac/check";
import { getEmirates } from "@/features/master-data/geography/actions";
import { ERPPageHeader } from "@/components/erp/page-header";
import { EmiratesTable } from "@/features/master-data/geography/components/emirates-table";

export const metadata = {
  title: "Regions / Emirates | Geography & Locations | Master Data | ERP",
  description: "Manage country administrative regions such as UAE Emirates, Jordan Governorates, US States, Saudi Regions, and Provinces",
};

async function EmiratesContent({ authContext }: { authContext: AuthContext }) {
  const result = await getEmirates();
  
  if (!result.success || !result.data) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Failed to load emirates</p>
        <p className="text-sm text-destructive mt-2">{result.error}</p>
      </div>
    );
  }

  return <EmiratesTable emirates={result.data} authContext={authContext} />;
}

export default async function EmiratesPage() {
  const ctx = await getAuthContext();
  
  if (!hasPermission(ctx, "master_data.geography.view")) {
    redirect("/access-denied");
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-6">
      <ERPPageHeader
        title="Regions / Emirates"
        description="Manage country administrative regions such as UAE Emirates, Jordan Governorates, US States, Saudi Regions, and Provinces"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Master Data", href: "/admin/master-data" },
          { label: "Geography & Locations", href: "/admin/master-data/geography/countries" },
          { label: "Regions / Emirates", href: "/admin/master-data/geography/emirates" },
        ]}
      />
      
      <Suspense fallback={
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      }>
        <EmiratesContent authContext={ctx} />
      </Suspense>
    </div>
  );
}

