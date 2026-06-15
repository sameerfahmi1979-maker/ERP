import { ERPPageHeader } from "@/components/erp/page-header";
import { ERPSectionCard } from "@/components/erp/section-card";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { listAuditLogs } from "@/server/queries/audit";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuditLogsTable } from "@/features/audit/audit-logs-table";
import { FileText } from "lucide-react";

export default async function AdminAuditPage() {
  const ctx = await getAuthContext();

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

  const auditLogs = await listAuditLogs({ limit: 200 });

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
        description="Recent system activities and changes (last 200 entries)"
        actions={
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <FileText className="h-3.5 w-3.5" />
            <span>{auditLogs.length} recent logs</span>
          </div>
        }
        noPadding
      >
        <AuditLogsTable 
          data={auditLogs}
          userProfileId={ctx.profile?.id || "default"}
          exportConfig={{
            title: "Audit Logs Report",
            subtitle: "System activity and change history (last 200 entries)",
            filename: "audit_logs",
            generatedBy: ctx.profile?.full_name || ctx.profile?.display_name || "System User",
          }}
        />
      </ERPSectionCard>
    </div>
  );
}

