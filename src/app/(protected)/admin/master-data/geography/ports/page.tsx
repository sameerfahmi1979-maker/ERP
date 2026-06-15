import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthContext, hasPermission, type AuthContext } from "@/lib/rbac/check";
import { getPorts } from "@/features/master-data/geography/actions";
import { ERPPageHeader } from "@/components/erp/page-header";
import { PortsTable } from "@/features/master-data/geography/components/ports-table";

export const metadata = {
  title: "Ports | Geography & Locations | Master Data | ERP",
  description: "Manage port master data including airports, seaports, and border crossings",
};

async function PortsContent({ authContext }: { authContext: AuthContext }) {
  const result = await getPorts();
  
  if (!result.success || !result.data) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Failed to load ports</p>
        <p className="text-sm text-destructive mt-2">{result.error}</p>
      </div>
    );
  }

  return <PortsTable ports={result.data} authContext={authContext} />;
}

export default async function PortsPage() {
  const ctx = await getAuthContext();
  
  if (!hasPermission(ctx, "master_data.geography.view")) {
    redirect("/dashboard");
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-6">
      <ERPPageHeader
        title="Ports"
        description="Manage port master data including airports, seaports, and border crossings"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Master Data", href: "/admin/master-data" },
          { label: "Geography & Locations", href: "/admin/master-data/geography/countries" },
          { label: "Ports", href: "/admin/master-data/geography/ports" },
        ]}
      />
      
      <Suspense fallback={
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      }>
        <PortsContent authContext={ctx} />
      </Suspense>
    </div>
  );
}

