import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { ApprovalRoleWorkspaceForm } from "@/features/common-master-data/approval-roles/approval-role-workspace-form";
import { createClient } from "@/lib/supabase/server";

export default async function NewApprovalRolePage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "common_md.manage") && !hasPermission(ctx, "common_md.approval_roles.manage")) redirect("/admin/common-master-data/approval-roles");
  const supabase = await createClient();
  const { data: companies } = await supabase.from("owner_companies").select("id, legal_name_en, company_code").eq("status", "active").order("legal_name_en");
  const { data: allRoles } = await supabase.from("approval_roles").select("id, role_name, role_code").is("deleted_at", null).eq("is_active", true).order("level_number");
  return <ApprovalRoleWorkspaceForm mode="add" authContext={ctx} companies={companies ?? []} allRoles={allRoles ?? []} />;
}
