/**
 * Reports Editor — Index Route Skeleton
 * Phase: REPORT DESIGNER.2 — Puck Installation, Type, Query Keys, Editor Shell Prep
 *
 * This route is a placeholder skeleton. It confirms the route is registered and
 * accessible to authorized users. Full editor UI comes in REPORT DESIGNER.3+.
 *
 * Access: reports.manage permission only.
 */

import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";

export default async function ReportsEditorIndexPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "reports.manage")) {
    redirect("/admin/reports/templates");
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
      <div className="rounded-xl border border-dashed border-border bg-muted/30 p-10 max-w-lg">
        <h1 className="text-lg font-semibold text-foreground mb-2">Reports Visual Editor</h1>
        <p className="text-sm text-muted-foreground mb-4">
          The visual editor foundation has been installed (REPORT DESIGNER.2).
          Full drag-and-drop editing UI is coming in REPORT DESIGNER.3.
        </p>
        <p className="text-xs text-muted-foreground">
          To edit a template, open it from{" "}
          <a href="/admin/reports/templates" className="underline text-primary">
            Templates &amp; Branding
          </a>
          .
        </p>
      </div>
    </div>
  );
}
