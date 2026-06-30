import { Suspense } from "react";
import { ERPPageHeader } from "@/components/erp/page-header";
import { ERPSectionCard } from "@/components/erp/section-card";
import { UsersTable } from "@/features/users/users-table";
import { AddUserDialog } from "@/features/users/add-user-dialog";
import { getAuthContext, hasPermission, canManageUsers } from "@/lib/rbac/check";
import { listUsersPaginated } from "@/server/queries/users";
import { listRoles } from "@/server/queries/roles";
import { listOrganizations } from "@/server/queries/organizations";
import { listBranches } from "@/server/queries/branches";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users as UsersIcon } from "lucide-react";

type SearchParams = Promise<{
  page?: string;
  pageSize?: string;
  q?: string;
  status?: string;
  company?: string;
  branch?: string;
  role?: string;
  mcp?: string;
  no_role?: string;
}>;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const n = parseInt(value ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const ctx = await getAuthContext();
  const sp = await searchParams;

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

  const page = parsePositiveInt(sp.page, 1);
  const pageSize = Math.min(100, parsePositiveInt(sp.pageSize, 25));
  const search = sp.q?.trim() ?? "";
  const status = sp.status ?? "";
  const companyId = sp.company ? parsePositiveInt(sp.company, 0) : undefined;
  const branchId = sp.branch ? parsePositiveInt(sp.branch, 0) : undefined;
  const roleId = sp.role ? parsePositiveInt(sp.role, 0) : undefined;
  const mustChangePassword = sp.mcp === "1" ? true : undefined;
  const noRoleFilter = sp.no_role === "1";

  const [usersResult, roles, organizations, branches] = await Promise.all([
    listUsersPaginated({
      page,
      pageSize,
      search: search || undefined,
      status: status || undefined,
      ownerCompanyId: companyId || undefined,
      branchId: branchId || undefined,
      roleId: roleId || undefined,
      mustChangePassword,
    }),
    listRoles(),
    listOrganizations(),
    listBranches(),
  ]);

  const canManage = canManageUsers(ctx);

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
        description="Server-side pagination, search, and filters"
        actions={
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <UsersIcon className="h-3.5 w-3.5" />
            <span>{usersResult.totalCount} total</span>
          </div>
        }
        noPadding
      >
        <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading users…</div>}>
          <UsersTable
            data={usersResult.rows}
            totalCount={usersResult.totalCount}
            page={usersResult.page}
            pageSize={usersResult.pageSize}
            search={search}
            statusFilter={status}
            companyFilter={sp.company ?? ""}
            branchFilter={sp.branch ?? ""}
            roleFilter={sp.role ?? ""}
            mcpFilter={sp.mcp ?? ""}
            noRoleFilter={noRoleFilter}
            roles={roles}
            companies={organizations}
            branches={branches}
            userProfileId={ctx.profile?.id || "default"}
            exportConfig={{
              title: "Users Report",
              subtitle: "User profiles and role assignments (current page)",
              filename: "users",
              generatedBy: ctx.profile?.full_name || ctx.profile?.display_name || "System User",
            }}
          />
        </Suspense>
      </ERPSectionCard>
    </div>
  );
}
