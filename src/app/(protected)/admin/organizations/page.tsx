import { ERPPageHeader } from "@/components/erp/page-header";
import { LoadError } from "@/components/erp/load-error";
import { ERPStatCard } from "@/components/erp/stat-card";
import { getAuthContext, hasPermission, hasGlobalPermission } from "@/lib/rbac/check";
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

  const organizations = await listOrganizations().catch(() => null);
  if (!organizations) {
    return (
      <div className="p-6 space-y-4">
        <ERPPageHeader title="Organizations" description="Manage company entities and organizational structure" breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Organizations" }]} />
        <LoadError title="Organizations" retryHref="/admin/organizations" />
      </div>
    );
  }
  const canCreate = hasGlobalPermission(ctx, "organizations.manage");
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
        actions={canCreate ? <AddOrganizationButton /> : null}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <ERPStatCard
          title="Organizations in view"
          value={organizations.length.toString()}
          description={`${activeCount} active in your accessible list`}
          icon={Building2}
          iconColor="text-blue-600"
        />
        <ERPStatCard
          title="Total Branches"
          value="Not available"
          description="Branch totals are not loaded in this view"
          icon={GitBranch}
          iconColor="text-teal-600"
        />
        <ERPStatCard
          title="Total Employees"
          value="Not available"
          description="Employee totals are not loaded in this view"
          icon={Users}
          iconColor="text-purple-600"
        />
      </div>

      <OrganizationsTable
        data={organizations}
        authContext={ctx}
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
