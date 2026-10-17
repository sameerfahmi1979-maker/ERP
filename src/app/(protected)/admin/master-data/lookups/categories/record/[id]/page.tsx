import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/rbac/check";
import {lookupCapabilities} from '@/features/master-data/lookups/permissions';
import { getLookupCategoryById } from "@/server/actions/master-data/lookups";
import { LookupCategoryWorkspaceForm } from "@/features/master-data/lookups/components/lookup-category-workspace-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string }>;
}

export default async function LookupCategoryRecordPage({ params, searchParams }: Props) {
  const { id: idStr } = await params;
  const { mode: modeParam } = await searchParams;
  const id = Number(idStr);
  if (!/^[1-9]\d*$/.test(idStr) || !Number.isSafeInteger(id)) notFound();

  const authContext = await getAuthContext();
  if (!lookupCapabilities(authContext).read) redirect("/access-denied");

  const result = await getLookupCategoryById(id);
  if (!result.success && result.kind === "forbidden") redirect("/access-denied");
  if (!result.success && result.kind === "not_found") notFound();
  if (!result.success || !result.data) {
    return (
      <div role="alert" className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
        <p className="text-lg font-medium">The lookup category could not be loaded. Return to the list and try again.</p>
        <Link href="/admin/master-data/lookups/categories" className="text-sm underline text-primary">
          Back to Categories
        </Link>
      </div>
    );
  }

  const canEdit = lookupCapabilities(authContext).manage && (!result.data.is_locked || lookupCapabilities(authContext).lock);
  const mode: "view" | "edit" = modeParam === "edit" && canEdit ? "edit" : "view";

  return (
    <div className="h-full">
      <LookupCategoryWorkspaceForm category={result.data} mode={mode} authContext={authContext} />
    </div>
  );
}
