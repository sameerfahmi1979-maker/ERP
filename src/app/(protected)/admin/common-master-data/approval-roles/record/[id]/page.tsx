import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect, notFound } from "next/navigation";
import { getApprovalRoleById } from "@/server/actions/common-master-data/approval-roles";
import { ApprovalRoleWorkspaceForm } from "@/features/common-master-data/approval-roles/approval-role-workspace-form";
import { createClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ mode?: string }> };

export default async function ApprovalRoleRecordPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { mode: modeParam } = await searchParams;
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "common_md.view") && !hasPermission(ctx, "common_md.approval_roles.view")) redirect("/admin/common-master-data/approval-roles");
  const numericId = parseInt(id);
  if (isNaN(numericId)) notFound();
  const result = await getApprovalRoleById(numericId);
  if (!result.success || !result.data) notFound();
  const canManage = hasPermission(ctx, "common_md.manage") || hasPermission(ctx, "common_md.approval_roles.manage");
  const mode = modeParam === "edit" && canManage ? "edit" : "view";
  const supabase = await createClient();
  const { data: companies } = await supabase.from("owner_companies").select("id, legal_name_en, company_code").eq("status", "active").order("legal_name_en");
  const { data: allRoles } = await supabase.from("approval_roles").select("id, role_name, role_code").is("deleted_at", null).eq("is_active", true).order("level_number");
  return <ApprovalRoleWorkspaceForm role={result.data} mode={mode} authContext={ctx} companies={companies ?? []} allRoles={allRoles ?? []} />;
}
