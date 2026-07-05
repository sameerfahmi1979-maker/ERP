/**
 * Reports Editor — Template Editor Page
 * Phase: REPORT DESIGNER.3 — ERP Block Library Foundation
 *
 * Full visual editor with:
 *  - All 10 ERP Puck blocks
 *  - Header / Body / Footer zone switching
 *  - Load from / save to server action
 *  - Governance read-only guard
 *  - Template metadata header
 *
 * Access: reports.manage or reports.view (view is read-only in editor)
 * Governance guard: enforced in both UI and server action
 */

import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { ReportDesignerEditorClient } from "@/features/report-designer/report-designer-editor-client";

interface Props {
  params: Promise<{ templateId: string }>;
}

export default async function ReportsEditorTemplatePage({ params }: Props) {
  const { templateId: templateIdRaw } = await params;
  const templateId = parseInt(templateIdRaw, 10);

  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "reports.manage") && !hasPermission(ctx, "reports.view")) {
    redirect("/admin/reports/templates");
  }

  if (isNaN(templateId) || templateId <= 0) {
    redirect("/admin/reports/editor");
  }

  return (
    <div className="flex flex-col h-full min-h-0" style={{ height: "calc(100vh - 48px)" }}>
      <ReportDesignerEditorClient
        templateId={templateId}
        userPermissions={ctx.permissionCodes}
      />
    </div>
  );
}
