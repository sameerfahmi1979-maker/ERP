import { ERPPageHeader } from "@/components/erp/page-header";
import { ERPSectionCard } from "@/components/erp/section-card";
import { Button } from "@/components/ui/button";
import { UsersTable } from "@/features/users/users-table";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { listUsers } from "@/server/queries/users";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Users as UsersIcon } from "lucide-react";

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

  const users = await listUsers();

  return (
    <div className="flex flex-col gap-6">
      <ERPPageHeader
        title="User Management"
        description="ERP user profiles with numeric IDs. Auth email is shown only for the signed-in user until admin service queries are added."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Admin" },
          { label: "Users" },
        ]}
        actions={
          <Button size="sm" className="h-9 text-xs gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Add User
          </Button>
        }
      />
      <ERPSectionCard
        title="User Directory"
        description="Search, filter, and role assignment foundations"
        actions={
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <UsersIcon className="h-3.5 w-3.5" />
            <span>{users.length} total</span>
          </div>
        }
        noPadding
      >
        <UsersTable data={users} />
      </ERPSectionCard>
    </div>
  );
}
