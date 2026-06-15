import { redirect, notFound } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { getCostCenterById } from "@/features/master-data/finance-basics/actions";
import { CostCenterWorkspaceForm } from "@/features/master-data/finance-basics/components/cost-center-workspace-form";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Props { params: Promise<{ id: string }>; searchParams: Promise<{ mode?: string }>; }

export default async function CostCenterRecordPage({ params, searchParams }: Props) {
  const { id: idStr } = await params;
  const { mode: modeParam } = await searchParams;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) notFound();

  const authContext = await getAuthContext();
  if (!hasPermission(authContext, "master_data.finance_basics.view")) redirect("/dashboard");

  const result = await getCostCenterById(id);
  if (!result.success || !result.data) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
        <p className="text-lg font-medium">Cost center not found</p>
        <Link href="/admin/master-data/finance-basics/cost-centers" className="text-sm underline text-primary">Back to Cost Centers</Link>
      </div>
    );
  }

  const canEdit = hasPermission(authContext, "master_data.finance_basics.manage");
  const mode: "view" | "edit" = modeParam === "edit" && canEdit ? "edit" : "view";

  return (
    <div className="h-full">
      <CostCenterWorkspaceForm costCenter={result.data} mode={mode} authContext={authContext} />
    </div>
  );
}
