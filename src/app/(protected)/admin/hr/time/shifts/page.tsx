import { LoadError } from "@/components/erp/load-error";
import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { readHrTime } from "@/server/reads/hr-time";
import { HrShiftsPageClient } from "@/features/hr/time/shifts/hr-shifts-page-client";
import { hrTimeReadIdentity } from "@/lib/reads/hr-time-schema";
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

  const result = await readHrTime({kind: "shifts"}, authContext);
  if (!result.success || result.data?.kind !== "shifts") return <LoadError title="HR records" retryHref="/admin/hr/time/shifts" />;
  const rows = result.data.rows, count = result.data.totalCount;

  return (
    <div className="container mx-auto py-6 space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle><h1>Shift Calendar</h1></CardTitle>
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
            initialReadIdentity={hrTimeReadIdentity(authContext)}
            initialUpdatedAt={result.updatedAt}
          />
        </CardContent>
      </Card>
    </div>
  );
}
