import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { UsersTable } from "@/features/users/users-table";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { listUsers } from "@/server/queries/users";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AdminUsersPage() {
  const ctx = await getAuthContext();

  if (!hasPermission(ctx, "users.view")) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Access denied</CardTitle>
          <CardDescription>You need the users.view permission.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const users = await listUsers();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <PageBreadcrumb
          items={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Admin" },
            { label: "Users" },
          ]}
        />
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-muted-foreground">
          ERP user profiles with numeric IDs. Auth email is shown only for the signed-in user until admin service queries are added.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>User directory</CardTitle>
          <CardDescription>Search, filter, and role assignment foundations.</CardDescription>
        </CardHeader>
        <CardContent>
          <UsersTable data={users} />
        </CardContent>
      </Card>
    </div>
  );
}
