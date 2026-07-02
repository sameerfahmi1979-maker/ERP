/**
 * Report Center Landing Page
 * Phase REPORT.3 — Template / Branding / Output Adapter Engine
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { listReportRegistry } from "@/server/actions/reports/registry";
import { ERPPageHeader } from "@/components/erp/page-header";
import { ReportRegistryTable } from "@/features/report-center/report-registry-table";
import { Settings } from "lucide-react";

export default async function ReportCenterPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "reports.view")) {
    redirect("/admin");
  }

  const result = await listReportRegistry();
  const entries = result.data ?? [];

  const canManage = hasPermission(ctx, "reports.manage");

  return (
    <div className="p-6 space-y-4">
      <ERPPageHeader
        title="Report Center"
        description="Browse and run available reports across all ERP modules."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Admin" },
          { label: "Report Center" },
        ]}
        actions={
          canManage ? (
            <Link
              href="/admin/reports/templates"
              className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <Settings className="h-4 w-4" />
              Templates &amp; Branding
            </Link>
          ) : null
        }
      />

      <ReportRegistryTable entries={entries} />

      <p className="text-xs text-muted-foreground">
        {entries.length} report{entries.length !== 1 ? "s" : ""} available
      </p>
    </div>
  );
}
