import { LoadError } from "@/components/erp/load-error";
import { notFound } from "next/navigation";
import { getAuthContext, hasPermission, canManageUsers } from "@/lib/rbac/check";
import { getUserById } from "@/server/queries/users";
import { listUserScopeOptions } from "@/server/queries/user-scope-options";
import { listRoles } from "@/server/queries/roles";
import { UserWorkspaceForm } from "@/features/users/user-workspace-form";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ mode?: string }> };

export default async function UserRecordPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { mode: modeParam } = await searchParams;

  const authContext = await getAuthContext();

  if (!hasPermission(authContext, "users.view")) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Access Denied</CardTitle>
          <CardDescription>You need the users.view permission.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const userId = parseInt(id, 10);
  if (isNaN(userId)) notFound();

  const canManage = canManageUsers(authContext);
  const mode = modeParam === "edit" && canManage ? "edit" : "view";
  const retryHref = `/admin/users/record/${userId}${mode === "edit" ? "?mode=edit" : ""}`;
  const [user, scopeOptions, roles] = await Promise.all([
    getUserById(userId).catch(() => undefined),
    listUserScopeOptions().catch(() => null),
    listRoles().catch(() => null),
  ]);

  if (user === undefined) return <LoadError title="User profile and role assignments" retryHref={retryHref} />;
  if (!user) notFound();
  if (!scopeOptions || !roles) return <LoadError title="User role and scope choices" retryHref={retryHref} />;

  const { companies, branches } = scopeOptions;

  return (
    <UserWorkspaceForm
      user={user}
      mode={mode}
      authContext={authContext}
      companies={companies}
      branches={branches}
      roles={roles}
    />
  );
}
