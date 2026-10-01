import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { ERPPageHeader } from "@/components/erp/page-header";
import { LoadError } from "@/components/erp/load-error";
import { CommonMasterList } from "@/features/common-master-data/common-master-list";
import { buttonVariants } from "@/components/ui/button";
import { listDmsRequiredDocumentRules } from "@/server/actions/common-master-data/dms-required-document-rules";
import Link from "next/link";

const BASE = "/admin/common-master-data/dms-required-documents";
export default async function DmsRequiredDocumentsPage() {
  const ctx = await getAuthContext();
  const canManage = hasPermission(ctx, "common_md.manage") || hasPermission(ctx, "common_md.dms_required_documents.manage");
  const result = await listDmsRequiredDocumentRules({});
  return <div className="p-4 md:p-6 space-y-4">
    <ERPPageHeader title="Required document rules" description="Required documents for each entity type"
      breadcrumbs={[{label:"Common master data",href:"/admin/common-master-data"},{label:"Required document rules"}]}
      actions={canManage ? <Link className={buttonVariants({size:"sm"})} href={BASE + "/record/new"}>Add rule</Link> : null} />
    {!result.success ? <LoadError title="Required document rules" retryHref={BASE} /> :
      <CommonMasterList title="Required document rules" basePath={BASE} fields={[{ key:"entity", label:"Entity type" }, { key:"document", label:"Document type" }, ...[{key:"required",label:"Required"},{key:"blocks",label:"Blocks activation"},{key:"active",label:"Active"}].map(field=>({...field,type:"select" as const,options:[{value:"true",label:"Yes"},{value:"false",label:"No"}]}))]}
        rows={(result.data ?? []).map(r=>({ id:r.id, name:r.rule_name, code:String(r.id), entity:r.entity_type, required:r.is_required, blocks:r.blocks_activation, active:r.is_active, document:r.document_type?.name_en ?? "" }))} />}
  </div>;
}
