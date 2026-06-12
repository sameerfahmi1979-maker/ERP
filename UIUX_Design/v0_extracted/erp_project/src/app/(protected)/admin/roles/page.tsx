import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { RolesTable } from "@/features/roles/roles-table";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { listRoles } from "@/server/queries/roles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AdminRolesPage() {
  const ctx = await getAuthContext();

  if (!hasPermission(ctx, "roles.view")) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Access denied</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  const roles = await listRoles();

  return (
    <div className="flex flex-col gap-6">
      <PageBreadcrumb
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Admin" },
          { label: "Roles" },
        ]}
      />
      <h1 className="text-2xl font-semibold tracking-tight">Roles</h1>
      <Card>
        <CardHeader>
          <CardTitle>Role catalog</CardTitle>
        </CardHeader>
        <CardContent>
          <RolesTable data={roles} />
        </CardContent>
      </Card>
    </div>
  );
}
