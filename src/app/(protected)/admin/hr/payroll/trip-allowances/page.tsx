import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ERPPageHeader } from "@/components/erp/page-header";
import { fleetSelectClass } from "@/features/fleet/asset-form";
import { fleetPayrollReviewQuery } from "@/lib/fleet/payroll-review-query";
import { canUseApplication, getAuthContext } from "@/lib/rbac/check";
import { createClient } from "@/lib/supabase/server";
import { readAllowancePayrollOrders, readTripAllowanceCandidates } from "@/server/actions/fleet/trip-allowances";

export default async function PayrollTripAllowancesPage({searchParams}:{
  searchParams:Promise<Record<string,string|string[]|undefined>>;
}) {
  const ctx=await getAuthContext();
  const companies=[...new Set((ctx.roleAssignments??[]).flatMap(a=>a.ownerCompanyId&&
    a.permissionCodes.includes("hr.payroll.trip_allowance.review")?[a.ownerCompanyId]:[]))];
  if (!canUseApplication(ctx)||companies.length===0) notFound();
  const params=await searchParams;
  const company=params.company===undefined?companies[0]:Number(params.company);
  if (!companies.includes(company)) notFound();
  const day=z.iso.date().safeParse(params.day??new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Dubai"}).format(new Date()));
  if (!day.success) notFound();
  const review = fleetPayrollReviewQuery(company, day.data, params);
  const db=await createClient();
  const [organizations,orders,candidates]=await Promise.all([
    db.from("owner_companies").select("id,trade_name,legal_name_en").in("id",companies),
    readAllowancePayrollOrders(company, day.data, review.before),
    readTripAllowanceCandidates(company, review.cutoff, review.older),
  ]);
  return <main className="container mx-auto space-y-5 py-6">
    <ERPPageHeader title="Trip allowance review" breadcrumbs={[{label:"Payroll & WPS",href:"/admin/hr/payroll"},{label:"Trip allowances"}]} />
    <form className="flex flex-wrap items-end gap-3">
      <label className="space-y-1 text-sm"><span>Employing company</span><select className={fleetSelectClass} name="company" defaultValue={company}>
        {companies.map(id=>{
          const entity=organizations.data?.find(c=>c.id===id);
          return <option key={id} value={id}>{entity?.trade_name??entity?.legal_name_en??"Company "+id}</option>;
        })}
      </select></label>
      <label className="space-y-1 text-sm"><span>Original work date</span><Input name="day" type="date" required defaultValue={day.data} /></label>
      <label className="space-y-1 text-sm"><span>Candidate cutoff (Dubai time)</span><Input name="cutoff" type="datetime-local" step="0.001" defaultValue={review.cutoffText} /></label>
      <Button type="submit">Load</Button>
    </form>
    <section className="space-y-2">
      <h2 className="font-semibold">Loaded trips by work date</h2>
      {orders===null?<p role="status">Trips could not be loaded.</p>:orders.length===0?<p>No completed loaded legs for this date.</p>:
        <ul className="space-y-1">{orders.slice(0,25).map(o=><li key={o.id}>
          <Link className="text-primary underline" href={"/modules/fleet/allowances?order="+o.id}>{o.number} · {o.subject}</Link>
        </li>)}</ul>}
      {orders&&orders.length>25&&<Link className="text-primary underline" href={review.pageHref("/admin/hr/payroll/trip-allowances", "before", orders[24].id)}>More trips</Link>}
    </section>
    <section className="space-y-2">
      <h2 className="font-semibold">Accepted candidates available by cutoff</h2>
      {candidates===null?<p role="status">Candidates could not be loaded.</p>:candidates.length===0?<p>No available allowances for this cutoff.</p>:
        <ul className="space-y-1">{candidates.slice(0,25).map(c=><li className="rounded-md border p-2 text-sm" key={c.id}>
          {c.date} · Employee {c.employee} · {c.kind==="adjustment"?"Linked adjustment":"Loaded leg"} {c.actual} · {c.currency} {c.amount}
        </li>)}</ul>}
      {candidates&&candidates.length>25&&<Link className="text-primary underline" href={review.pageHref("/admin/hr/payroll/trip-allowances", "older", candidates[24].id)}>Older candidates</Link>}
    </section>
  </main>;
}
