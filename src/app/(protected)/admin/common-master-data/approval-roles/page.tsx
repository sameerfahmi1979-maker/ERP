import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { ERPPageHeader } from "@/components/erp/page-header";
import { LoadError } from "@/components/erp/load-error";
import { CommonMasterList } from "@/features/common-master-data/common-master-list";
import { buttonVariants } from "@/components/ui/button";
import { listApprovalRoles } from "@/server/actions/common-master-data/approval-roles";
import Link from "next/link";

const BASE = "/admin/common-master-data/approval-roles";
export default async function ApprovalRolesPage() {
  const ctx = await getAuthContext();
  const canManage = hasPermission(ctx, "common_md.manage") || hasPermission(ctx, "common_md.approval_roles.manage");
  const result = await listApprovalRoles({});
  return <div className="p-4 md:p-6 space-y-4">
    <ERPPageHeader title="Approval roles" description="Approval authority levels and delegation rules"
      breadcrumbs={[{label:"Common master data",href:"/admin/common-master-data"},{label:"Approval roles"}]}
      actions={canManage ? <Link className={buttonVariants({size:"sm"})} href={BASE + "/record/new"}>Add approval role</Link> : null} />
    {!result.success ? <LoadError title="Approval roles" retryHref={BASE} /> :
      <CommonMasterList title="Approval roles" basePath={BASE} fields={[{ key:"level", label:"Level", type:"number" }, { key:"scope", label:"Scope" }, { key:"limit", label:"Amount limit", type:"number" }, { key:"currency", label:"Currency" }, { key:"active", label:"Active", type:"select", options:[{value:"true",label:"Yes"},{value:"false",label:"No"}] }]}
        rows={(result.data ?? []).map(r=>({ id:r.id, name:r.role_name, code:r.role_code, level:r.level_number, scope:r.scope, limit:r.amount_limit == null ? null : Number(r.amount_limit), currency:r.currency_code ?? "", active:r.is_active }))} />}
  </div>;
}
