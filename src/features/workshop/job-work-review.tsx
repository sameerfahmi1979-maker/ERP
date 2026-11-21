import Link from "next/link";
import { OperationsAdminOverview } from "@/features/operations/admin-overview";
import { operationsOverviewAdmission } from "@/lib/operations/admin-overview";
import { notFound } from "next/navigation";
import { ERPPageHeader } from "@/components/erp/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dubaiBusinessDate } from "@/lib/dubai-calendar";
import { fleetId } from "@/lib/fleet/asset-contract";
import { getAuthContext } from "@/lib/rbac/check";
import { listWorkshopReviewScopes, readWorkshopHrQueue, readWorkshopPayroll } from "@/server/actions/workshop/labour";
import { JobWorkForm } from "./job-work-form";

const time = new Intl.DateTimeFormat("en-AE", { timeStyle: "short", timeZone: "Asia/Dubai" });
const timestamp = new Intl.DateTimeFormat("en-AE", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dubai" });

function Segments({ label, rows }: { label: string; rows: { from: string; until: string }[] }) {
  if (rows.length === 0) return null;
  return <p>{label} · {rows.map(row => time.format(new Date(row.from)) + "–" + time.format(new Date(row.until))).join(", ")}</p>;
}

export async function WorkshopWorkReview({ mode, query }: {
  mode: "hr" | "accounts"; query: { branch?: string; before?: string; through?: string; cutoff?: string; scope?: string | string[] };
}) {
  const hr = mode === "hr";
  const root = hr ? "/admin/hr/operations/workshop-labour" : "/admin/hr/payroll/workshop";
  const title = hr ? "Workshop time review" : "Workshop overtime for payroll";
  const actor = await getAuthContext();
  const needed = hr ? ["hr.workshop.labour.review", "hr.attendance.view"] : ["hr.payroll.workshop.review", "hr.payroll.view"];
  const canOperate = needed.every(code => actor.permissionCodes.includes(code));
  if (hr) {
    const admission = operationsOverviewAdmission(actor, canOperate, query.scope);
    if (admission === "overview") return <OperationsAdminOverview route={"/admin/hr/operations/workshop-labour"} requestedScope={query.scope} canOperate={canOperate} />;
    if (admission === "denied") notFound();
  } else if (!canOperate) notFound();

  const scopes = await listWorkshopReviewScopes(mode);
  if (hr && scopes?.length === 0 && operationsOverviewAdmission(actor, false, query.scope) === "overview") {
    return <OperationsAdminOverview route="/admin/hr/operations/workshop-labour" requestedScope={query.scope} canOperate={false} />;
  }
  const requested = fleetId.safeParse(Number(query.branch)).data;
  const scope = requested ? scopes?.find(row => row.id === requested) : scopes?.length === 1 ? scopes[0] : undefined;
  const before = fleetId.safeParse(Number(query.before)).data;
  const today = dubaiBusinessDate();
  const through = query.through || today;
  const cutoff = query.cutoff || today;
  const validDates = /^\d{4}-\d\d-\d\d$/.test(through) && /^\d{4}-\d\d-\d\d$/.test(cutoff);
  const records = hr && scope ? await readWorkshopHrQueue(scope.id, before) : null;
  const pay = !hr && scope && validDates ? await readWorkshopPayroll(scope.id, through, cutoff + "T23:59:59+04:00", before) : null;
  const nextUrl = (id: number) => root + "?" + new URLSearchParams({ branch: String(scope?.id), before: String(id), through, cutoff });
  return <main className="space-y-4">
    <ERPPageHeader title={title} description={scope ? scope.company + " · " + scope.name : undefined}
      breadcrumbs={[{ label: "Human Resources" }, { label: title }]} />
    {!scopes ? <p role="alert">Branch choices could not be loaded.</p> :
      !scopes.length ? <p className="text-muted-foreground">No assigned review scopes.</p> :
      <nav aria-label="Employing branch" className="flex flex-wrap gap-2">{scopes.map(row =>
        <Link key={row.id} className="rounded-md border px-3 py-2 text-sm aria-[current=page]:bg-muted" href={root + "?branch=" + row.id}
          aria-current={scope?.id === row.id ? "page" : undefined}>{row.company} · {row.name}</Link>)}</nav>}
    {!hr && scope && <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
      <input name="branch" type="hidden" value={scope.id} />
      <label className="grid gap-1 text-sm">Work through date<Input type="date" name="through" required defaultValue={through} /></label>
      <label className="grid gap-1 text-sm">Evidence cutoff (end of Dubai day)<Input type="date" name="cutoff" required defaultValue={cutoff} /></label>
      <Button type="submit" variant="outline">Apply dates</Button>
    </form>}
    {scope && hr && <section className="space-y-3">
      {!records ? <p role="alert">Workshop time could not be loaded.</p> :
        !records.length ? <p className="text-muted-foreground">No signed versions waiting in this scope.</p> :
        records.map(row => <article className="space-y-2 rounded-lg border bg-card p-4 text-sm" key={row.id}>
          <h2 className="font-semibold">{row.employee} · {row.day} · Signed version #{row.id}</h2>
          <p className="capitalize">{row.status.replaceAll("-", " ")} · {row.minutes} signed minutes
            {row.eligible_minutes !== null && ` · ${row.eligible_minutes} eligible`}</p>
          <p>{time.format(new Date(row.from))}–{time.format(new Date(row.until))}{row.cost_status === "rate-required" && " · Workshop cost rate required"}</p>
          <Segments label="Eligible" rows={row.eligible_segments} />
          <Segments label="Held for overlap" rows={row.conflicted_segments} />
          <Segments label="Outside approved attendance" rows={row.unmatched_segments} />
          {row.file && <a className="text-primary hover:underline" href={`/api/dms/file?fileId=${row.file}`}>Signed original</a>}
          {row.candidate ? <p>Payroll candidate #{row.candidate} recorded</p> :
            row.can_review && row.digest && <JobWorkForm parent={row.id} family="hr" action="review" label="Accept these exact eligible segments" constants={{ digest: row.digest }} />}
          {row.can_review && row.previous_claims.length > 0 && <details>
            <summary className="mb-2 cursor-pointer">Add a linked correction for previously claimed time</summary>
            {row.previous_claims.map(claim => <div key={claim.id} className="space-y-1 py-2">
              <p>Claim #{claim.id} · Retained interval {claim.portion}</p>
              <JobWorkForm parent={claim.id} family="correction" action="propose" label="Propose removed claimed time"
                constants={{ replacement: row.id }} fields={[
                  { key: "from", kind: "time", label: "Removed from (Dubai)" },
                  { key: "until", kind: "time", label: "Removed until (Dubai)" },
                ]} />
            </div>)}
          </details>}
        </article>)}
      {records?.length === 50 && <Link className="text-primary hover:underline" href={nextUrl(records[49].id)}>Older versions</Link>}
    </section>}
    {scope && !hr && <section className="space-y-3">
      {!pay ? <p role="alert">Check the cutoff and work date or try loading again.</p> : <>
        <h2 className="font-semibold">Eligible overtime</h2>
        {!pay.candidates.length && <p className="text-muted-foreground">No eligible Workshop time at this cutoff.</p>}
        {pay.candidates.map(row => <article className="space-y-1 rounded-lg border bg-card p-4 text-sm" key={row.id}>
          <h3 className="font-semibold">{row.employee} · {row.day} · Candidate #{row.id}</h3>
          <p>{row.remaining_minutes} minutes remaining · {row.currency} {row.amount.toFixed(2)} · Signed version #{row.version_id}</p>
          <Segments label="Unclaimed intervals" rows={row.remaining_segments} />
          <p>Available since {timestamp.format(new Date(row.available_at))}</p>
        </article>)}
        {pay.candidates.length === 50 && <Link className="text-primary hover:underline" href={nextUrl(pay.candidates[49].id)}>Older candidates</Link>}
        <h2 className="font-semibold">Linked corrections</h2>
        {!pay.corrections.length && <p className="text-muted-foreground">No outstanding corrections at this cutoff.</p>}
        {pay.corrections.map(row => <article className="space-y-2 rounded-lg border bg-card p-4 text-sm" key={row.id}>
          <h3 className="font-semibold">{row.employee} · {row.day} · Correction #{row.id}</h3>
          <p>{row.minutes} minutes · {row.currency} {row.amount.toFixed(2)} · Original claim #{row.claim_id}</p><p>{row.reason}</p>
          {row.available_at && <p>{row.current ? "Approved adjustment" : "Evidence changed after approval"}</p>}
          {!row.current && row.independent && <JobWorkForm parent={row.claim_id} family="correction" action="withdraw"
            label="Withdraw stale adjustment" constants={{ correction: row.id }} />}
          {!row.available_at && row.current && row.independent && <JobWorkForm parent={row.claim_id} family="correction" action="approve"
              label="Approve linked adjustment" constants={{ correction: row.id }} />}
        </article>)}
      </>}
    </section>}
  </main>;
}
