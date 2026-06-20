import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { listGlobalShiftAssignments } from "@/server/actions/hr/time";
import { HrShiftsPageClient } from "@/features/hr/time/shifts/hr-shifts-page-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function GlobalShiftsPage() {
  const authContext = await getAuthContext();

  if (
    !hasPermission(authContext, "hr.attendance.view") &&
    !authContext.roleCodes?.includes("system_admin")
  ) {
    redirect("/admin/hr/time");
  }

  const result = await listGlobalShiftAssignments({ page: 1, page_size: 50 });
  const rows = result.success && result.data ? result.data.data : [];
  const count = result.success && result.data ? result.data.count : 0;

  return (
    <div className="container mx-auto py-6 space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle>Shift Calendar</CardTitle>
              <CardDescription>
                View and manage employee shift and work calendar assignments.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <HrShiftsPageClient
            initialRows={rows}
            initialCount={count}
            authContext={authContext}
          />
        </CardContent>
      </Card>
    </div>
  );
}
