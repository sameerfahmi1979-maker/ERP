import { getAuthContext } from "@/lib/rbac/check";
import { canOpenCalendarEditor } from "@/lib/master-data/calendar-permissions";
import { redirect } from "next/navigation";
import { WorkCalendarWorkspaceForm } from "@/features/common-master-data/work-calendars/work-calendar-workspace-form";
import { createClient } from "@/lib/supabase/server";
import { LoadError } from "@/components/erp/load-error";

export default async function NewWorkCalendarPage() {
  const ctx = await getAuthContext();
  if (!canOpenCalendarEditor(ctx)) redirect("/admin/common-master-data/work-calendars");
  const supabase = await createClient();
  const { data: companies,error } = await supabase.from("owner_companies").select("id, legal_name_en, company_code").eq("status", "active").order("legal_name_en");
  if(error)return <LoadError title="Calendar organizations" retryHref="/admin/common-master-data/work-calendars/record/new"/>;
  return <WorkCalendarWorkspaceForm mode="add" authContext={ctx} companies={companies ?? []} />;
}
