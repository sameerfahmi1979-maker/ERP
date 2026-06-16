import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { WorkSiteWorkspaceForm } from "@/features/common-master-data/work-sites/work-site-workspace-form";
import { createClient } from "@/lib/supabase/server";

export default async function NewWorkSitePage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "common_md.manage") && !hasPermission(ctx, "common_md.work_sites.manage")) redirect("/admin/common-master-data/work-sites");
  const supabase = await createClient();
  const { data: companies } = await supabase.from("owner_companies").select("id, legal_name_en, company_code").eq("status", "active").order("legal_name_en");
  return <WorkSiteWorkspaceForm mode="add" authContext={ctx} companies={companies ?? []} />;
}
