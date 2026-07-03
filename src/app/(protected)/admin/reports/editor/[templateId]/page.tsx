/**
 * Reports Editor — Template Editor Route Skeleton
 * Phase: REPORT DESIGNER.2 — Puck Installation, Type, Query Keys, Editor Shell Prep
 *
 * This route verifies that the dynamic editor route compiles correctly
 * with Next.js App Router async params. Puck shell is loaded via a client
 * wrapper component (ssr:false is not allowed directly in Server Components
 * in Next.js 16).
 *
 * The full editor UI (layout zones, block library, save/preview integration)
 * comes in REPORT DESIGNER.3+.
 *
 * Access: reports.manage permission only.
 * Governance: Only draft/rejected templates are editable (enforced in REPORT DESIGNER.3+).
 */

import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { ReportDesignerPuckShellLoader } from "@/features/report-designer/puck/report-designer-puck-shell-loader";

interface Props {
  params: Promise<{ templateId: string }>;
}

export default async function ReportsEditorTemplatePage({ params }: Props) {
  const { templateId: templateIdRaw } = await params;
  const templateId = parseInt(templateIdRaw, 10);

  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "reports.manage")) {
    redirect("/admin/reports/templates");
  }

  if (isNaN(templateId) || templateId <= 0) {
    redirect("/admin/reports/editor");
  }

  return (
    <div className="flex flex-col h-full min-h-[80vh]">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2 bg-background">
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
          Visual Editor — Foundation Scaffold
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          Template #{templateId} · REPORT DESIGNER.2 · Full UI in REPORT DESIGNER.3+
        </span>
      </div>
      <div className="flex-1 min-h-0">
        <ReportDesignerPuckShellLoader
          templateId={templateId}
          initialLayout={null}
        />
      </div>
    </div>
  );
}
