import { ERPPageHeader } from "@/components/erp/page-header";
import { ERPSectionCard } from "@/components/erp/section-card";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { listAuditLogs } from "@/server/queries/audit";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuditLogsTable } from "@/features/audit/audit-logs-table";
import { AuditFiltersBar } from "@/features/audit/audit-filters-bar";
import { FileText } from "lucide-react";
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
      <div className="flex flex-col gap-6">
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

  const auditLogs = await listAuditLogs({
    limit: 300,
    module: params.module || undefined,
    action: params.action || undefined,
    date_from: params.date_from || undefined,
    date_to: params.date_to || undefined,
    search: params.search || undefined,
    actor_user_profile_id: actorId && !isNaN(actorId) ? actorId : undefined,
  });

  const hasFilters = params.action || params.module || params.date_from || params.date_to || params.search || params.actor;

  return (
    <div className="flex flex-col gap-6">
      <ERPPageHeader
        title="Audit Logs"
        description="System activity and change history"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Admin" },
          { label: "Audit Logs" },
        ]}
      />
      <ERPSectionCard
        title="Activity Log"
        description={hasFilters ? `${auditLogs.length} filtered results` : `Recent system activities and changes (last 300 entries)`}
        actions={
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <FileText className="h-3.5 w-3.5" />
            <span>{auditLogs.length} logs</span>
          </div>
        }
        noPadding
      >
        <Suspense>
          <AuditFiltersBar />
        </Suspense>
        <AuditLogsTable 
          data={auditLogs}
          userProfileId={ctx.profile?.id || "default"}
          exportConfig={{
            title: "Audit Logs Report",
            subtitle: "System activity and change history",
            filename: "audit_logs",
            generatedBy: ctx.profile?.full_name || ctx.profile?.display_name || "System User",
          }}
        />
      </ERPSectionCard>
    </div>
  );
}
