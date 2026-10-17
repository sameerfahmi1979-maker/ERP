import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/rbac/check";
import {lookupCapabilities} from '@/features/master-data/lookups/permissions';
import { listLookupCategories } from "@/server/actions/master-data/lookups";
import { LookupValueWorkspaceForm } from "@/features/master-data/lookups/components/lookup-value-workspace-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function LookupValueNewPage() {
  const authContext = await getAuthContext();
  if (!lookupCapabilities(authContext).read) redirect("/access-denied");
  if (!lookupCapabilities(authContext).manage) redirect("/admin/master-data/lookups/values");

  const categoriesResult = await listLookupCategories();
  if(!categoriesResult.success&&categoriesResult.kind==='forbidden')redirect('/access-denied');
  if(!categoriesResult.success||!categoriesResult.data)return <div role="alert" className="p-6">Lookup categories could not be loaded. Reload this page before editing; no fields were cleared.</div>;
  const categories = categoriesResult.data;

  return (
    <div className="h-full">
      <LookupValueWorkspaceForm mode="add" categories={categories} authContext={authContext} />
    </div>
  );
}
