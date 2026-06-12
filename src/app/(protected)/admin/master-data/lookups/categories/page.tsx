import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { listLookupCategories } from "@/server/actions/master-data/lookups";
import { ERPPageHeader } from "@/components/erp/page-header";
import { CategoriesTable } from "@/features/master-data/lookups/components/categories-table";

export const metadata = {
  title: "Lookup Categories | Master Data | ERP",
  description: "Manage lookup categories for dropdowns",
};

async function CategoriesContent() {
  const result = await listLookupCategories();
  
  if (!result.success || !result.data) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Failed to load categories</p>
        <p className="text-sm text-destructive mt-2">{result.error}</p>
      </div>
    );
  }

  return <CategoriesTable categories={result.data} />;
}

export default async function LookupCategoriesPage() {
  const ctx = await getAuthContext();
  
  if (!hasPermission(ctx, "master_data.lookups.view")) {
    redirect("/dashboard");
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-6">
      <ERPPageHeader
        title="Lookup Categories"
        description="Manage lookup category definitions for dropdowns"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Master Data", href: "/admin/master-data" },
          { label: "Lookup Categories", href: "/admin/master-data/lookups/categories" },
        ]}
      />
      
      <Suspense fallback={
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      }>
        <CategoriesContent />
      </Suspense>
    </div>
  );
}
