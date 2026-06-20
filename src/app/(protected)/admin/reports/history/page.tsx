import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { ReportHistoryPage } from "@/features/report-center/report-history-page";

export const metadata = { title: "Report History" };

export default async function Page() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "reports.view") && !hasPermission(ctx, "reports.history.view")) {
    redirect("/admin/reports");
  }
  return (
    <div className="p-6">
      <ReportHistoryPage />
    </div>
  );
}
