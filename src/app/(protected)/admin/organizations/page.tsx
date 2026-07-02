import { ERPPageHeader } from "@/components/erp/page-header";
import { ERPStatCard } from "@/components/erp/stat-card";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { Building2, GitBranch, Users } from "lucide-react";
import { listOrganizations } from "@/server/queries/organizations";
import { OrganizationsTable } from "@/features/organizations/organizations-table";
import { AddOrganizationButton } from "@/features/organizations/add-organization-button";

export default async function AdminOrganizationsPage() {
  const ctx = await getAuthContext();

  if (!hasPermission(ctx, "organizations.view")) {
    return (
      <div className="p-6 space-y-4">
        <ERPPageHeader
          title="Organizations"
          description="Manage company entities and organizational structure"
          breadcrumbs={[
            { label: "Admin", href: "/admin" },
            { label: "Organizations" },
          ]}
        />
        <p className="text-sm text-muted-foreground">You need the organizations.view permission to access this page.</p>
      </div>
    );
  }

  const organizations = await listOrganizations();
  const canManage = hasPermission(ctx, "organizations.manage");
  const activeCount = organizations.filter((org) => org.status === "active").length;

  return (
    <div className="p-6 space-y-4">
      <ERPPageHeader
        title="Organizations"
        description="Manage company entities and organizational structure. Search, filter, and open organization records."
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Organizations" },
        ]}
        actions={canManage ? <AddOrganizationButton /> : null}
      />

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

      <OrganizationsTable
        data={organizations}
        userProfileId={ctx.profile?.id || "default"}
        exportConfig={{
          title: "Organizations",
          subtitle: "Owner company master data",
          filename: "organizations",
          generatedBy: ctx.profile?.full_name || ctx.profile?.display_name || "System User",
        }}
      />
    </div>
  );
}
