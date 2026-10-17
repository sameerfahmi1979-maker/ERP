import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect, notFound } from "next/navigation";
import { getWorkCalendarById } from "@/server/actions/common-master-data/work-calendars";
import { WorkCalendarWorkspaceForm } from "@/features/common-master-data/work-calendars/work-calendar-workspace-form";
import { createClient } from "@/lib/supabase/server";
import { LoadError } from "@/components/erp/load-error";
import { canManageCalendar } from "@/lib/master-data/calendar-permissions";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ mode?: string }> };

export default async function WorkCalendarRecordPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { mode: modeParam } = await searchParams;
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "common_md.view") && !hasPermission(ctx, "common_md.work_calendars.view")) redirect("/access-denied");
  const numericId = Number(id);
  if (!/^[1-9]\d*$/.test(id)||!Number.isSafeInteger(numericId)) notFound();
  const result = await getWorkCalendarById(numericId);
  if(result.kind==='forbidden')redirect('/access-denied');
  if(result.kind==='not_found')notFound();
  const retryHref=`/admin/common-master-data/work-calendars/record/${numericId}${modeParam==='edit'?'?mode=edit':''}`;
  if (!result.success || !result.data) return <LoadError title="Work calendar" retryHref={retryHref}/>;
  const canManage = canManageCalendar(ctx,result.data.owner_company_id);
  const mode = modeParam === "edit" && canManage ? "edit" : "view";
  const supabase = await createClient();
  const { data: companies,error } = await supabase.from("owner_companies").select("id, legal_name_en, company_code").eq("status", "active").order("legal_name_en");
  if(error)return <LoadError title="Calendar organizations" retryHref={retryHref}/>;
  return <WorkCalendarWorkspaceForm calendar={result.data} mode={mode} authContext={ctx} companies={companies ?? []} />;
}
