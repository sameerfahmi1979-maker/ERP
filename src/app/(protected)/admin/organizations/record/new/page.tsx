import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { OrganizationWorkspaceForm } from "@/features/organizations/organization-workspace-form";

export default async function NewOrganizationPage() {
  const authContext = await getAuthContext();
  if (!hasPermission(authContext, "organizations.create")) {
    redirect("/admin/organizations");
  }
  return <OrganizationWorkspaceForm mode="add" authContext={authContext} />;
}
