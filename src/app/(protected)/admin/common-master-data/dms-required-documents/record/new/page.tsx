import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { DmsRequiredDocumentRuleForm } from "@/features/common-master-data/dms-required-document-rules/dms-required-document-rule-form";
import { createClient } from "@/lib/supabase/server";

export default async function NewDmsRulePage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "common_md.manage") && !hasPermission(ctx, "common_md.dms_required_documents.manage")) redirect("/admin/common-master-data/dms-required-documents");
  const supabase = await createClient();
  const { data: docTypes } = await supabase.from("dms_document_types").select("id, type_code, name_en").eq("is_active", true).is("deleted_at", null).order("name_en");
  const { data: companies } = await supabase.from("owner_companies").select("id, legal_name_en").eq("status", "active").order("legal_name_en");
  return <DmsRequiredDocumentRuleForm mode="add" authContext={ctx} documentTypes={docTypes ?? []} companies={companies ?? []} />;
}
