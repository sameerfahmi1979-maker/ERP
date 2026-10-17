import { getAuthContext, hasPermission, hasPermissionInScope } from "@/lib/rbac/check";
import { redirect, notFound } from "next/navigation";
import { BranchWorkspaceForm } from "@/features/branches/branch-workspace-form";
import { getBranchById } from "@/server/actions/branches";
import { readBranchCompanyChoices } from "@/server/queries/branch-company-choices";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string }>;
};

export default async function BranchRecordPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { mode: modeParam } = await searchParams;
  const authContext = await getAuthContext();

  if (!hasPermission(authContext, "branches.view")) {
    redirect("/admin/branches");
  }

  const numericId = Number(id);
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(numericId)) notFound();

  const branchResult = await getBranchById(numericId);
  if (!branchResult.success) {
    if (branchResult.errorCode === "not_found" || branchResult.errorCode === "invalid") notFound();
    if (branchResult.errorCode === "denied") redirect("/admin/branches");
    throw new Error("The branch could not be loaded. Try again.");
  }
  if (!branchResult.data) throw new Error("The branch could not be loaded. Try again.");
  const companies = await readBranchCompanyChoices(numericId);
  const mode = modeParam === "edit" && hasPermissionInScope(authContext, "branches.manage", branchResult.data.owner_company_id, branchResult.data.id) ? "edit" : "view";

  return <BranchWorkspaceForm branch={branchResult.data} mode={mode} authContext={authContext} companies={companies} />;
}
