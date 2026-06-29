import { notFound } from "next/navigation";
import { getAuthContext, hasPermission, canManageUsers } from "@/lib/rbac/check";
import { getUserById } from "@/server/queries/users";
import { listOrganizations } from "@/server/queries/organizations";
import { listBranches } from "@/server/queries/branches";
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

  const [user, companies, branches, roles] = await Promise.all([
    getUserById(userId),
    listOrganizations(),
    listBranches(),
    listRoles(),
  ]);

  if (!user) notFound();

  const canManage = canManageUsers(authContext);
  const mode = modeParam === "edit" && canManage ? "edit" : "view";

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
