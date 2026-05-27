import { ERPPageHeader } from "@/components/erp/page-header";
import { ERPSectionCard } from "@/components/erp/section-card";
import { ERPEmptyState } from "@/components/erp/empty-state";
import { Button } from "@/components/ui/button";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Building2 } from "lucide-react";

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

  return (
    <div className="flex flex-col gap-6">
      <ERPPageHeader
        title="Owner Companies"
        description="The owner_companies table is ready in the migration with BIGINT IDs and company_code references."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Admin" },
          { label: "Organizations" },
        ]}
        actions={
          <Button size="sm" className="h-9 text-xs gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Add Organization
          </Button>
        }
      />
      <ERPSectionCard
        title="Organizations"
        description="CRUD UI will be added in the next phase"
      >
        <ERPEmptyState
          icon={Building2}
          title="No organizations found"
          description="No organization records loaded in this foundation pass. CRUD functionality coming in the next phase."
        />
      </ERPSectionCard>
    </div>
  );
}
