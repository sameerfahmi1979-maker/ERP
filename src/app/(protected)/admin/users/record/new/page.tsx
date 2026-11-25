import { LoadError } from "@/components/erp/load-error";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { listUserScopeOptions } from "@/server/queries/user-scope-options";
import { listRoles } from "@/server/queries/roles";
import { UserWorkspaceForm } from "@/features/users/user-workspace-form";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function NewUserRecordPage() {
  const authContext = await getAuthContext();

  if (!hasPermission(authContext, "users.create")) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Access Denied</CardTitle>
          <CardDescription>You need the users.create permission to create users.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const [scopeOptions, roles] = await Promise.all([
    listUserScopeOptions().catch(() => null),
    listRoles().catch(() => null),
  ]);
  if (!scopeOptions || !roles) return <LoadError title="New user role and scope choices" retryHref="/admin/users/record/new" />;
  const { companies, branches } = scopeOptions;

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
