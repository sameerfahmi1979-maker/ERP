import { ERPPageHeader } from "@/components/erp/page-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuditFiltersBar } from "@/features/audit/audit-filters-bar";
import { AuditPageClient } from "@/features/audit/audit-page-client";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { Suspense } from "react";

type AuditPageProps = {
  searchParams: Promise<{
    action?: string;
    module?: string;
    date_from?: string;
    date_to?: string;
    search?: string;
    actor?: string;
  }>;
};

export default async function AdminAuditPage({ searchParams }: AuditPageProps) {
  const ctx = await getAuthContext();
  const params = await searchParams;

  if (!hasPermission(ctx, "audit.view")) {
    return (
      <div className="p-6 space-y-4">
        <ERPPageHeader
          title="Audit Logs"
          description="System audit trail"
          breadcrumbs={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Admin" },
            { label: "Audit Logs" },
          ]}
        />
        <Card>
          <CardHeader>
            <CardTitle>Access denied</CardTitle>
            <CardDescription>You need the audit.view permission.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const actorId = params.actor ? parseInt(params.actor, 10) : undefined;

  const filters = {
    module: params.module || undefined,
    action: params.action || undefined,
    date_from: params.date_from || undefined,
    date_to: params.date_to || undefined,
    search: params.search || undefined,
    actor: actorId && !isNaN(actorId) ? actorId : undefined,
  };

  return (
    <div className="p-6 space-y-4">
      <ERPPageHeader
        title="Audit Logs"
        description="System activity and change history"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Admin" },
          { label: "Audit Logs" },
        ]}
      />
      <Suspense>
        <AuditFiltersBar />
      </Suspense>
      <AuditPageClient authContext={ctx} filters={filters}/>
    </div>
  );
}
