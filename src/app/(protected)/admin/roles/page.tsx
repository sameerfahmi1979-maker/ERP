import { ERPPageHeader } from "@/components/erp/page-header";
import { RolesTable } from "@/features/roles/roles-table";
import { AddRoleButton } from "@/features/roles/add-role-button";
import { getAuthContext, hasPermission, isGlobalAdmin } from "@/lib/rbac/check";
import { listRoles } from "@/server/queries/roles";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AdminRolesPage() {
  const ctx = await getAuthContext();

  if (!hasPermission(ctx, "roles.view")) {
    return (
      <div className="p-6 space-y-4">
        <ERPPageHeader
          title="Roles"
          description="Role and permission management"
          breadcrumbs={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Admin" },
            { label: "Roles" },
          ]}
        />
        <Card>
          <CardHeader>
            <CardTitle>Access denied</CardTitle>
            <CardDescription>You need the roles.view permission.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const roles = await listRoles();
  const canManage = hasPermission(ctx, "roles.manage");
  const isAdmin = isGlobalAdmin(ctx);

  return (
    <div className="p-6 space-y-4">
      <ERPPageHeader
        title="Roles"
        description="System role definitions and permission assignments"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Admin" },
          { label: "Roles" },
        ]}
        actions={canManage ? <AddRoleButton /> : null}
      />
      <RolesTable 
        data={roles}
        canManage={canManage}
        isGlobalAdmin={isAdmin}
        userProfileId={ctx.profile?.id || "default"}
        exportConfig={{
          title: "Roles Report",
          subtitle: "System role definitions and permission assignments",
          filename: "roles",
          generatedBy: ctx.profile?.full_name || ctx.profile?.display_name || "System User",
        }}
      />
    </div>
  );
}
