import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/rbac/check";
import {lookupCapabilities} from '@/features/master-data/lookups/permissions';
import { LookupCategoryWorkspaceForm } from "@/features/master-data/lookups/components/lookup-category-workspace-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function LookupCategoryNewPage() {
  const authContext = await getAuthContext();
  if (!lookupCapabilities(authContext).read) redirect("/access-denied");
  if (!lookupCapabilities(authContext).manage) redirect("/admin/master-data/lookups/categories");

  return (
    <div className="h-full">
      <LookupCategoryWorkspaceForm mode="add" authContext={authContext} />
    </div>
  );
}
