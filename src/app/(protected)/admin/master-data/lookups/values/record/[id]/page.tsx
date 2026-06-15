import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
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
  const id = parseInt(idStr, 10);
  if (isNaN(id)) notFound();

  const authContext = await getAuthContext();
  if (!hasPermission(authContext, "master_data.lookups.view")) redirect("/dashboard");

  const [valueResult, categoriesResult] = await Promise.all([
    getLookupValueById(id),
    listLookupCategories(),
  ]);

  if (!valueResult.success || !valueResult.data) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
        <p className="text-lg font-medium">Lookup value not found</p>
        <Link href="/admin/master-data/lookups/values" className="text-sm underline text-primary">
          Back to Values
        </Link>
      </div>
    );
  }

  const categories = categoriesResult.success ? (categoriesResult.data ?? []) : [];
  const canEdit = hasPermission(authContext, "master_data.lookups.manage");
  const mode: "view" | "edit" = modeParam === "edit" && canEdit ? "edit" : "view";

  return (
    <div className="h-full">
      <LookupValueWorkspaceForm value={valueResult.data} categories={categories} mode={mode} authContext={authContext} />
    </div>
  );
}
