import Link from "next/link";
import { notFound } from "next/navigation";
import { ERPPageHeader } from "@/components/erp/page-header";
import { FleetTimeWorkspace } from "@/features/fleet/time-workspace";
import { readFleetOrderTime, readFleetReceivingOrders } from "@/server/actions/fleet/rental-time";

export default async function FleetTimePage({searchParams}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const order = Number(params.order);
  const before = params.before === undefined ? undefined : Number(params.before);
  if (params.order === undefined) {
    const received = await readFleetReceivingOrders(before);
    return <main className="space-y-5">
      <ERPPageHeader title="Fleet time" description="Temporary assignments received by your branch" />
      {received === null ? <p role="status">Receiving assignments could not be loaded.</p> :
        received.length === 0 ? <p className="text-sm text-muted-foreground">No receiving assignments are available.</p> :
          <ul className="divide-y rounded-md border px-3">{received.slice(0,25).map(item => <li key={item.id} className="py-2">
            <Link className="text-primary underline" href={"/modules/fleet/time?order="+item.id}>{item.number} · {item.subject}</Link>
            {item.pending && <span> · Receiving approval pending</span>}
          </li>)}</ul>}
      {received && received.length>25 &&
        <Link className="text-primary underline" href={"/modules/fleet/time?before="+received[24].id}>Older assignments</Link>}
      <Link className="text-primary underline" href="/modules/fleet/operations">Open the Fleet operations board</Link>
    </main>;
  }
  const work = await readFleetOrderTime(order, before);
  if (!work) notFound();
  return <main className="space-y-5">
    <ERPPageHeader title="Fleet time" description={work.number + " · " + work.subject}
      breadcrumbs={[{label:"Fleet operations",href:"/modules/fleet/operations"},{label:"Time reconciliation"}]} />
    <FleetTimeWorkspace data={work} />
    {work.work.length > 25 && <Link className="text-primary underline" href={"/modules/fleet/time?order=" + order + "&before=" + work.work[24].id}>Older work</Link>}
  </main>;
}
