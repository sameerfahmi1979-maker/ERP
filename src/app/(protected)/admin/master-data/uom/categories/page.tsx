import { getAuthContext, hasPermission, type AuthContext } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { getUomCategories } from "@/features/master-data/uom/actions";
import { UomCategoriesTable } from "@/features/master-data/uom/components/uom-categories-table";
import { ERPPageHeader } from "@/components/erp/page-header";

export const metadata = {
  title: "UOM Categories | Master Data",
  description: "Manage units of measure categories",
};

async function CategoriesContent() {
  const authContext = await getAuthContext();
  const result = await getUomCategories();

  if (!result.success) {
    return (
      <div className="flex items-center justify-center h-[200px]">
        <p className="text-destructive">Error loading categories: {result.error}</p>
      </div>
    );
  }

  return <UomCategoriesTable categories={result.data || []} authContext={authContext} />;
}

export default async function UomCategoriesPage() {
  const ctx = await getAuthContext();

  if (!hasPermission(ctx, "master_data.uom.view")) {
    redirect("/dashboard");
  }

  const breadcrumbs = [
    { label: "Master Data", href: "/admin/master-data" },
    { label: "Units & Measurements", href: "/admin/master-data/uom/categories" },
    { label: "UOM Categories" },
  ];

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <ERPPageHeader
        title="UOM Categories"
        description="Manage units of measure categories (WEIGHT, LENGTH, VOLUME, etc.)"
        breadcrumbs={breadcrumbs}
      />
      <CategoriesContent />
    </div>
  );
}
