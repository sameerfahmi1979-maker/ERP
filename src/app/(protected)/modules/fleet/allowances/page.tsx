import Link from "next/link";
import { OperationsAdminOverview } from "@/features/operations/admin-overview";
import { operationsOverviewAdmission } from "@/lib/operations/admin-overview";
import { notFound } from "next/navigation";
import { ERPPageHeader } from "@/components/erp/page-header";
import { TripAllowanceWorkspace } from "@/features/fleet/trip-allowance-workspace";
import { getAuthContext } from "@/lib/rbac/check";
import { readAllowanceOrder } from "@/server/actions/fleet/trip-allowances";

export default async function TripAllowancesPage({searchParams}:{
  searchParams:Promise<Record<string,string|string[]|undefined>>;
}) {
  const {order,scope}=await searchParams;
  const actor=await getAuthContext();
  const wantsOverview = scope !== undefined && operationsOverviewAdmission(actor, false, scope) === "overview";
  const data = !wantsOverview && typeof order === "string" ? await readAllowanceOrder(Number(order)) : null;
  const canOperate = data !== null;
  const admission = operationsOverviewAdmission(actor, canOperate, scope);
  if (admission === "overview") return <OperationsAdminOverview route={"/modules/fleet/allowances"} requestedScope={scope} canOperate={canOperate} />;
  if (admission === "denied") notFound();
  if (!data) notFound();
  return <main className="space-y-5">
    <ERPPageHeader title="Trip allowances and POD" description={data.number+" · "+data.subject}
      breadcrumbs={[{label:"Fleet",href:"/modules/fleet/operations"},{label:"Trip allowances"}]} />
    <div className="flex flex-wrap gap-3 text-sm">
      <Link className="text-primary underline" href={"/modules/fleet/operations/"+data.id}>Trip and signed POD follow-up</Link>
      {data.can_payroll&&<Link className="text-primary underline" href="/admin/hr/payroll/trip-allowances">Payroll trip allowance queue</Link>}
    </div>
    <TripAllowanceWorkspace data={data}/>
  </main>;
}
