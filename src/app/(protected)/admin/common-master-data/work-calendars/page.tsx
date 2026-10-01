import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { ERPPageHeader } from "@/components/erp/page-header";
import { LoadError } from "@/components/erp/load-error";
import { CommonMasterList } from "@/features/common-master-data/common-master-list";
import { buttonVariants } from "@/components/ui/button";
import { listWorkCalendars } from "@/server/actions/common-master-data/work-calendars";
import Link from "next/link";

const BASE = "/admin/common-master-data/work-calendars";
export default async function WorkCalendarsPage() {
  const ctx = await getAuthContext();
  const canManage = hasPermission(ctx, "common_md.manage") || hasPermission(ctx, "common_md.work_calendars.manage");
  const result = await listWorkCalendars({});
  return <div className="p-4 md:p-6 space-y-4">
    <ERPPageHeader title="Work calendars" description="Work schedules, shifts, and operating days"
      breadcrumbs={[{label:"Common master data",href:"/admin/common-master-data"},{label:"Work calendars"}]}
      actions={canManage ? <Link className={buttonVariants({size:"sm"})} href={BASE + "/record/new"}>Add calendar</Link> : null} />
    {!result.success ? <LoadError title="Work calendars" retryHref={BASE} /> :
      <CommonMasterList title="Work calendars" basePath={BASE} fields={[{ key:"type", label:"Type" }, { key:"days", label:"Working days" }, { key:"active", label:"Active", type:"select", options:[{value:"true",label:"Yes"},{value:"false",label:"No"}] }]}
        rows={(result.data ?? []).map(r=>({ id:r.id, name:r.calendar_name, code:r.calendar_code, type:r.calendar_type, days:r.working_days?.join(", ") ?? "", active:r.is_active }))} />}
  </div>;
}
