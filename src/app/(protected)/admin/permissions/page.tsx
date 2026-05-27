import { ERPPageHeader } from "@/components/erp/page-header";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { listPermissions, getAllRolePermissions } from "@/server/queries/permissions";
import { listRoles } from "@/server/queries/roles";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PermissionsMatrix } from "@/features/permissions/permissions-matrix";
import { Shield } from "lucide-react";

export default async function AdminPermissionsPage() {
  const ctx = await getAuthContext();

  if (!hasPermission(ctx, "permissions.view")) {
    return (
      <div className="flex flex-col gap-6">
        <ERPPageHeader
          title="Permissions"
          description="Permission and role matrix"
          breadcrumbs={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Admin" },
            { label: "Permissions" },
          ]}
        />
        <Card>
          <CardHeader>
            <CardTitle>Access denied</CardTitle>
            <CardDescription>You need the permissions.view permission.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const [permissions, roles, rolePermissions] = await Promise.all([
    listPermissions(),
    listRoles(),
    getAllRolePermissions(),
  ]);

  const canManage = hasPermission(ctx, "roles.manage");

  return (
    <div className="flex flex-col gap-6">
      <ERPPageHeader
        title="Permissions & Role Matrix"
        description="Manage role-permission assignments across the system"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Admin" },
          { label: "Permissions" },
        ]}
        actions={
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Shield className="h-3.5 w-3.5" />
            <span>{permissions.length} permissions</span>
          </div>
        }
      />

      <PermissionsMatrix
        permissions={permissions}
        roles={roles}
        rolePermissions={rolePermissions}
        canManage={canManage}
      />
    </div>
  );
}

