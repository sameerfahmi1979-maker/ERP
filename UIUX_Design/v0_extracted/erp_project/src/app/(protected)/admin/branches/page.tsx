import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AdminBranchesPage() {
  const ctx = await getAuthContext();

  if (!hasPermission(ctx, "branches.view")) {
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
          { label: "Branches" },
        ]}
      />
      <h1 className="text-2xl font-semibold tracking-tight">Branches</h1>
      <Card>
        <CardHeader>
          <CardTitle>Branch foundation</CardTitle>
          <CardDescription>
            Branch management UI placeholder linked to owner_companies via BIGINT foreign keys.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No branch records loaded in this foundation pass.</p>
        </CardContent>
      </Card>
    </div>
  );
}
