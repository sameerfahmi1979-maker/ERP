import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { Clock, Calendar, Plane, Timer } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { HrReportsMenu } from "@/components/erp/hr-reports-menu";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TIME_SECTIONS = [
  {
    href: "/admin/hr/time/attendance",
    icon: Clock,
    title: "Daily Attendance",
    description: "View and manage daily attendance summaries across all employees.",
    permission: "hr.attendance.view",
  },
  {
    href: "/admin/hr/time/leave",
    icon: Plane,
    title: "Leave Requests",
    description: "Review, approve, reject, and cancel employee leave requests.",
    permission: "hr.leave.view",
  },
  {
    href: "/admin/hr/time/shifts",
    icon: Calendar,
    title: "Shift Calendar",
    description: "Manage employee shift and work calendar assignments.",
    permission: "hr.attendance.view",
  },
];

export default async function HrTimeHubPage() {
  const authContext = await getAuthContext();

  const canViewAttendance = hasPermission(authContext, "hr.attendance.view") || authContext.roleCodes?.includes("system_admin");
  const canViewLeave = hasPermission(authContext, "hr.leave.view") || authContext.roleCodes?.includes("system_admin");

  if (!canViewAttendance && !canViewLeave) {
    redirect("/access-denied");
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Attendance &amp; Leave</h1>
          <p className="text-muted-foreground mt-1">Manage time records, shift assignments, leave requests, and overtime.</p>
        </div>
        <HrReportsMenu reports={[
          { reportCode: "HR_ATTENDANCE_SUMMARY", label: "Attendance Summary" },
          { reportCode: "HR_LEAVE_BALANCE", label: "Leave Balance" },
          { reportCode: "HR_LEAVE_REQUESTS", label: "Leave Requests" },
          { reportCode: "HR_OVERTIME_REPORT", label: "Overtime Report" },
          { reportCode: "HR_ABSENT_LATE_SUMMARY", label: "Absent & Late Summary" },
        ]} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {TIME_SECTIONS.map((section) => {
          const canAccess =
            hasPermission(authContext, section.permission) ||
            authContext.roleCodes?.includes("system_admin");

          const Icon = section.icon;

          if (!canAccess) return null;

          return (
            <Link key={section.href} href={section.href}>
              <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-primary" />
                    <CardTitle className="text-base">{section.title}</CardTitle>
                  </div>
                  <CardDescription>{section.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          );
        })}

        {/* Overtime â€” sub-section note */}
        <Card className="border-dashed">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Timer className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base text-muted-foreground">Overtime Records</CardTitle>
            </div>
            <CardDescription>Manage overtime records from the individual Employee Profile â†’ Time tab.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}

