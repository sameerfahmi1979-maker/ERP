import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { listLeaveRequests } from "@/server/actions/hr/time";
import { HrLeavePageClient } from "@/features/hr/time/leave/hr-leave-page-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plane } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function GlobalLeavePage() {
  const authContext = await getAuthContext();

  if (
    !hasPermission(authContext, "hr.leave.view") &&
    !authContext.roleCodes?.includes("system_admin")
  ) {
    redirect("/admin/hr/time");
  }

  const result = await listLeaveRequests({ page: 1, page_size: 50, approval_status: "pending" });
  const rows = result.success && result.data ? result.data.data : [];
  const count = result.success && result.data ? result.data.count : 0;

  return (
    <div className="container mx-auto py-6 space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Plane className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle>Leave Requests</CardTitle>
              <CardDescription>
                View, approve, reject, and manage employee leave requests across the organization.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <HrLeavePageClient
            initialRows={rows}
            initialCount={count}
            authContext={authContext}
          />
        </CardContent>
      </Card>
    </div>
  );
}
