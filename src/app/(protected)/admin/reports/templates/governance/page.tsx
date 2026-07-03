/**
 * Template Governance Dashboard — BRANDING.8
 * Shows governance status counts, approver queue, and failed security review list.
 */

import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { getGovernanceSummary } from "@/server/actions/reports/template-governance";
import { GovernanceDashboardClient } from "./governance-dashboard-client";

export const metadata = { title: "Template Governance" };

export default async function TemplateGovernancePage() {
  const ctx = await getAuthContext();
  if (
    !hasPermission(ctx, "reports.view") &&
    !hasPermission(ctx, "reports.manage") &&
    !hasPermission(ctx, "reports.template.approve")
  ) {
    redirect("/admin/reports/templates");
  }

  const summary = await getGovernanceSummary();

  const canApprove = hasPermission(ctx, "reports.template.approve");
  const canPublish = hasPermission(ctx, "reports.publish") || canApprove;
  const canManage = hasPermission(ctx, "reports.manage");

  return (
    <GovernanceDashboardClient
      counts={summary.data?.counts ?? {}}
      inReviewTemplates={summary.data?.inReviewTemplates ?? []}
      failedSecurityReviewTemplates={summary.data?.failedSecurityReviewTemplates ?? []}
      canApprove={canApprove}
      canPublish={canPublish}
      canManage={canManage}
    />
  );
}
