import { ERPPageHeader } from "@/components/erp/page-header";
import { ERPSectionCard } from "@/components/erp/section-card";
import { Button } from "@/components/ui/button";
import { RolesTable } from "@/features/roles/roles-table";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { listRoles } from "@/server/queries/roles";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Shield } from "lucide-react";

export default async function AdminRolesPage() {
  const ctx = await getAuthContext();

  if (!hasPermission(ctx, "roles.view")) {
    return (
      <div className="flex flex-col gap-6">
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

  return (
    <div className="flex flex-col gap-6">
      <ERPPageHeader
        title="Roles"
        description="System role definitions and permission assignments"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Admin" },
          { label: "Roles" },
        ]}
        actions={
          <Button size="sm" className="h-9 text-xs gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Add Role
          </Button>
        }
      />
      <ERPSectionCard
        title="Role Catalog"
        description="Define roles and their associated permissions"
        actions={
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Shield className="h-3.5 w-3.5" />
            <span>{roles.length} roles</span>
          </div>
        }
        noPadding
      >
        <RolesTable data={roles} />
      </ERPSectionCard>
    </div>
  );
}
