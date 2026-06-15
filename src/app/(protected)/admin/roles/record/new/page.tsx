import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { RoleWorkspaceForm } from "@/features/roles/role-workspace-form";

export default async function NewRolePage() {
  const authContext = await getAuthContext();
  if (!hasPermission(authContext, "roles.create")) {
    redirect("/admin/roles");
  }
  return <RoleWorkspaceForm mode="add" authContext={authContext} />;
}
