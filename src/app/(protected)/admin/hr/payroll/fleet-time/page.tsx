import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ERPPageHeader } from "@/components/erp/page-header";
import { FleetPayrollReview } from "@/features/fleet/time-workspace";
import { fleetSelectClass } from "@/features/fleet/asset-form";
import { fleetTimeDate } from "@/lib/fleet/time-contract";
import { getAuthContext, canUseApplication } from "@/lib/rbac/check";
import { createClient } from "@/lib/supabase/server";
import { readFleetPayrollCandidates, readFleetPayrollQueue } from "@/server/actions/fleet/rental-time";

export default async function FleetPayrollPage({searchParams}: {searchParams: Promise<Record<string, string | string[] | undefined>>}) {
  const ctx = await getAuthContext();
  const companies = [...new Set((ctx.roleAssignments ?? []).filter(a => a.permissionCodes.includes("hr.payroll.fleet_time.review"))
    .flatMap(a => a.ownerCompanyId ? [a.ownerCompanyId] : []))];
  if (!canUseApplication(ctx) || companies.length === 0) notFound();
  const params = await searchParams;
  const employer = params.company === undefined ? companies[0] : Number(params.company);
  if (!companies.includes(employer)) notFound();
  const workDate = params.day === undefined ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date()) : params.day;
  const day = fleetTimeDate.safeParse(workDate);
  if (!day.success) notFound();
  const cutoffText = typeof params.cutoff === "string" && /^\d{4}-\d{2}-\d{2}T\d\d:\d\d$/.test(params.cutoff) ? params.cutoff : "";
  const cutoff = cutoffText ? cutoffText + ":00+04:00" : new Date().toISOString();
  const before = params.before === undefined ? undefined : Number(params.before);
  const candidateBefore = params.older === undefined ? undefined : Number(params.older);
  const db = await createClient();
  const [organizations, queue, candidates] = await Promise.all([
    db.from("owner_companies").select("id,trade_name,legal_name_en").in("id", companies),
    readFleetPayrollQueue(employer, day.data, before),
    readFleetPayrollCandidates(employer, cutoff, candidateBefore),
  ]);
  const query = new URLSearchParams({ company: String(employer), day: day.data, ...(cutoffText ? {cutoff:cutoffText} : {}) });
  const queryLink = (key: string, value: number) => "/admin/hr/payroll/fleet-time?" + new URLSearchParams([...query, [key, String(value)]]);
  return <main className="container mx-auto space-y-5 py-6">
    <ERPPageHeader title="Fleet overtime review" breadcrumbs={[{label:"Payroll & WPS",href:"/admin/hr/payroll"},{label:"Fleet overtime"}]} />
    <form className="flex flex-wrap items-end gap-3">
      <label className="space-y-1 text-sm"><span>Employing company</span>
        <select className={fleetSelectClass} name="company" defaultValue={employer}>
          {companies.map(id => {
            const company = organizations.data?.find(c => c.id === id);
            return <option key={id} value={id}>{company?.trade_name ?? company?.legal_name_en ?? "Company " + id}</option>;
          })}
        </select>
      </label>
      <label className="space-y-1 text-sm"><span>Original work date</span><Input name="day" type="date" defaultValue={day.data} required /></label>
      <label className="space-y-1 text-sm"><span>Candidate cutoff (Dubai time)</span><Input name="cutoff" type="datetime-local" defaultValue={cutoffText} /></label>
      <Button type="submit">Load</Button>
    </form>
    <section className="space-y-2">
      <h2 className="font-semibold">Overtime review by work date</h2>
      {queue === null ? <p role="status">Fleet work could not be loaded.</p> :
        queue.length === 0 ? <p className="text-sm text-muted-foreground">No Fleet work is available for this date.</p> :
          queue.slice(0, 25).map(row => <FleetPayrollReview key={row.work} row={row} />)}
      {queue && queue.length > 25 && <Link className="text-primary underline" href={queryLink("before",queue[24].work)}>More work</Link>}
    </section>
    <section className="space-y-2">
      <h2 className="font-semibold">Verified candidates available by cutoff</h2>
      <p className="text-sm text-muted-foreground">Late evidence keeps the original work date and becomes available when Accounts accepts it.</p>
      {candidates === null ? <p role="status">Candidates could not be loaded.</p> :
        candidates.length === 0 ? <p className="text-sm text-muted-foreground">No available overtime for this cutoff.</p> :
          <ul className="space-y-1">{candidates.slice(0, 25).map(row => <li key={row.id} className="rounded-md border p-2 text-sm">
            {row.date} · Employee {row.employee} · {row.minutes} minutes · {row.currency} {row.amount} · Fleet source {row.work}
          </li>)}</ul>}
      {candidates && candidates.length > 25 && <Link className="text-primary underline" href={queryLink("older",candidates[24].id)}>Older candidates</Link>}
    </section>
  </main>;
}
