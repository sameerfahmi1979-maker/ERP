import { getAuthContext } from "@/lib/rbac/check";
import { canOpenCalendarEditor } from "@/lib/master-data/calendar-permissions";
import { ERPPageHeader } from "@/components/erp/page-header";
import { LoadError } from "@/components/erp/load-error";
import { WorkCalendarsListClient } from "@/features/common-master-data/work-calendars/work-calendars-list-client";
import {redirect} from 'next/navigation';
import { buttonVariants } from "@/components/ui/button";
import { listWorkCalendars } from "@/server/actions/common-master-data/work-calendars";
import Link from "next/link";

const BASE = "/admin/common-master-data/work-calendars";
export default async function WorkCalendarsPage() {
  const ctx = await getAuthContext();
  const canManage = canOpenCalendarEditor(ctx);
  const result = await listWorkCalendars({});
  if(result.kind==='forbidden')redirect('/access-denied');
  return <div className="p-4 md:p-6 space-y-4">
    <ERPPageHeader title="Work calendars" description="Work schedules, shifts, and operating days"
      breadcrumbs={[{label:"Common master data",href:"/admin/common-master-data"},{label:"Work calendars"}]}
      actions={canManage ? <Link className={buttonVariants({size:"sm"})} href={BASE + "/record/new"}>Add calendar</Link> : null} />
    {!result.success ? <LoadError title="Work calendars" retryHref={BASE} /> :
      <WorkCalendarsListClient key={ctx.profile?.id} calendars={result.data??[]} authContext={ctx}/>}
  </div>;
}
