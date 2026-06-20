/**
 * Report Templates & Branding Admin Page
 * Phase REPORT.3 — Template / Branding / Output Adapter Engine
 *
 * Lists both branding profiles and report templates.
 * Permission-gated by reports.view (read) and reports.manage (edit).
 */

import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { ReportTemplatesPageClient } from "@/features/report-center/report-templates-page-client";
import { listBrandingProfiles, listReportTemplates } from "@/server/actions/reports/templates";

export default async function ReportTemplatesPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "reports.view")) {
    redirect("/admin");
  }

  const [profilesResult, templatesResult] = await Promise.all([
    listBrandingProfiles(),
    listReportTemplates(),
  ]);

  const canManage = hasPermission(ctx, "reports.manage");

  return (
    <ReportTemplatesPageClient
      initialProfiles={profilesResult.data ?? []}
      initialTemplates={templatesResult.data ?? []}
      canManage={canManage}
    />
  );
}
