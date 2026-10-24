import { LoadError } from "@/components/erp/load-error";
import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { readHrTime } from "@/server/reads/hr-time";
import { HrAttendancePageClient } from "@/features/hr/time/attendance/hr-attendance-page-client";
import { hrTimeReadIdentity } from "@/lib/reads/hr-time-schema";
import { canUseHrChild } from "@/lib/hr/child-authority";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock } from "lucide-react";
import {readAttendanceEntryOpening} from '@/server/actions/hr/attendance-workbench';

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function GlobalAttendancePage(props: {searchParams?:Promise<Record<string,string|string[]|undefined>>}) {
  const authContext = await getAuthContext();

  if (
    !hasPermission(authContext, "hr.attendance.view") &&
    !authContext.roleCodes?.includes("system_admin")
  ) {
    redirect("/admin/hr/time");
  }

  // Daily entry loads its own exact permitted roster. Do not make it depend on
  // an unrelated history query or seed the deferred history with a false empty page.
  const result = canUseHrChild(authContext, 'attendance-summary') ? null : await readHrTime({kind: "attendance"}, authContext);
  if (result && (!result.success || result.data?.kind !== "attendance")) return <LoadError title="HR records" retryHref="/admin/hr/time/attendance" />;
  const historyPage = result?.success && result.data?.kind === 'attendance' ? result.data : null;
  const params=await props?.searchParams,entry=params?.entry_employee,record=params?.entry_record;
  let entrySeed:{company:number;date:string;search:string}|undefined;
  if(entry!==undefined||record!==undefined){
    if(typeof entry!=='string'||!/^[1-9]\d*$/.test(entry)||record!==undefined&&(typeof record!=='string'||!/^[1-9]\d*$/.test(record)))return <LoadError title="Attendance context"retryHref="/admin/hr/time/attendance"/>;
    const opening=await readAttendanceEntryOpening(Number(entry),record===undefined?null:Number(record));
    if(!opening.success)return <LoadError title="Attendance context"retryHref="/admin/hr/time/attendance"/>;
    entrySeed={company:opening.data.company,date:opening.data.date,search:opening.data.row.employee_code};
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle><h1>Daily Attendance</h1></CardTitle>
              <CardDescription>
                View and manage daily attendance summaries. Filter by date, status, and site.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <HrAttendancePageClient
            initialRows={historyPage?.rows ?? []}
            initialCount={historyPage?.totalCount ?? 0}
            authContext={authContext}
            initialReadIdentity={historyPage ? hrTimeReadIdentity(authContext) : undefined}
            initialUpdatedAt={historyPage ? result?.updatedAt : undefined}
            entrySeed={entrySeed}
          />
        </CardContent>
      </Card>
    </div>
  );
}
