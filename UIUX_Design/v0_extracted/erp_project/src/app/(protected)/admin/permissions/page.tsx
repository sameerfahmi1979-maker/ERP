import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { PermissionsTable } from "@/features/roles/permissions-table";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { listPermissions } from "@/server/queries/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AdminPermissionsPage() {
  const ctx = await getAuthContext();

  if (!hasPermission(ctx, "permissions.view")) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Access denied</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  const permissions = await listPermissions();

  return (
    <div className="flex flex-col gap-6">
      <PageBreadcrumb
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Admin" },
          { label: "Permissions" },
        ]}
      />
      <h1 className="text-2xl font-semibold tracking-tight">Permissions</h1>
      <Card>
        <CardHeader>
          <CardTitle>Permission catalog</CardTitle>
        </CardHeader>
        <CardContent>
          <PermissionsTable data={permissions} />
        </CardContent>
      </Card>
    </div>
  );
}
