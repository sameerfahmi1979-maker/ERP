import { LoadError } from "@/components/erp/load-error";
import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { readHrTime } from "@/server/reads/hr-time";
import { HrLeavePageClient } from "@/features/hr/time/leave/hr-leave-page-client";
import { hrTimeReadIdentity } from "@/lib/reads/hr-time-schema";
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

  const result = await readHrTime({kind: "leave", status: "pending"}, authContext);
  if (!result.success || result.data?.kind !== "leave") return <LoadError title="HR records" retryHref="/admin/hr/time/leave" />;
  const rows = result.data.rows, count = result.data.totalCount;

  return (
    <div className="container mx-auto py-6 space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Plane className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle><h1>Leave Requests</h1></CardTitle>
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
            initialReadIdentity={hrTimeReadIdentity(authContext)}
            initialUpdatedAt={result.updatedAt}
          />
        </CardContent>
      </Card>
    </div>
  );
}
