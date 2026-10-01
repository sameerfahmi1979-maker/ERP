import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { ERPPageHeader } from "@/components/erp/page-header";
import { LoadError } from "@/components/erp/load-error";
import { CommonMasterList } from "@/features/common-master-data/common-master-list";
import { buttonVariants } from "@/components/ui/button";
import { listWorkSites } from "@/server/actions/common-master-data/work-sites";
import Link from "next/link";

const BASE = "/admin/common-master-data/work-sites";
export default async function WorkSitesPage() {
  const ctx = await getAuthContext();
  const canManage = hasPermission(ctx, "common_md.manage") || hasPermission(ctx, "common_md.work_sites.manage");
  const result = await listWorkSites({});
  return <div className="p-4 md:p-6 space-y-4">
    <ERPPageHeader title="Work sites" description="Operational locations, yards, workshops, and facilities"
      breadcrumbs={[{label:"Common master data",href:"/admin/common-master-data"},{label:"Work sites"}]}
      actions={canManage ? <Link className={buttonVariants({size:"sm"})} href={BASE + "/record/new"}>Add work site</Link> : null} />
    {!result.success ? <LoadError title="Work sites" retryHref={BASE} /> :
      <CommonMasterList title="Work sites" basePath={BASE} fields={[{ key:"type", label:"Type" }, { key:"status", label:"Status" }, { key:"company", label:"Company" }]}
        rows={(result.data ?? []).map(r=>({ id:r.id, name:r.site_name, code:r.site_code, type:r.site_type, status:r.status, company:r.owner_company?.legal_name_en ?? "" }))} />}
  </div>;
}
