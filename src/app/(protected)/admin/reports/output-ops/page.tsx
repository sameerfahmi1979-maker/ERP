import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { isOutputOpsConsoleEnabled } from "@/lib/output/feature-flags";
import { OutputOpsConsole } from "@/features/output-ops/output-ops-console";
import { Activity } from "lucide-react";

export const metadata = { title: "Output Operations" };

export default async function Page() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "outputs.ops.view")) {
    redirect("/admin/reports");
  }

  if (!isOutputOpsConsoleEnabled()) {
    return (
      <div className="p-6">
        <div className="mx-auto max-w-lg rounded-xl border bg-card p-8 text-center shadow-sm">
          <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-400">
            <Activity className="h-6 w-6" />
          </span>
          <h1 className="text-lg font-semibold">Output Operations — Not Enabled</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The Global Output Operations Console is not enabled on this environment.
            Set <code className="font-mono">OUTPUT_OPS_CONSOLE_ENABLED=true</code> to activate it.
          </p>
        </div>
      </div>
    );
  }

  return <OutputOpsConsole />;
}
