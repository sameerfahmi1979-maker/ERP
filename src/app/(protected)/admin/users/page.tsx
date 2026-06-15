import { ERPPageHeader } from "@/components/erp/page-header";
import { ERPSectionCard } from "@/components/erp/section-card";
import { UsersTable } from "@/features/users/users-table";
import { AddUserDialog } from "@/features/users/add-user-dialog";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { listUsers } from "@/server/queries/users";
import { listRoles } from "@/server/queries/roles";
import { listOrganizations } from "@/server/queries/organizations";
import { listBranches } from "@/server/queries/branches";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users as UsersIcon } from "lucide-react";

export default async function AdminUsersPage() {
  const ctx = await getAuthContext();

  if (!hasPermission(ctx, "users.view")) {
    return (
      <div className="flex flex-col gap-6">
        <ERPPageHeader
          title="Users"
          description="User directory and management"
          breadcrumbs={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Admin" },
            { label: "Users" },
          ]}
        />
        <Card>
          <CardHeader>
            <CardTitle>Access denied</CardTitle>
            <CardDescription>You need the users.view permission.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const [users, roles, organizations, branches] = await Promise.all([
    listUsers(),
    listRoles(),
    listOrganizations(),
    listBranches(),
  ]);

  const canManage = hasPermission(ctx, "users.manage");

  return (
    <div className="flex flex-col gap-6">
      <ERPPageHeader
        title="User Management"
        description="Manage user profiles and role assignments"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Admin" },
          { label: "Users" },
        ]}
        actions={canManage ? <AddUserDialog /> : null}
      />
      <ERPSectionCard
        title="All Users"
        description="User profiles and role assignments"
        actions={
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <UsersIcon className="h-3.5 w-3.5" />
            <span>{users.length} total</span>
          </div>
        }
        noPadding
      >
        <UsersTable
          data={users}
          roles={roles}
          companies={organizations}
          branches={branches}
          userProfileId={ctx.profile?.id || "default"}
          exportConfig={{
            title: "Users Report",
            subtitle: "User profiles and role assignments",
            filename: "users",
            generatedBy: ctx.profile?.full_name || ctx.profile?.display_name || "System User",
          }}
        />
      </ERPSectionCard>
    </div>
  );
}

