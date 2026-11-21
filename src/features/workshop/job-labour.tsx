"use client";

import { type JobWorkRequest, type LabourWorkspace } from "@/lib/workshop/labour-contract";
import { JobWorkForm, dateTime, number, option, text, timeLabel } from "./job-work-form";

export function JobLabour({ data }: { data: LabourWorkspace }) {
  function record(values: JobWorkRequest["data"]) {
    const original = data.documents.find(item => item.file === values.file);
    const { file, ...fields } = values;
    if (!file || !original) return fields;
    return { ...fields, evidence: { document: original.document, version: original.version, file: original.file } };
  }
  return <section className="space-y-4 rounded-lg border bg-card p-4">
    <h2 className="text-lg font-semibold">Technicians, bays and signed time</h2>
    {data.can_assign && <details><summary className="mb-2 cursor-pointer font-medium">Allocate technician and bay</summary>
      <JobWorkForm parent={data.job} family="labour" action="assign" label="Save allocation" fields={[
        option("employee", "Technician", data.employees), option("supervisor", "Independent named supervisor", data.supervisors),
        option("site", "Workshop site", data.sites), text("bay", "Bay or station"), text("task", "Assigned work"),
        dateTime("from", "Allocation starts"), dateTime("until", "Allocation ends"),
      ]} />
    </details>}
    <ul className="divide-y text-sm">
      {data.assignments.map(row => <li key={row.id} className="py-2">
        <p className="font-medium">{row.employee} · {row.task} · {row.site} / {row.bay}</p>
        <p>{timeLabel(row.window_start)} to {timeLabel(row.window_end)} · Supervisor {row.supervisor}</p>
      </li>)}
    </ul>
    {data.record && data.assignments.length > 0 && <details><summary className="mb-2 cursor-pointer font-medium">Record or revise signed time</summary>
      {!data.documents.length && <p className="mb-2 text-sm text-muted-foreground">Link the verified signed labour original to the asset in DMS.</p>}
      <JobWorkForm parent={data.job} family="labour" action="record" label="Save signed time" needsPreview map={record} fields={[
        option("assignment", "Technician allocation", data.assignments.map(row => ({ id: row.id, label: row.employee + " · " + row.task + " · " + row.bay }))),
        text("source_line", "Signed sheet line reference"), dateTime("from", "Actual start"), dateTime("until", "Actual finish"),
        option("file", "Signed current DMS original", data.documents.map(row => ({ id: row.file, label: row.label }))),
        option("previous", "Previous version (for a correction)", data.versions.filter(row => row.current)
          .map(row => ({ id: row.id, label: row.source_line + " · " + row.day + " · #" + row.id })), true),
        { key: "void", label: "Void the prior signed line", kind: "checkbox", optional: true },
      ]} />
    </details>}
    {!data.versions.length && <p className="text-sm text-muted-foreground">No signed time recorded on this cycle.</p>}
    <ul className="divide-y text-sm">{data.versions.map(row => <li className="space-y-2 py-3" key={row.id}>
      <p className="font-medium">{row.source_line} · {row.employee} · {row.voids_line ? "Void" : `${row.minutes} minutes`} · {row.decision ?? "Awaiting supervisor"}</p>
      <p>{timeLabel(row.started)} to {timeLabel(row.ended)}
        {row.predecessor_id && ` · Revises #${row.predecessor_id}`}{!row.current && " · Earlier version"}</p>
      <p>{row.cost_status === "rate-required" ? "Workshop cost rate required" : row.amount !== null ?
        `Workshop cost ${row.currency} ${row.amount.toFixed(2)}` : "Workshop cost basis recorded"}</p>
      {row.file && <a className="text-primary hover:underline" href={`/api/dms/file?fileId=${row.file}`}>Signed original</a>}
      {row.current && row.supervisor && !row.decision && <details>
        <summary className="mb-2 cursor-pointer text-primary">Decide this signed version</summary>
        <div className="grid gap-2 lg:grid-cols-2">
          <JobWorkForm parent={data.job} family="labour" action="approve" label="Approve signed version" constants={{ version: row.id }} />
          <JobWorkForm parent={data.job} family="labour" action="reject" label="Reject signed version" constants={{ version: row.id }} />
        </div>
      </details>}
    </li>)}</ul>
    {data.cost && <details className="rounded-md border p-3">
      <summary className="mb-2 cursor-pointer font-medium">Workshop costing rates</summary>
      <JobWorkForm parent={data.branch} family="rate" action="prepare" label="Prepare dated cost rate" fields={[
        option("group", "Employee group (blank for branch default)", data.groups, true),
        { key: "from", kind: "day", label: "Effective start" }, { key: "until", kind: "day", label: "Until (exclusive)" },
        number("rate", "Workshop cost per hour", "0.0001"), text("currency", "Currency code"),
        { key: "approved_zero", kind: "checkbox", optional: true, label: "Explicit zero cost rule" },
      ]} />
      <ul className="divide-y text-sm">{data.rates.map(rate => <li className="space-y-2 py-2" key={rate.id}>
        <p>#{rate.id} · {rate.currency} {rate.rate}/h · {rate.from_day} to {rate.until_day} · {rate.approved_at ? "Approved" : "Pending"}</p>
        {rate.independent && !rate.approved_at && <JobWorkForm parent={data.branch} family="rate" action="approve" label="Independently approve cost rate" constants={{ id: rate.id }} />}
      </li>)}</ul>
    </details>}
  </section>;
}
