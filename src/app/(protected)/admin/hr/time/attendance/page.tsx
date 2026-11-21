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
import { readFleetAttendanceDrafts } from "@/server/actions/fleet/rental-time";
import { FleetAttendanceReview } from "@/features/fleet/time-workspace";
import { fleetTimeDate } from "@/lib/fleet/time-contract";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";

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
  const fleetDay = fleetTimeDate.safeParse(params?.fleet_day ?? entrySeed?.date ??
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date()));
  const fleetAfter = typeof params?.fleet_after === "string" ? Number(params.fleet_after) : undefined;
  const canReviewFleet = canUseHrChild(authContext, "attendance-summary");
  const showFleetDrafts = canReviewFleet && params?.fleet_day !== undefined;
  const fleetDrafts = showFleetDrafts && fleetDay.success ? await readFleetAttendanceDrafts(fleetDay.data, fleetAfter) : null;

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
          {canReviewFleet && <details className="mb-5 space-y-3 rounded-md border p-3" open={showFleetDrafts}>
            <summary className="cursor-pointer font-semibold">Fleet attendance drafts</summary>
            <form className="flex flex-wrap items-end gap-2">
              <label className="space-y-1 text-sm"><span>Fleet work date</span>
                <Input type="date" name="fleet_day" defaultValue={fleetDay.success ? fleetDay.data : undefined} required />
              </label>
              <Button type="submit" size="sm">Load drafts</Button>
            </form>
            {showFleetDrafts && (fleetDrafts && fleetDay.success ? <>
              {fleetDrafts.length === 0 && <p className="text-sm text-muted-foreground">No Fleet drafts for this date.</p>}
              {fleetDrafts.slice(0, 25).map(draft => <FleetAttendanceReview key={draft.employee} draft={draft} day={fleetDay.data} />)}
              {fleetDrafts.length > 25 && <Link className="text-primary underline" href={"/admin/hr/time/attendance?fleet_day=" + fleetDay.data
                + "&fleet_after=" + fleetDrafts[24].employee}>More drafts</Link>}
            </> : <p role="status" className="text-sm">Fleet drafts could not be loaded for this date.</p>)}
          </details>}
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
