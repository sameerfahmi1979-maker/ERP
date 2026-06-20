import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { listDailyAttendance } from "@/server/actions/hr/time";
import { HrAttendancePageClient } from "@/features/hr/time/attendance/hr-attendance-page-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function GlobalAttendancePage() {
  const authContext = await getAuthContext();

  if (
    !hasPermission(authContext, "hr.attendance.view") &&
    !authContext.roleCodes?.includes("system_admin")
  ) {
    redirect("/admin/hr/time");
  }

  const result = await listDailyAttendance({ page: 1, page_size: 50 });
  const rows = result.success && result.data ? result.data.data : [];
  const count = result.success && result.data ? result.data.count : 0;

  return (
    <div className="container mx-auto py-6 space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle>Daily Attendance</CardTitle>
              <CardDescription>
                View and manage daily attendance summaries. Filter by date, status, and site.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <HrAttendancePageClient
            initialRows={rows}
            initialCount={count}
            authContext={authContext}
          />
        </CardContent>
      </Card>
    </div>
  );
}
