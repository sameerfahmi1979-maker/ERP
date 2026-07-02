import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { ReportSchedulesPage } from "@/features/report-center/report-schedules-page";

export const metadata = { title: "Report Schedules" };

export default async function Page() {
  const ctx = await getAuthContext();
  if (
    !hasPermission(ctx, "reports.schedule.view") &&
    !hasPermission(ctx, "reports.schedule.manage")
  ) {
    redirect("/admin/reports");
  }
  return (
    <div className="p-6 space-y-4">
      <ReportSchedulesPage />
    </div>
  );
}
