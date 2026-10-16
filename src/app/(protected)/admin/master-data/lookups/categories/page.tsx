import {randomUUID} from 'node:crypto';
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/rbac/check";
import {lookupCapabilities} from '@/features/master-data/lookups/permissions';
import { listLookupCategories } from "@/server/actions/master-data/lookups";
import { ERPPageHeader } from "@/components/erp/page-header";
import { CategoriesTable } from "@/features/master-data/lookups/components/categories-table";

export const metadata = {
  title: "Lookup Categories | Master Data | ERP",
  description: "Manage lookup categories for dropdowns",
};

async function CategoriesContent({canManage,canLock}:{canManage:boolean;canLock:boolean}) {
  const result = await listLookupCategories();
  if (!result.success && result.kind === "forbidden") return <div role="alert" className="p-6">Access denied. Global lookup catalogue access is required.</div>;
  
  if (!result.success || !result.data) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Failed to load categories</p>
        <p className="text-sm text-destructive mt-2">{result.error}</p>
      </div>
    );
  }

  return <CategoriesTable categories={result.data} canManage={canManage} canLock={canLock} readGeneration={randomUUID()} />;
}

export default async function LookupCategoriesPage() {
  const ctx = await getAuthContext();
  
  if (!lookupCapabilities(ctx).read) {
    redirect("/access-denied");
  }

  return (
    <div className="p-6 space-y-4">
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
        <CategoriesContent canManage={lookupCapabilities(ctx).manage} canLock={lookupCapabilities(ctx).lock} />
      </Suspense>
    </div>
  );
}
