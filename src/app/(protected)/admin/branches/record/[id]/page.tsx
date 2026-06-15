import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect, notFound } from "next/navigation";
import { BranchWorkspaceForm } from "@/features/branches/branch-workspace-form";
import { getBranchById } from "@/server/actions/branches";
import { listOrganizations } from "@/server/queries/organizations";

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

  const numericId = parseInt(id);
  if (isNaN(numericId)) notFound();

  const [branchResult, companies] = await Promise.all([
    getBranchById(numericId),
    listOrganizations(),
  ]);

  if (!branchResult.success || !branchResult.data) notFound();
  const mode = modeParam === "edit" && hasPermission(authContext, "branches.edit") ? "edit" : "view";

  return <BranchWorkspaceForm branch={branchResult.data} mode={mode} authContext={authContext} companies={companies} />;
}
