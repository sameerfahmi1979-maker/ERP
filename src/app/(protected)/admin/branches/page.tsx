import { ERPPageHeader } from "@/components/erp/page-header";
import { ERPSectionCard } from "@/components/erp/section-card";
import { ERPEmptyState } from "@/components/erp/empty-state";
import { Button } from "@/components/ui/button";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, GitBranch } from "lucide-react";
import { listBranches } from "@/server/queries/branches";
import { listOrganizations } from "@/server/queries/organizations";
import { BranchesTable } from "@/features/branches/branches-table";
import { AddBranchButton } from "@/features/branches/add-branch-button";

export default async function AdminBranchesPage() {
  const ctx = await getAuthContext();

  if (!hasPermission(ctx, "branches.view")) {
    return (
      <div className="flex flex-col gap-6">
        <ERPPageHeader
          title="Branches"
          description="Branch location management"
          breadcrumbs={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Administration" },
            { label: "Branches" },
          ]}
        />
        <Card>
          <CardHeader>
            <CardTitle>Access denied</CardTitle>
            <CardDescription>You need the branches.view permission.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const branches = await listBranches();
  const organizations = await listOrganizations();
  const canManage = hasPermission(ctx, "branches.manage");

  return (
    <div className="flex flex-col gap-6">
      <ERPPageHeader
        title="Branches"
        description="Manage organizational branches and locations"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Administration" },
          { label: "Branches" },
        ]}
        actions={
          canManage ? (
            <AddBranchButton companies={organizations} />
          ) : null
        }
      />
      <ERPSectionCard
        title="Branch Locations"
        description="All branch locations across organizations"
        actions={
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <GitBranch className="h-3.5 w-3.5" />
            <span>{branches.length} total</span>
          </div>
        }
        noPadding
      >
        {branches.length > 0 ? (
          <BranchesTable 
            data={branches}
            userProfileId={ctx.profile?.id || "default"}
            exportConfig={{
              title: "Branches Report",
              subtitle: "Branch locations across organizations",
              filename: "branches",
              generatedBy: ctx.profile?.full_name || ctx.profile?.display_name || "System User",
            }}
          />
        ) : (
          <ERPEmptyState
            icon={GitBranch}
            title="No branches yet"
            description="Create your first branch location to get started. Use the Add Branch button above."
          />
        )}
      </ERPSectionCard>
    </div>
  );
}
