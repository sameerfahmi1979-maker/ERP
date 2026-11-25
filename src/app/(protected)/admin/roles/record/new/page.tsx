import { getAuthContext, hasGlobalPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { RoleWorkspaceForm } from "@/features/roles/role-workspace-form";

export default async function NewRolePage() {
  const authContext = await getAuthContext();
  if (!hasGlobalPermission(authContext, "roles.manage")) {
    redirect("/admin/roles");
  }
  return <RoleWorkspaceForm mode="add" authContext={authContext} />;
}
