import Link from "next/link";
import { notFound } from "next/navigation";
import { ERPPageHeader } from "@/components/erp/page-header";
import { FinishTripOrder, FleetOperationControls } from "@/features/fleet/operation-forms";
import { fleetId } from "@/lib/fleet/asset-contract";
import { nextActions } from "@/lib/fleet/operations-contract";
import { getAuthContext } from "@/lib/rbac/check";
import { workshopPermissions } from "@/lib/workshop/workspace";
import { getFleetOperation, getOperationsChoices } from "@/server/actions/fleet/operations";

const times=new Intl.DateTimeFormat("en-AE",{timeZone:"Asia/Dubai",dateStyle:"medium",timeStyle:"short"});
const time=(value:string|null)=>value?times.format(new Date(value)):"Pending";
const label=(value:string)=>value.replaceAll("-"," ");
const retainedEvidence = (document: number, file: number | null) =>
  file === null ? `/dms/documents/record/${document}` : `/api/dms/file?fileId=${file}`;

export default async function FleetOperationPage({params}:{params:Promise<{id:string}>}) {
  const id=fleetId.safeParse(Number((await params).id));
  if (!id.success) notFound();
  const [data, actor] = await Promise.all([getFleetOperation(id.data), getAuthContext()]);
  if (!data) notFound();
  const workshopVisible = workshopPermissions.some(code => actor.permissionCodes.includes(code));
  const choices=data.can_manage?await getOperationsChoices(data.company,data.branch):null;
  return <main className="space-y-5">
    <ERPPageHeader title={data.subject} description={data.number}
      breadcrumbs={[{label:"Fleet operations",href:"/modules/fleet/operations"},{label:data.number}]} />
    <Link href={"/modules/fleet/time?order="+data.id} className="text-sm font-medium text-primary underline">Fleet time reconciliation</Link>
    {data.kind==="trip"&&<Link href={"/modules/fleet/allowances?order="+data.id}
      className="ml-3 text-sm font-medium text-primary underline">Trip allowances and POD exceptions</Link>}
    <dl className="grid gap-3 rounded-lg border p-4 sm:grid-cols-3">
      {[
        ["Status",data.status],["Next action",nextActions[data.next_action]],["Request",data.reference],
        ["Authorization",data.authorization],["Customer",data.customer],["Supplier",data.supplier],
        ["Rental arrangement",data.rental_mode],
      ].filter(([name,value])=>value!==null||name==="Authorization").map(([name,value])=><div key={name}>
        <dt className="text-sm text-muted-foreground">{name}</dt><dd className="font-medium">{value??"Pending"}</dd>
      </div>)}
    </dl>
    <FleetOperationControls data={data} choices={choices??{scopes:[],sites:[],parties:[],assets:[],workers:[]}} />
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">Resource assignments</h2>
      {data.assignments.length===0?<p className="text-sm text-muted-foreground">No assignment has been confirmed.</p>:
        <ul className="divide-y rounded-lg border px-4 text-sm">{data.assignments.map(item=><li key={item.id} className="space-y-1 py-3">
          <p><strong>Slot {item.slot}</strong> Â· {item.asset} Â· {item.worker} Â· {item.state}</p>
          <p>Planned {time(item.from)} to {time(item.until)}{item.inspected!==null&&` Â· Inspection ${item.inspected?"passed":"held"}`}</p>
          {workshopVisible && item.inspected === false && <Link href={`/modules/workshop?asset=${item.asset_id}`}
            className="text-primary hover:underline">Open Workshop assessment</Link>}
          {item.handover_approved&&<p>Named rental handover approved</p>}
          <p className="text-muted-foreground">Actual handover {time(item.handover)} Â· Actual return {time(item.return)}
            {item.planned_return&&` Â· Current planned return ${time(item.planned_return)}`}</p>
        </li>)}</ul>}
    </section>
    {data.kind==="trip"?<>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Trip legs and delivery</h2>
        {data.legs.length===0?<p className="text-sm text-muted-foreground">No planned legs.</p>:
          <ol className="divide-y rounded-lg border px-4 text-sm">{data.legs.map(leg=><li key={leg.id} className="space-y-1 py-3">
            <p><strong>Leg {leg.sequence}</strong> Â· Planned {leg.origin} to {leg.destination} Â· {leg.load}
              {leg.cargo&&` Â· ${leg.cargo}`}</p>
            {leg.departed&&<p>Actual {leg.actual_origin} to {leg.actual_destination} Â· {leg.actual_load}
              {leg.net_kg!==null&&` Â· ${leg.net_kg} kg net`} Â· {time(leg.departed)} to {time(leg.arrived)}</p>}
            <p className="text-muted-foreground">Delivery proof {leg.delivery?label(leg.delivery):"pending"}
              {leg.delivery==="accepted"&&!leg.pod_current&&" Â· Updated signed proof required"}
              {leg.discrepancy&&` Â· ${leg.discrepancy}`}</p>
          </li>)}</ol>}
      </section>
      {data.papers.length>0&&<section className="space-y-2">
        <h2 className="text-lg font-semibold">Trip Orders</h2>
        <ul className="divide-y rounded-lg border px-4 text-sm">{data.papers.map(paper=><li key={paper.id} className="py-2">
          {paper.ready?<><Link href={`/print/fleet-trip-order/${data.id}/${paper.id}`} prefetch={false} className="font-medium text-primary hover:underline">
            {paper.label} PDF
          </Link> Â· {time(paper.issued)}</>:<>{paper.label} Â· PDF pending {paper.can_finalize&&<FinishTripOrder order={data.id} issue={paper.id} />}</>}
        </li>)}</ul>
      </section>}
    </>:<>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Rental milestones and usage</h2>
        <ul className="divide-y rounded-lg border px-4 text-sm">
          {data.rental_events.map(item=><li key={item.id} className="py-2">
            <span className="capitalize">{label(item.kind)}</span> Â· {time(item.at)} Â· {item.reason}
          </li>)}
          {data.usage.map(item=><li key={`usage-${item.id}`} id={`usage-${item.id}`} className="py-2">
            <strong>{item.state} sheet interval</strong> Â· {time(item.from)} to {time(item.until)}{item.reason&&` Â· ${item.reason}`}
            {!item.evidence_current&&" Â· Updated proof required"}
            {item.document&&<Link prefetch={false} className="ml-2 text-primary hover:underline" href={retainedEvidence(item.document, null)}>Signed sheet</Link>}
          </li>)}
        </ul>
      </section>
      {data.can_commercial&&<section className="space-y-2">
        <h2 className="text-lg font-semibold">Commercial review</h2>
        <ul className="divide-y rounded-lg border px-4 text-sm">
          {data.terms.map(item=><li key={`terms-${item.id}`} className="py-2">
            <strong>{item.approved?"Approved terms":"Terms pending approval"}</strong> Â· Quote {item.quote} Â· LPO {item.lpo}
            {" Â· "}{item.currency} {item.rate} per {item.unit} Â· Ceiling {item.ceiling}
            {item.document&&<a className="ml-2 text-primary hover:underline" href={retainedEvidence(item.document, item.file)}>
              Signed agreement, version {item.version}, file {item.file}
            </a>}
          </li>)}
          {data.statements.map(item=><li key={`statement-${item.id}`} className="py-2">
            <strong>{item.approved?"Approved statement":"Statement pending approval"}</strong> Â· {item.quantity} hours Â· {item.amount}
            {item.supersedes&&` Â· Amends statement ${item.supersedes}`}
            {item.usage.length>0&&<ul className="mt-1 list-inside list-disc">
              {item.usage.map(source=><li key={source.id}>
                <a href={`#usage-${source.id}`} className="text-primary hover:underline">Usage {source.id}</a>
                {source.document&&<> Â· <a className="text-primary hover:underline" href={retainedEvidence(source.document, source.file)}>
                  Sheet {source.reference}, version {source.version}, file {source.file}
                </a></>}
              </li>)}
            </ul>}
          </li>)}
        </ul>
      </section>}
    </>}
    <details className="space-y-2">
      <summary className="cursor-pointer font-semibold">Operation history</summary>
      <ul className="divide-y rounded-lg border px-4 text-sm">{data.history.map(item=><li key={item.id} className="py-2">
        {time(item.at)} Â· <span className="capitalize">{label(item.action)}</span> Â· {item.reason}
      </li>)}</ul>
    </details>
  </main>;
}
