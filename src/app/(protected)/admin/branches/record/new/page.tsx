import { getAuthContext, hasPermissionInScope } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { BranchWorkspaceForm } from "@/features/branches/branch-workspace-form";
import { readBranchCompanyChoices } from "@/server/queries/branch-company-choices";

export default async function NewBranchPage() {
  const authContext = await getAuthContext();
  const companies = (await readBranchCompanyChoices()).filter(company => hasPermissionInScope(authContext, "branches.manage", company.id));
  if (companies.length === 0) {
    redirect("/admin/branches");
  }
  return <BranchWorkspaceForm mode="add" authContext={authContext} companies={companies} />;
}
