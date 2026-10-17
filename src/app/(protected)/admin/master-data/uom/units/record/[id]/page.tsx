import { redirect, notFound } from "next/navigation";
import { getAuthContext, hasPermission, hasGlobalPermission } from "@/lib/rbac/check";
import { getUnitOfMeasureById } from "@/features/master-data/uom/actions";
import { UnitWorkspaceForm } from "@/features/master-data/uom/components/unit-workspace-form";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Props { params: Promise<{ id: string }>; searchParams: Promise<{ mode?: string }>; }

export default async function UomUnitRecordPage({ params, searchParams }: Props) {
  const { id: idStr } = await params;
  const { mode: modeParam } = await searchParams;
  const id = Number(idStr);
  if (!/^[1-9]\d*$/.test(idStr) || !Number.isSafeInteger(id)) notFound();

  const authContext = await getAuthContext();
  if (!hasPermission(authContext, "master_data.uom.view") && !hasGlobalPermission(authContext, "master_data.uom.manage")) redirect("/dashboard");

  const result = await getUnitOfMeasureById(id);
  if (!result.success || !result.data) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
        <p className="text-lg font-medium">{result.error ?? "Record not found or unavailable."}</p>
        <Link href="/admin/master-data/uom/units" className="text-sm underline text-primary">Back to Units</Link>
      </div>
    );
  }

  const canEdit = hasGlobalPermission(authContext, "master_data.uom.manage");
  const mode: "view" | "edit" = modeParam === "edit" && canEdit ? "edit" : "view";

  return (
    <div className="h-full">
      <UnitWorkspaceForm unit={result.data} mode={mode} authContext={authContext} />
    </div>
  );
}
