import { ERPPageHeader } from "@/components/erp/page-header";
import { LoadError } from "@/components/erp/load-error";
import { AddBranchButton } from "@/features/branches/add-branch-button";
import { BranchesTable } from "@/features/branches/branches-table";
import { getAuthContext, hasPermission, hasPermissionInScope } from "@/lib/rbac/check";
import { listBranches } from "@/server/queries/branches";
import { readBranchCompanyChoices } from "@/server/queries/branch-company-choices";

export default async function AdminBranchesPage() {
  const ctx = await getAuthContext();

  if (!hasPermission(ctx, "branches.view")) {
    return (
      <div className="p-6 space-y-4">
        <ERPPageHeader
          title="Branches"
          description="Manage organizational branches and locations"
          breadcrumbs={[
            { label: "Admin", href: "/admin" },
            { label: "Branches" },
          ]}
        />
        <p className="text-sm text-muted-foreground">You need the branches.view permission to access this page.</p>
      </div>
    );
  }

  const branches = await listBranches().catch(() => null);
  if (!branches) {
    return (
      <div className="p-6 space-y-4">
        <ERPPageHeader title="Branches" description="Manage organizational branches and locations" breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Branches" }]} />
        <LoadError title="Branches" retryHref="/admin/branches" />
      </div>
    );
  }
  const companies = await readBranchCompanyChoices().catch(() => null);
  if (!companies) {
    return (
      <div className="p-6 space-y-4">
        <ERPPageHeader title="Branches" description="Manage organizational branches and locations" breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Branches" }]} />
        <LoadError title="Branch company choices" retryHref="/admin/branches" />
      </div>
    );
  }
  const writableCompanies = companies.filter(company => hasPermissionInScope(ctx, "branches.manage", company.id));

  return (
    <div className="p-6 space-y-4">
      <ERPPageHeader
        title="Branches"
        description="Manage organizational branches and locations. Search, filter, and open branch records."
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Branches" },
        ]}
        actions={writableCompanies.length > 0 ? <AddBranchButton companies={writableCompanies} /> : null}
      />
      <BranchesTable
        data={branches}
        authContext={ctx}
        userProfileId={ctx.profile?.id || "default"}
        exportConfig={{
          title: "Branches",
          subtitle: "Branch locations across organizations",
          filename: "branches",
          generatedBy: ctx.profile?.full_name || ctx.profile?.display_name || "System User",
        }}
      />
    </div>
  );
}
