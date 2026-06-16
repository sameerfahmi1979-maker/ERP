import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { DesignationWorkspaceForm } from "@/features/common-master-data/designations/designation-workspace-form";
import { createClient } from "@/lib/supabase/server";

export default async function NewDesignationPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "common_md.manage") && !hasPermission(ctx, "common_md.designations.manage")) redirect("/admin/common-master-data/designations");
  const supabase = await createClient();
  const { data: companies } = await supabase.from("owner_companies").select("id, legal_name_en, company_code").eq("status", "active").order("legal_name_en");
  return <DesignationWorkspaceForm mode="add" authContext={ctx} companies={companies ?? []} />;
}
