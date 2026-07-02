import { ERPPageHeader } from "@/components/erp/page-header";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { GitBranch } from "lucide-react";
import { listBranches } from "@/server/queries/branches";
import { listOrganizations } from "@/server/queries/organizations";
import { BranchesTable } from "@/features/branches/branches-table";
import { AddBranchButton } from "@/features/branches/add-branch-button";

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

  const branches = await listBranches();
  const organizations = await listOrganizations();
  const canManage = hasPermission(ctx, "branches.manage");

  return (
    <div className="p-6 space-y-4">
      <ERPPageHeader
        title="Branches"
        description="Manage organizational branches and locations. Search, filter, and open branch records."
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Branches" },
        ]}
        actions={canManage ? <AddBranchButton companies={organizations} /> : null}
      />
      <BranchesTable
        data={branches}
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
