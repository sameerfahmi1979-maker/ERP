import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AdminOrganizationsPage() {
  const ctx = await getAuthContext();

  if (!hasPermission(ctx, "organizations.view")) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Access denied</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageBreadcrumb
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Organizations" },
        ]}
      />
      <h1 className="text-2xl font-semibold tracking-tight">Owner Companies</h1>
      <Card>
        <CardHeader>
          <CardTitle>Organizations foundation</CardTitle>
          <CardDescription>
            CRUD UI will be added in the next phase. The owner_companies table is ready in the migration with BIGINT IDs and company_code references.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No organization records loaded in this foundation pass.</p>
        </CardContent>
      </Card>
    </div>
  );
}
