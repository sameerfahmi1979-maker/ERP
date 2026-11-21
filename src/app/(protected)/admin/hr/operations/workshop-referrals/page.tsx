import Link from "next/link";
import { OperationsAdminOverview } from "@/features/operations/admin-overview";
import { operationsOverviewAdmission } from "@/lib/operations/admin-overview";
import { notFound } from "next/navigation";
import { ERPPageHeader } from "@/components/erp/page-header";
import { buttonVariants } from "@/components/ui/button";
import { fleetId } from "@/lib/fleet/asset-contract";
import { getAuthContext } from "@/lib/rbac/check";
import { findingKinds } from "@/lib/workshop/workspace";
import { readWorkshopReferrals } from "@/server/actions/workshop/workshop";

const time = new Intl.DateTimeFormat("en-AE", { timeZone: "Asia/Dubai", dateStyle: "medium", timeStyle: "short" });

export default async function WorkshopReferralsPage({ searchParams }: { searchParams: Promise<{ before?: string; scope?: string | string[] }> }) {
  const actor = await getAuthContext();
  const params = await searchParams;
  const canOperate = actor.permissionCodes.includes("hr.workshop.referrals.view");
  const admission = operationsOverviewAdmission(actor, canOperate, params.scope);
  if (admission === "overview") return <OperationsAdminOverview route={"/admin/hr/operations/workshop-referrals"} requestedScope={params.scope} canOperate={canOperate} />;
  if (admission === "denied") notFound();
  const before = fleetId.safeParse(Number(params.before)).data;
  const items = await readWorkshopReferrals(before);
  return <main className="space-y-4">
    <ERPPageHeader title="Workshop referrals" description="Review cases with recorded evidence of possible employee responsibility."
      breadcrumbs={[{ label: "Human Resources" }, { label: "Workshop referrals" }]} />
    {!items ? <p className="rounded-lg border p-4 text-sm" role="alert">Workshop referrals could not be loaded.</p> :
      items.length === 0 ? <p className="text-sm text-muted-foreground">No Workshop referrals in your scope.</p> :
      <ul className="divide-y rounded-lg border bg-card px-4">{items.map(item => <li key={item.id} className="space-y-2 py-4 text-sm">
        <h2 className="font-semibold">{item.employee} · {item.asset_no}</h2>
        <p className="text-muted-foreground">{findingKinds[item.source_kind]} · {time.format(new Date(item.occurred_at))} · Referred {time.format(new Date(item.referred_at))}</p>
        <p>{item.reason}</p>
        <p>Workshop diagnosis · {item.diagnosis}</p>
        {item.proof && <a className="font-medium text-primary hover:underline" href={`/api/dms/file?fileId=${item.proof}`}>View retained original</a>}
      </li>)}</ul>}
    {items?.length === 30 && <Link className={buttonVariants({ variant: "outline" })}
      href={`/admin/hr/operations/workshop-referrals?before=${items[29].id}`}>Older referrals</Link>}
  </main>;
}
