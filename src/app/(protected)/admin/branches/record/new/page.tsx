import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { BranchWorkspaceForm } from "@/features/branches/branch-workspace-form";
import { listOrganizations } from "@/server/queries/organizations";

export default async function NewBranchPage() {
  const authContext = await getAuthContext();
  if (!hasPermission(authContext, "branches.create")) {
    redirect("/admin/branches");
  }
  const companies = await listOrganizations();
  return <BranchWorkspaceForm mode="add" authContext={authContext} companies={companies} />;
}
