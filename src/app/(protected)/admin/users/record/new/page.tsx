import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { listOrganizations } from "@/server/queries/organizations";
import { listBranches } from "@/server/queries/branches";
import { listRoles } from "@/server/queries/roles";
import { UserWorkspaceForm } from "@/features/users/user-workspace-form";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function NewUserRecordPage() {
  const authContext = await getAuthContext();

  if (!hasPermission(authContext, "users.manage")) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Access Denied</CardTitle>
          <CardDescription>You need the users.manage permission to create users.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const [companies, branches, roles] = await Promise.all([
    listOrganizations(),
    listBranches(),
    listRoles(),
  ]);

  return (
    <UserWorkspaceForm
      mode="add"
      authContext={authContext}
      companies={companies}
      branches={branches}
      roles={roles}
    />
  );
}
