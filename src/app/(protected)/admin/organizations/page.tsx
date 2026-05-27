import { ERPPageHeader } from "@/components/erp/page-header";
import { ERPSectionCard } from "@/components/erp/section-card";
import { ERPStatCard } from "@/components/erp/stat-card";
import { ERPEmptyState } from "@/components/erp/empty-state";
import { Button } from "@/components/ui/button";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Building2, GitBranch, Users } from "lucide-react";
import { listOrganizations } from "@/server/queries/organizations";
import { OrganizationsTable } from "@/features/organizations/organizations-table";
import { AddOrganizationButton } from "@/features/organizations/add-organization-button";

export default async function AdminOrganizationsPage() {
  const ctx = await getAuthContext();

  if (!hasPermission(ctx, "organizations.view")) {
    return (
      <div className="flex flex-col gap-6">
        <ERPPageHeader
          title="Organizations"
          description="Owner company management"
          breadcrumbs={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Admin" },
            { label: "Organizations" },
          ]}
        />
        <Card>
          <CardHeader>
            <CardTitle>Access denied</CardTitle>
            <CardDescription>You need the organizations.view permission.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const organizations = await listOrganizations();
  const canManage = hasPermission(ctx, "organizations.manage");

  // Calculate stats
  const activeCount = organizations.filter((org) => org.status === "active").length;

  return (
    <div className="flex flex-col gap-6">
      <ERPPageHeader
        title="Organizations"
        description="Manage company entities and organizational structure"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Administration" },
          { label: "Organizations" },
        ]}
        actions={
          canManage ? (
            <AddOrganizationButton />
          ) : null
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <ERPStatCard
          title="Total Organizations"
          value={organizations.length.toString()}
          description={`${activeCount} active`}
          icon={Building2}
          iconColor="text-blue-600"
        />
        <ERPStatCard
          title="Total Branches"
          value="0"
          description="Across all organizations"
          icon={GitBranch}
          iconColor="text-teal-600"
        />
        <ERPStatCard
          title="Total Employees"
          value="0"
          description="Active headcount"
          icon={Users}
          iconColor="text-purple-600"
        />
      </div>

      {/* Organizations Table */}
      <ERPSectionCard
        title="All Organizations"
        description="Complete list of owner companies"
        actions={
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Building2 className="h-3.5 w-3.5" />
            <span>{organizations.length} total</span>
          </div>
        }
        noPadding
      >
        {organizations.length > 0 ? (
          <OrganizationsTable data={organizations} />
        ) : (
          <ERPEmptyState
            icon={Building2}
            title="No organizations yet"
            description="Create your first owner company to get started. Use the Add Organization button above."
          />
        )}
      </ERPSectionCard>
    </div>
  );
}
