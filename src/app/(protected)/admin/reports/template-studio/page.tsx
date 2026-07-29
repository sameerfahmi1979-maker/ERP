import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { FileCode2 } from "lucide-react";

export const metadata = { title: "Template Studio (Retired)" };

/**
 * OFFICIAL DOCS.1 Package 9: the visual Template Studio was retired and its
 * editor code removed. Official letters and forms are fixed, versioned,
 * code-based templates (src/lib/official-documents) generated from the
 * Employee Profile → Letters & Forms tab. This route is kept as a permanent
 * notice so old links and open workspace tabs do not 404.
 */
export default async function Page() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "reports.manage")) {
    redirect("/admin/reports");
  }

  return (
    <div className="p-6">
      <div className="mx-auto max-w-lg rounded-xl border bg-card p-8 text-center shadow-sm">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400">
          <FileCode2 className="h-6 w-6" />
        </span>
        <h1 className="text-lg font-semibold">Template Studio — Retired</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The visual template editor has been replaced by fixed, approved,
          code-based official document templates. Generate official letters and
          forms from the employee record&apos;s <strong>Letters &amp; Forms</strong> tab.
          Branding profiles remain under <strong>Templates &amp; Branding</strong>.
        </p>
      </div>
    </div>
  );
}
