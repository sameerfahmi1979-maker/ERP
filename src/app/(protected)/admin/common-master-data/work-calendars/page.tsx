import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { ERPPageHeader } from "@/components/erp/page-header";
import { ERPEmptyState } from "@/components/erp/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Plus } from "lucide-react";
import { listWorkCalendars } from "@/server/actions/common-master-data/work-calendars";
import Link from "next/link";

export default async function WorkCalendarsPage() {
  const ctx = await getAuthContext();
  const canManage = hasPermission(ctx, "common_md.manage") || hasPermission(ctx, "common_md.work_calendars.manage");
  const result = await listWorkCalendars({});
  const calendars = result.data ?? [];

  return (
    <div className="p-6 space-y-4">
      <ERPPageHeader
        title="Work Calendars"
        description="Work schedules, shifts, and operating days"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Common Master Data", href: "/admin/common-master-data" },
          { label: "Work Calendars" },
        ]}
        actions={canManage ? <Link href="/admin/common-master-data/work-calendars/record/new"><Button size="sm"><Plus className="h-4 w-4 mr-1" />Add Calendar</Button></Link> : null}
      />
      {calendars.length === 0 ? <ERPEmptyState icon={Calendar} title="No work calendars yet" description="Create your first work calendar." /> : (
        <div className="rounded-md border overflow-hidden">
          <div className="divide-y">
            {calendars.map(c => (
              <Link key={c.id} href={`/admin/common-master-data/work-calendars/record/${c.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors">
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {c.calendar_name}
                    <span className="text-xs text-muted-foreground">({c.calendar_code})</span>
                    <Badge variant="outline" className="text-[10px]">{c.calendar_type}</Badge>
                    {!c.is_active && <Badge variant="destructive" className="text-[10px]">Inactive</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">Working days: {c.working_days?.join(", ")}</p>
                </div>
                <span className="text-xs text-muted-foreground">→</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
