import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect, notFound } from "next/navigation";
import { getWorkSiteById } from "@/server/actions/common-master-data/work-sites";
import { WorkSiteWorkspaceForm } from "@/features/common-master-data/work-sites/work-site-workspace-form";
import { createClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ mode?: string }> };

export default async function WorkSiteRecordPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { mode: modeParam } = await searchParams;
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "common_md.view") && !hasPermission(ctx, "common_md.work_sites.view")) redirect("/admin/common-master-data/work-sites");
  const numericId = parseInt(id);
  if (isNaN(numericId)) notFound();
  const result = await getWorkSiteById(numericId);
  if (!result.success || !result.data) notFound();
  const canManage = hasPermission(ctx, "common_md.manage") || hasPermission(ctx, "common_md.work_sites.manage");
  const mode = modeParam === "edit" && canManage ? "edit" : "view";
  const supabase = await createClient();
  const { data: companies } = await supabase.from("owner_companies").select("id, legal_name_en, company_code").eq("status", "active").order("legal_name_en");
  return <WorkSiteWorkspaceForm site={result.data} mode={mode} authContext={ctx} companies={companies ?? []} />;
}
