import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { DepartmentWorkspaceForm } from "@/features/common-master-data/departments/department-workspace-form";
import { createClient } from "@/lib/supabase/server";

export default async function NewDepartmentPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "common_md.manage") && !hasPermission(ctx, "common_md.departments.manage")) {
    redirect("/admin/common-master-data/departments");
  }
  const supabase = await createClient();
  const { data: companies } = await supabase.from("owner_companies").select("id, legal_name_en, company_code").eq("status", "active").order("legal_name_en");
  return <DepartmentWorkspaceForm mode="add" authContext={ctx} companies={companies ?? []} />;
}
