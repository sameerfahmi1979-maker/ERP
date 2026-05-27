import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AdminAuditPage() {
  const ctx = await getAuthContext();

  if (!hasPermission(ctx, "audit.view")) {
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
          { label: "Audit Logs" },
        ]}
      />
      <h1 className="text-2xl font-semibold tracking-tight">Audit Logs</h1>
      <Card>
        <CardHeader>
          <CardTitle>Audit trail placeholder</CardTitle>
          <CardDescription>
            The audit_logs table stores BIGINT entity_id values and human-readable entity_reference text.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Audit listing UI will connect after migration approval.</p>
        </CardContent>
      </Card>
    </div>
  );
}
