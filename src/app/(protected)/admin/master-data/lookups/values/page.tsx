import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { listLookupValues, listLookupCategories } from "@/server/actions/master-data/lookups";
import { ERPPageHeader } from "@/components/erp/page-header";
import { ValuesTable } from "@/features/master-data/lookups/components/values-table";

export const metadata = {
  title: "Lookup Values | Master Data | ERP",
  description: "Manage lookup values for dropdowns",
};

async function ValuesContent() {
  const [valuesResult, categoriesResult] = await Promise.all([
    listLookupValues(),
    listLookupCategories(),
  ]);
  
  if (!valuesResult.success || !valuesResult.data) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Failed to load values</p>
        <p className="text-sm text-destructive mt-2">{valuesResult.error}</p>
      </div>
    );
  }

  if (!categoriesResult.success || !categoriesResult.data) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Failed to load categories</p>
        <p className="text-sm text-destructive mt-2">{categoriesResult.error}</p>
      </div>
    );
  }

  return <ValuesTable values={valuesResult.data} categories={categoriesResult.data} />;
}

export default async function LookupValuesPage() {
  const ctx = await getAuthContext();
  
  if (!hasPermission(ctx, "master_data.lookups.view")) {
    redirect("/access-denied");
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-6">
      <ERPPageHeader
        title="Lookup Values"
        description="Manage lookup values for category dropdowns"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Master Data", href: "/admin/master-data" },
          { label: "Lookup Values", href: "/admin/master-data/lookups/values" },
        ]}
      />
      
      <Suspense fallback={
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      }>
        <ValuesContent />
      </Suspense>
    </div>
  );
}
