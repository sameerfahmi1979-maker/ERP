/**
 * Public Verification Links — Admin List Page
 * Phase: BRANDING.6 — Public QR Verification System
 *
 * Lists all issued public verification links.
 * Permission: reports.view or reports.publish or reports.verify.admin
 */

import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { listOutputPublicLinks } from "@/server/actions/reports/public-verification";
import { PublicLinksAdminClient } from "./public-links-admin-client";

export default async function PublicLinksAdminPage() {
  const ctx = await getAuthContext();

  if (
    !hasPermission(ctx, "reports.view") &&
    !hasPermission(ctx, "reports.publish") &&
    !hasPermission(ctx, "reports.verify.admin") &&
    !hasPermission(ctx, "reports.manage")
  ) {
    redirect("/admin/reports");
  }

  const result = await listOutputPublicLinks({ limit: 100 });
  const canManage =
    hasPermission(ctx, "reports.publish") ||
    hasPermission(ctx, "reports.manage") ||
    hasPermission(ctx, "reports.verify.admin");

  return (
    <PublicLinksAdminClient
      initialLinks={result.data?.links ?? []}
      totalLinks={result.data?.total ?? 0}
      canManage={canManage}
    />
  );
}
