import Link from "next/link";
import { OperationsAdminOverview } from "@/features/operations/admin-overview";
import { operationsOverviewAdmission } from "@/lib/operations/admin-overview";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ERPPageHeader } from "@/components/erp/page-header";
import { fleetSelectClass } from "@/features/fleet/asset-form";
import { AllowanceRateWorkspace } from "@/features/fleet/trip-allowance-workspace";
import { getAuthContext } from "@/lib/rbac/check";
import { createClient } from "@/lib/supabase/server";
import { readAllowanceRateCatalogue } from "@/server/actions/fleet/trip-allowances";

export default async function AllowanceRatesPage({searchParams}:{
  searchParams:Promise<Record<string,string|string[]|undefined>>;
}) {
  const ctx=await getAuthContext();
  const companies=[...new Set((ctx.roleAssignments??[]).flatMap(a=>a.ownerCompanyId&&a.branchId===null&&
    a.permissionCodes.some(p=>p==="fleet.allowance.rates.prepare"||p==="fleet.allowance.rates.approve")?[a.ownerCompanyId]:[]))];
  const params=await searchParams;
  const canOperate = companies.length > 0;
  const admission = operationsOverviewAdmission(ctx, canOperate, params.scope);
  if (admission === "overview") return <OperationsAdminOverview route={"/modules/fleet/allowance-rates"} requestedScope={params.scope} canOperate={canOperate} />;
  if (admission === "denied") notFound();
  const company=params.company===undefined?companies[0]:Number(params.company);
  if (!companies.includes(company)) notFound();
  const db=await createClient();
  const [names,data]=await Promise.all([
    db.from("owner_companies").select("id,trade_name,legal_name_en").in("id",companies),
    readAllowanceRateCatalogue(company,params.before===undefined?undefined:Number(params.before)),
  ]);
  if (!data) notFound();
  return <main className="space-y-5">
    <ERPPageHeader title="Trip allowance rates" breadcrumbs={[{label:"Fleet operations",href:"/modules/fleet/operations"},{label:"Rate catalogue"}]} />
    <form className="flex flex-wrap items-end gap-3">
      <label className="space-y-1 text-sm"><span>Company</span><select className={fleetSelectClass} name="company" defaultValue={company}>
        {companies.map(id=>{
          const entity=names.data?.find(c=>c.id===id);
          return <option key={id} value={id}>{entity?.trade_name??entity?.legal_name_en??"Company "+id}</option>;
        })}
      </select></label>
      <Button type="submit" size="sm">Load company rates</Button>
    </form>
    <AllowanceRateWorkspace company={company} data={data}/>
    {data.rates.length>25&&<Link className="text-primary underline" href={"/modules/fleet/allowance-rates?company="+company+"&before="+data.rates[24].id}>Older rates</Link>}
  </main>;
}
