import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { LookupCategoryWorkspaceForm } from "@/features/master-data/lookups/components/lookup-category-workspace-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function LookupCategoryNewPage() {
  const authContext = await getAuthContext();
  if (!hasPermission(authContext, "master_data.lookups.view")) redirect("/dashboard");
  if (!hasPermission(authContext, "master_data.lookups.manage")) redirect("/admin/master-data/lookups/categories");

  return (
    <div className="h-full">
      <LookupCategoryWorkspaceForm mode="add" authContext={authContext} />
    </div>
  );
}
