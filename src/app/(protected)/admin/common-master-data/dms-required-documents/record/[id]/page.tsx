import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect, notFound } from "next/navigation";
import { getDmsRequiredDocumentRuleById } from "@/server/actions/common-master-data/dms-required-document-rules";
import { DmsRequiredDocumentRuleForm } from "@/features/common-master-data/dms-required-document-rules/dms-required-document-rule-form";
import { createClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ mode?: string }> };

export default async function DmsRuleRecordPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { mode: modeParam } = await searchParams;
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "common_md.view") && !hasPermission(ctx, "common_md.dms_required_documents.view")) redirect("/admin/common-master-data/dms-required-documents");
  const numericId = parseInt(id);
  if (isNaN(numericId)) notFound();
  const result = await getDmsRequiredDocumentRuleById(numericId);
  if (!result.success || !result.data) notFound();
  const canManage = hasPermission(ctx, "common_md.manage") || hasPermission(ctx, "common_md.dms_required_documents.manage");
  const mode = modeParam === "edit" && canManage ? "edit" : "view";
  const supabase = await createClient();
  const { data: docTypes } = await supabase.from("dms_document_types").select("id, type_code, name_en").eq("is_active", true).is("deleted_at", null).order("name_en");
  const { data: companies } = await supabase.from("owner_companies").select("id, legal_name_en").eq("status", "active").order("legal_name_en");
  return <DmsRequiredDocumentRuleForm rule={result.data} mode={mode} authContext={ctx} documentTypes={docTypes ?? []} companies={companies ?? []} />;
}
