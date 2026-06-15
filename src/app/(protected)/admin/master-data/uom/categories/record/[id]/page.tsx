import { redirect, notFound } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { getUomCategoryById } from "@/features/master-data/uom/actions";
import { UomCategoryWorkspaceForm } from "@/features/master-data/uom/components/uom-category-workspace-form";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Props { params: Promise<{ id: string }>; searchParams: Promise<{ mode?: string }>; }

export default async function UomCategoryRecordPage({ params, searchParams }: Props) {
  const { id: idStr } = await params;
  const { mode: modeParam } = await searchParams;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) notFound();

  const authContext = await getAuthContext();
  if (!hasPermission(authContext, "master_data.uom.view")) redirect("/dashboard");

  const result = await getUomCategoryById(id);
  if (!result.success || !result.data) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
        <p className="text-lg font-medium">UOM Category not found</p>
        <Link href="/admin/master-data/uom/categories" className="text-sm underline text-primary">Back to UOM Categories</Link>
      </div>
    );
  }

  const canEdit = hasPermission(authContext, "master_data.uom.manage");
  const mode: "view" | "edit" = modeParam === "edit" && canEdit ? "edit" : "view";

  return (
    <div className="h-full">
      <UomCategoryWorkspaceForm category={result.data} mode={mode} authContext={authContext} />
    </div>
  );
}
