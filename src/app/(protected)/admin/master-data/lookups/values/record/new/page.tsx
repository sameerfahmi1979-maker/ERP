import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { listLookupCategories } from "@/server/actions/master-data/lookups";
import { LookupValueWorkspaceForm } from "@/features/master-data/lookups/components/lookup-value-workspace-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function LookupValueNewPage() {
  const authContext = await getAuthContext();
  if (!hasPermission(authContext, "master_data.lookups.view")) redirect("/access-denied");
  if (!hasPermission(authContext, "master_data.lookups.manage")) redirect("/admin/master-data/lookups/values");

  const categoriesResult = await listLookupCategories();
  const categories = categoriesResult.success ? (categoriesResult.data ?? []) : [];

  return (
    <div className="h-full">
      <LookupValueWorkspaceForm mode="add" categories={categories} authContext={authContext} />
    </div>
  );
}
