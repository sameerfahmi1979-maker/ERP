import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { UomCategoryWorkspaceForm } from "@/features/master-data/uom/components/uom-category-workspace-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function UomCategoryNewPage() {
  const authContext = await getAuthContext();
  if (!hasPermission(authContext, "master_data.uom.view")) redirect("/dashboard");
  if (!hasPermission(authContext, "master_data.uom.manage")) redirect("/admin/master-data/uom/categories");
  return (
    <div className="h-full">
      <UomCategoryWorkspaceForm mode="add" authContext={authContext} />
    </div>
  );
}
