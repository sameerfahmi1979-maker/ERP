import Link from "next/link";
import { OperationsAdminOverview } from "@/features/operations/admin-overview";
import { operationsOverviewAdmission } from "@/lib/operations/admin-overview";
import { notFound } from "next/navigation";
import { ERPPageHeader } from "@/components/erp/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fleetSelectClass } from "@/features/fleet/asset-form";
import { NewFleetOperation } from "@/features/fleet/operation-forms";
import { fleetId } from "@/lib/fleet/asset-contract";
import { nextActions, operationKind } from "@/lib/fleet/operations-contract";
import { getAuthContext } from "@/lib/rbac/check";
import { getOperationsChoices, listFleetOperations } from "@/server/actions/fleet/operations";

export default async function FleetOperationsPage({searchParams}:{searchParams:Promise<{q?:string;kind?:string;before?:string;scope?:string|string[]}>}) {
  const actor=await getAuthContext();
  const search=await searchParams;
  const canOperate = actor.permissionCodes.includes("fleet.operations.view");
  const admission = operationsOverviewAdmission(actor, canOperate, search.scope);
  if (admission === "overview") return <OperationsAdminOverview route={"/modules/fleet/operations"} requestedScope={search.scope} canOperate={canOperate} />;
  if (admission === "denied") notFound();
  const query=typeof search.q==="string"?search.q.trim().slice(0,160):"";
  const kind=operationKind.safeParse(search.kind);
  const cursor=fleetId.safeParse(Number(search.before));
  const [rows,choices]=await Promise.all([
    listFleetOperations(query,kind.success?kind.data:undefined,cursor.success?cursor.data:undefined),
    getOperationsChoices(),
  ]);
  const href=(before?:number)=>`/modules/fleet/operations?${new URLSearchParams({
    q:query,...(kind.success?{kind:kind.data}:{}),...(before?{before:String(before)}:{}),
  })}`;
  return <main className="space-y-5">
    <ERPPageHeader title="Dispatch, trips and rentals" breadcrumbs={[{label:"Operations"},{label:"Fleet operations"}]} />
    {choices&&<NewFleetOperation scopes={choices.scopes} />}
    <form action="/modules/fleet/operations" className="flex flex-wrap gap-2">
      <Input className="max-w-sm" name="q" aria-label="Search Fleet operations" maxLength={160} defaultValue={query}
        placeholder="Operation, job or order reference" />
      <select className={fleetSelectClass+" w-auto"} name="kind" aria-label="Operation type" defaultValue={kind.success?kind.data:""}>
        <option value="">All operations</option><option value="trip">Trips</option><option value="rental">Rentals</option>
      </select>
      <Button type="submit" variant="outline">Search</Button>
    </form>
    {rows===null?<p role="alert">The planning board could not be loaded.</p>:rows.length===0?
      <p className="text-sm text-muted-foreground">No matching Fleet operations.</p>:
      <div className="overflow-x-auto rounded-lg border"><table className="w-full text-left text-sm">
        <thead className="bg-muted/50"><tr>{["Operation","Job reference","Status","Next action"].map(label=>
          <th key={label} className="px-4 py-3 font-medium">{label}</th>)}</tr></thead>
        <tbody>{rows.slice(0,25).map(row=><tr className="border-t" key={row.id}>
          <td className="px-4 py-3"><Link href={`/modules/fleet/operations/${row.id}`} className="font-medium text-primary hover:underline">
            {row.number} · {row.subject}
          </Link><span className="block capitalize text-muted-foreground">{row.kind}</span></td>
          <td className="px-4 py-3">{row.reference}</td><td className="px-4 py-3 capitalize">{row.status}</td>
          <td className="px-4 py-3">{nextActions[row.next_action]}</td>
        </tr>)}</tbody>
      </table></div>}
    {(cursor.success||(rows?.length??0)>25)&&<nav aria-label="Fleet board pages" className="flex gap-3">
      {cursor.success&&<Link href={href()} className={buttonVariants({variant:"outline"})}>Newest</Link>}
      {rows&&rows.length>25&&<Link href={href(rows[24].id)} className={buttonVariants({variant:"outline"})}>Older operations</Link>}
    </nav>}
  </main>;
}
