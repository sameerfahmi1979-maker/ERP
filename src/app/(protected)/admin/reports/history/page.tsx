import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { ReportHistoryPage } from "@/features/report-center/report-history-page";
import {readReportHistory} from "@/server/reads/report-history";
import {reportHistoryIdentity} from "@/lib/reads/report-history-schema";

export const metadata = { title: "Report History" };

export default async function Page() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "reports.view") && !hasPermission(ctx, "reports.history.view")) {
    redirect("/admin/reports");
  }
  const initial = await readReportHistory({}, ctx);
  return (
    <div className="p-6 space-y-4">
      <ReportHistoryPage authContext={ctx} initialPage={initial.success && initial.data.mode === "list" ? initial.data : undefined} initialUpdatedAt={initial.success ? initial.updatedAt : undefined} initialReadIdentity={reportHistoryIdentity(ctx)} />
    </div>
  );
}
