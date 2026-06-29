import { getAuthContext, hasPermission, type AuthContext } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { getUnitsOfMeasure } from "@/features/master-data/uom/actions";
import { UnitsTable } from "@/features/master-data/uom/components/units-table";
import { ERPPageHeader } from "@/components/erp/page-header";

export const metadata = {
  title: "Units of Measure | Master Data",
  description: "Manage units of measure",
};

async function UnitsContent() {
  const authContext = await getAuthContext();
  const result = await getUnitsOfMeasure();

  if (!result.success) {
    return (
      <div className="flex items-center justify-center h-[200px]">
        <p className="text-destructive">Error loading units: {result.error}</p>
      </div>
    );
  }

  return <UnitsTable units={result.data || []} authContext={authContext} />;
}

export default async function UnitsOfMeasurePage() {
  const ctx = await getAuthContext();

  if (!hasPermission(ctx, "master_data.uom.view")) {
    redirect("/access-denied");
  }

  const breadcrumbs = [
    { label: "Master Data", href: "/admin/master-data" },
    { label: "Units & Measurements", href: "/admin/master-data/uom/categories" },
    { label: "Units of Measure" },
  ];

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <ERPPageHeader
        title="Units of Measure"
        description="Manage individual units within categories (KG, L, M, etc.)"
        breadcrumbs={breadcrumbs}
      />
      <UnitsContent />
    </div>
  );
}
