import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect, notFound } from "next/navigation";
import { getWorkCalendarById } from "@/server/actions/common-master-data/work-calendars";
import { WorkCalendarWorkspaceForm } from "@/features/common-master-data/work-calendars/work-calendar-workspace-form";
import { createClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ mode?: string }> };

export default async function WorkCalendarRecordPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { mode: modeParam } = await searchParams;
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "common_md.view") && !hasPermission(ctx, "common_md.work_calendars.view")) redirect("/admin/common-master-data/work-calendars");
  const numericId = parseInt(id);
  if (isNaN(numericId)) notFound();
  const result = await getWorkCalendarById(numericId);
  if (!result.success || !result.data) notFound();
  const canManage = hasPermission(ctx, "common_md.manage") || hasPermission(ctx, "common_md.work_calendars.manage");
  const mode = modeParam === "edit" && canManage ? "edit" : "view";
  const supabase = await createClient();
  const { data: companies } = await supabase.from("owner_companies").select("id, legal_name_en, company_code").eq("status", "active").order("legal_name_en");
  return <WorkCalendarWorkspaceForm calendar={result.data} mode={mode} authContext={ctx} companies={companies ?? []} />;
}
