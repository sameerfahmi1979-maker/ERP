import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/rbac/check";
import {lookupCapabilities} from '@/features/master-data/lookups/permissions';
import { getLookupValueById, listLookupCategories } from "@/server/actions/master-data/lookups";
import { LookupValueWorkspaceForm } from "@/features/master-data/lookups/components/lookup-value-workspace-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string }>;
}

export default async function LookupValueRecordPage({ params, searchParams }: Props) {
  const { id: idStr } = await params;
  const { mode: modeParam } = await searchParams;
  const id = Number(idStr);
  if (!/^[1-9]\d*$/.test(idStr) || !Number.isSafeInteger(id)) notFound();

  const authContext = await getAuthContext();
  if (!lookupCapabilities(authContext).read) redirect("/access-denied");

  const [valueResult, categoriesResult] = await Promise.all([
    getLookupValueById(id),
    listLookupCategories(),
  ]);
  if (!valueResult.success && valueResult.kind === "forbidden") redirect("/access-denied");
  if (!valueResult.success && valueResult.kind === "not_found") notFound();

  if (!valueResult.success || !valueResult.data) {
    return (
      <div role="alert" className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
        <p className="text-lg font-medium">The lookup value could not be loaded. Return to the list and try again.</p>
        <Link href="/admin/master-data/lookups/values" className="text-sm underline text-primary">
          Back to Values
        </Link>
      </div>
    );
  }

  if(!categoriesResult.success&&categoriesResult.kind==='forbidden')redirect('/access-denied');
  if(!categoriesResult.success||!categoriesResult.data)return <div role="alert" className="p-6">Lookup categories could not be loaded. Reload this page before editing; no fields were cleared.</div>;
  const categories = categoriesResult.data;
  const canEdit = lookupCapabilities(authContext).manage && ((!valueResult.data.is_locked && !categories.find(c=>c.id===valueResult.data!.category_id)?.is_locked) || lookupCapabilities(authContext).lock);
  const mode: "view" | "edit" = modeParam === "edit" && canEdit ? "edit" : "view";

  return (
    <div className="h-full">
      <LookupValueWorkspaceForm value={valueResult.data} categories={categories} mode={mode} authContext={authContext} />
    </div>
  );
}
