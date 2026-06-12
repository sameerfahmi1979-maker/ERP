import { ERPPageHeader } from "@/components/erp/page-header";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { listPermissions, getAllRolePermissions } from "@/server/queries/permissions";
import { listRoles } from "@/server/queries/roles";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PermissionsMatrix } from "@/features/permissions/permissions-matrix";
import { Shield } from "lucide-react";
import { ERPExportMenu } from "@/components/erp/export/erp-export-menu";
import type { ERPExportColumn } from "@/lib/export";
import type { Permission } from "@/types/database";

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

  // Prepare export-friendly data
  const exportData = permissions.map(perm => ({
    ...perm,
    is_visible_text: perm.is_visible ? "Yes" : "No",
    is_system_permission_text: perm.is_system_permission ? "Yes" : "No",
  }));

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
          <div className="flex items-center gap-2">
            <ERPExportMenu
              title="Permissions Report"
              subtitle="System permissions catalog"
              filename="permissions"
              data={exportData}
              columns={[
                { key: "id", header: "ID", width: 10 },
                { key: "permission_code", header: "Permission Code", width: 25 },
                { key: "permission_name", header: "Permission Name", width: 30 },
                { key: "display_name", header: "Display Name", width: 30 },
                { key: "module_code", header: "Module Code", width: 18 },
                { key: "action_code", header: "Action Code", width: 15 },
                { key: "description", header: "Description", width: 35 },
                { key: "is_visible_text", header: "Visible", width: 10 },
                { key: "is_system_permission_text", header: "System Permission", width: 15 },
                { key: "sort_order", header: "Sort Order", width: 12 },
              ]}
              generatedBy={ctx.profile?.full_name || ctx.profile?.display_name || "System User"}
              size="sm"
            />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Shield className="h-3.5 w-3.5" />
              <span>{permissions.length} permissions</span>
            </div>
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

