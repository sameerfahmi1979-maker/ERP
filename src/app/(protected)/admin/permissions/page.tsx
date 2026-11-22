import { ERPExportMenu } from "@/components/erp/export/erp-export-menu";
import { LoadError } from "@/components/erp/load-error";
import { ERPPageHeader } from "@/components/erp/page-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PermissionCommandCenter } from "@/features/permissions/permission-command-center";
import { traceRequest } from "@/lib/performance/request";
import { traceSpan } from "@/lib/performance/trace";
import { hasPermission } from "@/lib/rbac/check";
import { getAllRolePermissions, listPermissions } from "@/server/queries/permissions";
import { listRoles } from "@/server/queries/roles";
import { getRenderAuthContext } from "@/server/reads/render-auth-context";
import { Shield } from "lucide-react";

export default function AdminPermissionsPage() {
  return traceRequest("permissions.page", renderPermissionsPage);
}

async function renderPermissionsPage() {
  const ctx = await getRenderAuthContext();

  if (!hasPermission(ctx, "permissions.view")) {
    return (
      <div className="p-6 space-y-4">
        <ERPPageHeader
          title="Role Permission Center"
          description="Search permissions on the left, then assign and review roles on the right."
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
    traceSpan("permissions.list", () => listPermissions(ctx)),
    traceSpan("permissions.roles", () => listRoles(ctx)).catch(() => null),
    traceSpan("permissions.grants", () => getAllRolePermissions(ctx)),
  ]);

  if (!permissions || !roles || !rolePermissions) {
    return <LoadError title="Role permissions" retryHref="/admin/permissions" />;
  }

  const canManage = hasPermission(ctx, "roles.manage");

  const exportData = await traceSpan("permissions.export", async () => permissions.map(perm => ({
    ...perm,
    is_visible_text: perm.is_visible ? "Yes" : "No",
    is_system_permission_text: perm.is_system_permission ? "Yes" : "No",
  })));

  return (
    <div className="p-6 space-y-4">
      <ERPPageHeader
        title="Role Permission Center"
        description="Search permissions on the left, then assign and review roles on the right."
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

      <PermissionCommandCenter
        permissions={permissions}
        roles={roles}
        rolePermissions={rolePermissions}
        canManage={canManage}
      />
    </div>
  );
}
