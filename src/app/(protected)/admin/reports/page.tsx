/**
 * Report Center Landing Page
 * Phase REPORT.3 — Template / Branding / Output Adapter Engine
 *
 * Lists active report registry entries.
 * Permission-gated by reports.view.
 * No report execution in this phase (except ADMIN_PERMISSION_MATRIX which has a safe fetcher).
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { listReportRegistry } from "@/server/actions/reports/registry";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BarChart3, FileText, Lock, Settings } from "lucide-react";

const categoryLabels: Record<string, string> = {
  list: "List",
  summary: "Summary",
  detail: "Detail",
  dashboard_snapshot: "Dashboard",
  letter: "Letter",
  certificate: "Certificate",
  form: "Form",
  checklist: "Checklist",
  compliance: "Compliance",
  audit: "Audit",
  export: "Export",
  badge: "Badge",
  external_submission: "External",
  group_summary: "Group Summary",
};

export default async function ReportCenterPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "reports.view")) {
    redirect("/admin");
  }

  const result = await listReportRegistry();
  const entries = result.data ?? [];

  const canManage = hasPermission(ctx, "reports.manage");

  return (
    <div className="flex flex-col gap-6 p-6 max-w-screen-xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Report Center</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            Browse available reports across all ERP modules.
          </p>
        </div>
        {canManage && (
          <Link
            href="/admin/reports/templates"
            className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <Settings className="h-4 w-4" />
            Templates &amp; Branding
          </Link>
        )}
      </div>

      {/* Registry table */}
      <div className="rounded-lg border shadow-sm overflow-hidden">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <FileText className="h-10 w-10 opacity-30" />
            <p className="text-sm">No reports available.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="w-[180px]">Report Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="w-[120px]">Module</TableHead>
                <TableHead className="w-[120px]">Category</TableHead>
                <TableHead className="w-[160px]">Output Formats</TableHead>
                <TableHead className="w-[80px]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id} className="hover:bg-muted/30">
                  <TableCell>
                    <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                      {entry.report_code}
                    </code>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-sm">{entry.report_name_en}</div>
                    {entry.description_en && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {entry.description_en}
                      </p>
                    )}
                    {entry.sensitive_profile !== "normal" && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 mt-0.5">
                        <Lock className="h-3 w-3" />
                        {entry.sensitive_profile}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {entry.module_code}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {categoryLabels[entry.report_category] ?? entry.report_category}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {entry.default_output_formats.map((fmt) => (
                        <Badge key={fmt} variant="secondary" className="text-[10px] px-1.5">
                          {fmt.toUpperCase()}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={entry.is_active ? "default" : "secondary"} className="text-xs">
                      {entry.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {entries.length} report{entries.length !== 1 ? "s" : ""} available ·{" "}
        Report execution and scheduling coming in future phases.
      </p>
    </div>
  );
}
