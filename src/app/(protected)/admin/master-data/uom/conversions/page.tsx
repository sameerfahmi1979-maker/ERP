import { getAuthContext, hasPermission, type AuthContext } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { getUomConversions } from "@/features/master-data/uom/actions";
import { ConversionsTable } from "@/features/master-data/uom/components/conversions-table";
import { ERPPageHeader } from "@/components/erp/page-header";

export const metadata = {
  title: "UOM Conversions | Master Data",
  description: "Manage special unit conversions",
};

async function ConversionsContent() {
  const authContext = await getAuthContext();
  const result = await getUomConversions();

  if (!result.success) {
    return (
      <div className="flex items-center justify-center h-[200px]">
        <p className="text-destructive">Error loading conversions: {result.error}</p>
      </div>
    );
  }

  return <ConversionsTable conversions={result.data || []} authContext={authContext} />;
}

export default async function UomConversionsPage() {
  const ctx = await getAuthContext();

  if (!hasPermission(ctx, "master_data.uom.view")) {
    redirect("/dashboard");
  }

  const breadcrumbs = [
    { label: "Master Data", href: "/admin/master-data" },
    { label: "Units & Measurements", href: "/admin/master-data/uom/categories" },
    { label: "UOM Conversions" },
  ];

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <ERPPageHeader
        title="UOM Conversions"
        description="Manage special, cross-category, or custom unit conversions"
        breadcrumbs={breadcrumbs}
      />
      <ConversionsContent />
    </div>
  );
}
