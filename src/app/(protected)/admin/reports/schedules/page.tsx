import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { isSchedulesUiEnabled } from "@/lib/output/feature-flags";
import { ReportSchedulesPage } from "@/features/report-center/report-schedules-page";
import { CalendarClock } from "lucide-react";

export const metadata = { title: "Report Schedules" };

export default async function Page() {
  const ctx = await getAuthContext();
  if (
    !hasPermission(ctx, "reports.schedule.view") &&
    !hasPermission(ctx, "reports.schedule.manage")
  ) {
    redirect("/admin/reports");
  }

  // OUTPUT.1 (v6.1): the schedules processor/worker is not live yet, so the UI
  // is hidden until OUTPUT.7 delivery UAT passes. Schedule rows, delivery logs,
  // and audit history are fully preserved. Re-enable via OUTPUT_SCHEDULES_UI_ENABLED.
  if (!isSchedulesUiEnabled()) {
    return (
      <div className="p-6">
        <div className="mx-auto max-w-lg rounded-xl border bg-card p-8 text-center shadow-sm">
          <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400">
            <CalendarClock className="h-6 w-6" />
          </span>
          <h1 className="text-lg font-semibold">Report Schedules — Temporarily Unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Scheduled report delivery is being upgraded to the new output framework.
            Existing schedules and their delivery history are preserved and will
            reappear here once the new delivery worker passes verification.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <ReportSchedulesPage />
    </div>
  );
}
