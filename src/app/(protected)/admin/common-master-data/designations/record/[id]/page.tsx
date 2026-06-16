import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect, notFound } from "next/navigation";
import { getDesignationById } from "@/server/actions/common-master-data/designations";
import { DesignationWorkspaceForm } from "@/features/common-master-data/designations/designation-workspace-form";
import { createClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ mode?: string }> };

export default async function DesignationRecordPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { mode: modeParam } = await searchParams;
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "common_md.view") && !hasPermission(ctx, "common_md.designations.view")) redirect("/admin/common-master-data/designations");
  const numericId = parseInt(id);
  if (isNaN(numericId)) notFound();
  const result = await getDesignationById(numericId);
  if (!result.success || !result.data) notFound();
  const canManage = hasPermission(ctx, "common_md.manage") || hasPermission(ctx, "common_md.designations.manage");
  const mode = modeParam === "edit" && canManage ? "edit" : "view";
  const supabase = await createClient();
  const { data: companies } = await supabase.from("owner_companies").select("id, legal_name_en, company_code").eq("status", "active").order("legal_name_en");
  return <DesignationWorkspaceForm designation={result.data} mode={mode} authContext={ctx} companies={companies ?? []} />;
}
