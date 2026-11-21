"use client";

import type { FormEvent, ReactNode } from "react";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FleetAttendanceDraft, FleetPayrollRow, FleetTimeOrder } from "@/lib/fleet/time-contract";
import { outputPath } from "@/lib/official-documents/operational-output";
import { fileInternalSheet, readInternalSheetChoices } from "@/server/actions/fleet/internal-sheets";
import { acceptFleetOvertime, reviewFleetAttendance, saveFleetTime } from "@/server/actions/fleet/rental-time";
import { FleetField, fleetSelectClass } from "@/features/fleet/asset-form";

const format = new Intl.DateTimeFormat("en-AE", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dubai" });
const time = (value: string) => format.format(new Date(value));
const label = (value: string) => value.replaceAll("-", " ");
const dubai = (value: FormDataEntryValue | null) => value ? String(value) + ":00+04:00" : undefined;

type Result = { id?: number; error?: string; uncertain?: boolean };
function ReviewForm({ action, children, submit, withReason = true }: {
  action: string; children?: ReactNode; withReason?: boolean; submit: (operation: string, data: FormData) => Promise<Result>;
}) {
  const router = useRouter();
  const original = useRef<{ id: string; data: FormData; submit: typeof submit } | null>(null);
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);
  const [retry, setRetry] = useState(false);
  const [feedback, setFeedback] = useState("");
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    original.current ??= { id: crypto.randomUUID(), data: new FormData(event.currentTarget), submit };
    try {
      const result = await original.current.submit(original.current.id, original.current.data);
      setRetry(Boolean(result.uncertain));
      if (!result.uncertain) original.current = null;
      setFeedback(result.error ?? "Saved.");
      if (result.id) router.refresh();
    } catch {
      setRetry(true);
      setFeedback("Outcome unconfirmed. Retry the original request.");
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  return <form className="space-y-2 rounded-md border p-3" onSubmit={send}>
    <fieldset className="grid gap-3 sm:grid-cols-2" disabled={saving || retry}>
      {children}
      {withReason && <FleetField label="Reason"><Input name="reason" required maxLength={500} /></FleetField>}
    </fieldset>
    <Button type="submit" size="sm" disabled={saving}>{saving ? "Saving…" : retry ? "Retry original request" : action}</Button>
    {feedback && <p role="status" className="text-sm">{feedback}</p>}
  </form>;
}

function InternalSheetFiling({ work }: { work: number }) {
  const [choices, setChoices] = useState<Awaited<ReturnType<typeof readInternalSheetChoices>> | undefined>();
  const [loading, setLoading] = useState(false);
  async function load() {
    setLoading(true);
    try {
      setChoices(await readInternalSheetChoices(work));
    } catch {
      setChoices(null);
    } finally {
      setLoading(false);
    }
  }
  return <div className="space-y-2">
    <Button type="button" size="sm" variant="outline" onClick={load} disabled={loading}>
      {loading ? "Finding originals…" : "Find signed internal sheets"}
    </Button>
    {choices === null && <p role="status">The originals could not be loaded in this scope.</p>}
    {choices?.length === 0 && <p role="status">No eligible originals. File the signed internal sheet in DMS and link it to this asset.</p>}
    {!!choices?.length && <ReviewForm withReason={false} action="File signed internal sheet" submit={(operation, data) => {
      const choice = choices.find(item => String(item.file) === data.get("signedFile"));
      if (!choice) return Promise.resolve({ error: "Choose the original reviewed in DMS." });
      return fileInternalSheet({ operation, work, original: { document: choice.document, version: choice.version, file: choice.file } });
    }}>
      <FleetField label="Verified DMS original">
        <select className={fleetSelectClass} name="signedFile" defaultValue="" required>
          <option value="" disabled>Choose the original reviewed in DMS</option>
          {choices.map(item => <option key={item.file} value={item.file}>{item.reference} · {item.label}</option>)}
        </select>
      </FleetField>
    </ReviewForm>}
  </div>;
}

function Times() {
  return <>
    <FleetField label="Work from (Dubai time)"><Input name="from" type="datetime-local" required /></FleetField>
    <FleetField label="Work until (Dubai time)"><Input name="until" type="datetime-local" required /></FleetField>
  </>;
}

export function FleetTimeWorkspace({data}: {data: FleetTimeOrder}) {
  const hostChoices = data.hosts.filter(host => host.can_record);
  const allowed = data.assignments.filter(a => data.can_record || hostChoices.some(h => h.assignment === a.id));
  const [assignment, setAssignment] = useState("");
  const hosts = hostChoices.filter(host => host.assignment === Number(assignment));
  return <div className="space-y-5">
    {allowed.length > 0 && <section className="space-y-2">
      <h2 className="font-semibold">Record actual work</h2>
      <p className="text-sm text-muted-foreground">Enter each period worked. Leave breaks and gaps between periods.</p>
      <ReviewForm action="Record work" submit={(operation, f) => saveFleetTime({ operation, order: data.id, action: "record",
        data: { assignment: Number(f.get("assignment")), host: f.get("host") ? Number(f.get("host")) : undefined,
          from: dubai(f.get("from")), until: dubai(f.get("until")), reason: f.get("reason") },
      })}>
        <FleetField label="Assigned asset and worker"><select name="assignment" className={fleetSelectClass} required value={assignment}
          onChange={event => setAssignment(event.target.value)}>
          <option value="">Choose an assignment</option>
          {allowed.map(a => <option key={a.id} value={a.id}>{a.asset} · {a.employee}</option>)}
        </select></FleetField>
        {hosts.length > 0 && <FleetField label="Receiving branch"><select key={assignment} name="host" className={fleetSelectClass} required={!data.can_record}>
          <option value="">{data.can_record ? "Use the original branch" : "Choose the receiving branch"}</option>
          {hosts.map(h => <option key={h.id} value={h.id}>{h.company} · {h.branch} · {time(h.from)} to {time(h.until)}</option>)}
        </select></FleetField>}
        <Times />
      </ReviewForm>
    </section>}
    {(data.hosts.length > 0 || data.can_propose) && <details className="space-y-2">
      <summary className="cursor-pointer font-semibold">Temporary receiving company</summary>
      {data.can_propose && data.assignments.length > 0 &&
        <ReviewForm action="Request receiving branch" submit={(operation, f) => saveFleetTime({ operation, order: data.id, action: "propose-host",
          data: { assignment: Number(f.get("assignment")), company: Number(f.get("company")), branch: Number(f.get("branch")), site: Number(f.get("site")),
            from: dubai(f.get("from")), until: dubai(f.get("until")), reason: f.get("reason") },
        })}>
          <FleetField label="Named assignment"><select name="assignment" className={fleetSelectClass} required>
            {data.assignments.map(a => <option key={a.id} value={a.id}>{a.asset} · {a.employee}</option>)}
          </select></FleetField>
          <FleetField label="Receiving company ID"><Input name="company" type="number" min={1} required /></FleetField>
          <FleetField label="Receiving branch ID"><Input name="branch" type="number" min={1} required /></FleetField>
          <FleetField label="Receiving work site ID"><Input name="site" type="number" min={1} required /></FleetField>
          <Times />
        </ReviewForm>}
      {data.hosts.map(h => <div key={h.id} className="space-y-2 rounded-md border p-3">
        <p className="text-sm">{h.company} · {h.branch} · {time(h.from)} to {time(h.until)} · {h.accepted ? "Accepted" : "Awaiting receiving approval"}</p>
        {h.can_accept && <ReviewForm action="Accept receiving assignment" submit={(operation, f) => saveFleetTime({ operation, order: data.id,
          action: "accept-host", data: { host: h.id, reason: f.get("reason") },
        })} />}
      </div>)}
    </details>}
    <section className="space-y-2">
      <h2 className="font-semibold">Recorded and reconciled time</h2>
      {data.work.length === 0 && <p className="text-sm text-muted-foreground">No work intervals are recorded.</p>}
      {data.work.slice(0, 25).map(w => <article key={w.id} className="space-y-2 rounded-md border p-3 text-sm">
        <h3 className="font-medium">{w.employee} · {w.host} · {time(w.from)} to {time(w.until)}</h3>
        <p>{w.minutes} minutes worked · {w.matched_minutes} verified · {w.minutes - w.matched_minutes} awaiting evidence or review</p>
        <p>{label(w.activity)} · {w.attendance_linked ? "HR attendance linked" : "HR review pending"} · {w.payroll_reviewed ? "Payroll review recorded" : "Payroll review pending"}</p>
        <p>{w.eligibility === "ready" ? w.eligible_minutes + " overtime minutes eligible" : "Overtime " + label(w.eligibility)}</p>
        {w.can_print && <a className="text-primary underline" href={outputPath("timesheet", w.id)}>Print timesheet record</a>}
        {w.sources.length > 0 && <ul className="space-y-1">{w.sources.map(s => <li key={s.usage}>
          <a className="text-primary underline" href={"/api/dms/file?fileId=" + s.file}>Signed sheet original, version {s.version}</a> · {label(s.state)}
          {!s.current && " · updated evidence required"}
        </li>)}</ul>}
        {!!w.internal_sheets?.length && <ul className="space-y-1">{w.internal_sheets.map(sheet => <li key={sheet.file}>
          <a className="text-primary underline" href={"/api/dms/file?fileId=" + sheet.file}>Signed internal original {sheet.reference}</a>
          {!sheet.current && " · Historical version"}
        </li>)}</ul>}
        {w.can_file_sheet && <InternalSheetFiling key={w.internal_sheets?.length ?? 0} work={w.id} />}
        {w.can_verify && (w.activity === "internal" || w.sources.length > 0) &&
          <ReviewForm action={w.activity === "internal" ? "Verify internal time" : "Reconcile signed time"} submit={(operation, f) => saveFleetTime({
            operation, order: data.id, action: "verify",
            data: { work: w.id, source_digest: w.source_digest, review: w.review, reason: f.get("reason") },
          })} />}
      </article>)}
    </section>
  </div>;
}

export function FleetAttendanceReview({draft, day}: {draft: FleetAttendanceDraft; day: string}) {
  return <article className="space-y-2 rounded-md border p-3 text-sm">
    <h3 className="font-medium">{draft.name} · {draft.code}</h3>
    <ul className="space-y-1">{draft.works.map(w => <li key={w.id}>
      {time(w.from)} to {time(w.until)} · {w.site} ·{" "}
      <Link className="text-primary underline" href={"/modules/fleet/time?order=" + w.order}>Fleet source {w.id}</Link>
      {w.reviewed && " · " + w.linked_minutes + " minutes linked"}
    </li>)}</ul>
    {draft.attendance ? <>
      <p>Existing attendance · {draft.status}</p>
      <ul className="space-y-1">{draft.entered?.intervals.map(i => <li key={i.start}>
        {time(i.start)} to {time(i.end)}{i.breaks.map(b => " · Break " + time(b.start) + " to " + time(b.end)).join("")}
      </li>)}</ul>
    </> : <p>Attendance draft pending.</p>}
    {draft.leave && <p>This day has approved leave.</p>}
    {!draft.leave && (draft.attendance ? Boolean(draft.entered) : draft.eligible && draft.can_create) &&
      <ReviewForm action={draft.attendance ? "Link matching times" : "Create F12 attendance draft"} submit={(operation, f) => reviewFleetAttendance({
        operation, employee: draft.employee, day, mode: draft.attendance ? "link-existing" : "create-draft", token: draft.token, reason: f.get("reason"),
      })} />}
    {draft.attendance ? <Link className="text-primary underline" href={"/admin/hr/time/attendance?entry_employee=" + draft.employee
      + "&entry_record=" + draft.attendance}>Open in Attendance workbench</Link> :
      !draft.can_create && <p>Enter the reviewed actual times in the Attendance workbench, then link the matching periods here.</p>}
  </article>;
}

export function FleetPayrollReview({row}: {row: FleetPayrollRow}) {
  return <article className="space-y-2 rounded-md border p-3 text-sm">
    <h3 className="font-medium">{row.name} · {row.date} · Fleet source {row.work}</h3>
    <p className="capitalize">{label(row.status)}</p>
    {row.amount !== null && <p>{row.minutes} eligible minutes · {row.currency} {row.rate}/hr · {row.currency} {row.amount} · Rule {row.rule}</p>}
    {row.basis !== null && <p>Monthly wage basis {row.currency} {row.basis}</p>}
    {row.digest && row.status === "ready" && <ReviewForm action="Accept overtime basis" submit={(operation, f) => acceptFleetOvertime({
      operation, work: row.work, digest: row.digest, reason: f.get("reason"),
    })} />}
  </article>;
}
