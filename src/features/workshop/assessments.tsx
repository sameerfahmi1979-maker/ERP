"use client";

import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { outputPath } from "@/lib/official-documents/operational-output";
import { findingKinds, type WorkshopDocument, type WorkshopJob, type WorkshopWorkspace } from "@/lib/workshop/workspace";
import { EvidenceSelect, Field, Times, WorkshopForm, labelTime, number, optionalText, rowLink, selectStyle, selectedEvidence, time } from "./action-form";

type Finding = WorkshopWorkspace["cases"][number];
const titles = { triage: "Triage", planned: "Planned", "in-progress": "In progress", qc: "Awaiting QC", closed: "Released" };

export function FindingIntake({ data }: { data: WorkshopWorkspace }) {
  const [kind, setKind] = useState("inspection");
  const documents = data.documents.filter(item => item.type !== "FLEET_WORKSHOP_RETURN");
  return <details className="rounded-lg border bg-card p-4">
    <summary className="cursor-pointer font-semibold">Report a finding</summary>
    <div className="mt-4">
      <WorkshopForm asset={data.asset} action="report" button="Report and hold asset" reasonLabel="Finding"
        makeData={form => ({
          kind, reference: optionalText(form, "reference"), occurred: time(form, "occurred"),
          commitment: number(form, "commitment"), clock: number(form, "clock"), evidence: selectedEvidence(form, documents),
        })}>
        <Field label="Finding source">
          <select className={selectStyle} value={kind} onChange={event => setKind(event.target.value)}>
            {(["inspection", "incident", "reported-failure", "planned-service"] as const).map(value =>
              <option value={value} key={value}>{findingKinds[value]}</option>)}
          </select>
        </Field>
        <Field label="Source reference"><Input required name="reference" maxLength={150} /></Field>
        <Times label="Actual occurrence" name="occurred" />
        {kind === "planned-service" ? <Field label="Service clock">
          <select className={selectStyle} name="clock" defaultValue="" required>
            <option value="">Choose the required service</option>
            {data.clocks.map(clock => <option value={clock.id} key={clock.id}>{clock.label}</option>)}
          </select>
        </Field> : <Field label="Custody or dispatch record (if applicable)"><Input type="number" min={1} step={1} name="commitment" /></Field>}
        <EvidenceSelect choices={documents} />
      </WorkshopForm>
    </div>
  </details>;
}

function JobActions({ finding, job, asset, documents }: {
  finding: Finding; job: WorkshopJob; asset: number; documents: WorkshopDocument[];
}) {
  const identity = { assessment: finding.id, job: job.id, revision: job.revision };
  const heading = `WO-${finding.id}/${job.cycle}`;
  if (finding.manage && (job.state === "triage" || job.state === "planned")) return <div className="space-y-4">
    <WorkshopForm asset={asset} action="plan" button="Save work plan"
      makeData={form => ({ ...identity, worker: number(form, "worker"), starts: time(form, "starts"), ends: time(form, "ends"), estimate: number(form, "estimate") })}>
      <Field label="Assigned employee">
        <select className={selectStyle} name="worker" required defaultValue={job.worker ?? ""}>
          <option value="">Choose an employee</option>
          {job.workers?.map(worker => <option key={worker.id} value={worker.id}>{worker.code ? worker.code + " · " : ""}{worker.name}</option>)}
        </select>
      </Field>
      <Times name="starts" label="Planned start" initial={job.plan_start} />
      <Times name="ends" label="Planned finish" initial={job.plan_end} />
      <Field label="Estimate (AED)"><Input required name="estimate" type="number" min={0} step="0.01" defaultValue={job.estimate ?? undefined} /></Field>
    </WorkshopForm>
    {job.state === "planned" && <WorkshopForm asset={asset} action="start" button="Start work"
      makeData={form => ({ ...identity, occurred: time(form, "occurred") })}>
      <Times name="occurred" label="Actual start" />
    </WorkshopForm>}
  </div>;
  if (finding.manage && job.state === "in-progress") return <WorkshopForm asset={asset} action="submit-qc" button="Submit work for QC"
    makeData={form => ({ ...identity, occurred: time(form, "occurred"), actual_work: optionalText(form, "actual_work"),
      cost: number(form, "cost"), warranty: optionalText(form, "warranty"), warranty_until: optionalText(form, "warranty_until") })}>
    <Times name="occurred" label="Actual finish" />
    <Field label="Work completed"><Input name="actual_work" required maxLength={2000} defaultValue={job.actual_work ?? undefined} /></Field>
    <Field label="Actual cost (AED)"><Input name="cost" required type="number" min={0} step="0.01" defaultValue={job.cost ?? undefined} /></Field>
    <Field label="Warranty reference"><Input name="warranty" maxLength={150} defaultValue={job.warranty ?? undefined} /></Field>
    <Field label="Warranty ends"><Input name="warranty_until" type="date" defaultValue={job.warranty_until ?? undefined} /></Field>
  </WorkshopForm>;
  if (finding.release && job.state === "qc") {
    if (!job.independent_qc) return <p className="text-sm text-muted-foreground">An independent reviewer must complete QC.</p>;
    const returns = documents.filter(item => item.type === "FLEET_WORKSHOP_RETURN");
    return <div className="space-y-4">
      <WorkshopForm asset={asset} action="release" button="Pass QC and release Workshop hold" reasonLabel="QC and release notes"
        disabled={!returns.length} makeData={form => ({ ...identity, occurred: time(form, "occurred"),
          evidence: selectedEvidence(form, returns), return_reference: optionalText(form, "return_reference") })}>
        <Times name="occurred" label="Equipment handback" />
        <EvidenceSelect choices={returns} required />
        <Field label={`Job and cycle shown on original (${heading})`}><Input name="return_reference" required maxLength={50} /></Field>
      </WorkshopForm>
      <WorkshopForm asset={asset} action="return-to-work" button="Return for more work" reasonLabel="QC finding" makeData={() => identity} />
    </div>;
  }
  if (finding.release && job.state === "closed") return <WorkshopForm asset={asset} action="reopen" button="Reopen in a new cycle"
    reasonLabel="Reopen reason and work needed" makeData={() => identity} />;
  return null;
}

function JobCard({ finding, job, asset, documents, current }: {
  finding: Finding; job: WorkshopJob; asset: number; documents: WorkshopDocument[]; current: boolean;
}) {
  return <details className="rounded-md border px-3 py-2" open={current}>
    <summary className="cursor-pointer text-sm font-semibold">WO-{finding.id}/{job.cycle} · {titles[job.state]}</summary>
    <div className="mt-3 grid gap-3 text-sm">
      <p>{job.scope}</p>
      {finding.can_print && <a className={rowLink} href={outputPath("job-card", job.id)}>Print Workshop job card</a>}
      {(finding.manage || finding.release) && <Link className={rowLink} href={`/modules/workshop/job-work/${job.id}`}>
        Labour, materials and outside work
      </Link>}
      {job.plan_start && job.plan_end && <p>Planned {labelTime(job.plan_start)} to {labelTime(job.plan_end)}{job.worker && ` · Employee #${job.worker}`}</p>}
      {job.actual_start && <p>Actual start {labelTime(job.actual_start)}{job.actual_end && ` · Finished ${labelTime(job.actual_end)}`}</p>}
      {job.actual_work && <p>{job.actual_work}</p>}
      {(job.estimate !== null || job.cost !== null) && <p>
        {job.estimate !== null && `Estimate AED ${job.estimate.toFixed(2)}`}{job.estimate !== null && job.cost !== null && " · "}
        {job.cost !== null && `Actual AED ${job.cost.toFixed(2)}`}
      </p>}
      {job.warranty && <p>Warranty {job.warranty} · Ends {job.warranty_until}</p>}
      {job.qc && <p>QC · {job.qc}</p>}
      {job.proof && <a className={rowLink} href={`/api/dms/file?fileId=${job.proof}`}>Returned equipment original</a>}
      {job.events && job.events.length > 0 && <details>
        <summary className="cursor-pointer text-muted-foreground">Job history</summary>
        <ul className="mt-2 space-y-2 border-l pl-3">{job.events.map(entry => <li key={entry.revision}>
          <strong className="capitalize">{entry.operation.replaceAll("-", " ")}</strong> · {entry.by} · {labelTime(entry.at)}
          <p className="text-muted-foreground">{entry.reason}</p>
        </li>)}</ul>
      </details>}
      {current && <JobActions finding={finding} job={job} documents={documents} asset={asset} />}
    </div>
  </details>;
}

export function AssessmentCards({ data }: { data: WorkshopWorkspace }) {
  return <section className="space-y-3" aria-labelledby="assessments-heading">
    <h2 id="assessments-heading" className="text-lg font-semibold">Findings and job cards</h2>
    {!data.cases.length && <p className="text-sm text-muted-foreground">No findings in this scope.</p>}
    {data.cases.map(finding => <article key={finding.id} className="space-y-3 rounded-lg border bg-card p-4">
      {finding.can_print && <a className={rowLink} href={outputPath("assessment", finding.id)}>Print Workshop assessment</a>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{findingKinds[finding.kind]} · #{finding.id}</h3>
        <span className={finding.blocking ? "rounded border border-amber-600/50 px-2 py-1 text-sm font-medium" : "rounded border px-2 py-1 text-sm"}>
          {finding.blocking ? "Workshop hold active" : "Workshop hold released"}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{finding.reference} · {labelTime(finding.occurred)} · {finding.reported_by}</p>
      <p className="text-sm">{finding.finding}</p>
      {finding.clock && <p className="text-sm">Scheduled service · {data.clocks.find(clock => clock.id === finding.clock)?.label ?? `Clock #${finding.clock}`}</p>}
      {finding.proof && <a className={rowLink} href={`/api/dms/file?fileId=${finding.proof}`}>Inspection or return original</a>}
      {finding.outcome && <p className="text-sm"><strong>{finding.outcome === "repair" ? "Repair required" : "Usable as-is"}</strong> · {finding.assessed_by} · {finding.diagnosis}</p>}
      {!finding.outcome && finding.can_assess && <WorkshopForm asset={data.asset} action="assess" button="Record technical assessment"
        reasonLabel="Diagnosis" makeData={form => ({ assessment: finding.id, outcome: optionalText(form, "outcome"), responsibility: optionalText(form, "responsibility") })}>
        <Field label="Technical result">
          <select className={selectStyle} name="outcome" required defaultValue="">
            <option value="">Choose result</option><option value="usable-as-is">Usable as-is</option><option value="repair">Repair required</option>
          </select>
        </Field>
        {finding.can_refer && <Field label="Evidence of possible employee responsibility (if applicable)">
          <Input name="responsibility" maxLength={1000} />
        </Field>}
      </WorkshopForm>}
      {finding.jobs.map((job, index) => <JobCard key={job.id} job={job} finding={finding} asset={data.asset} documents={data.documents} current={index === 0} />)}
    </article>)}
  </section>;
}
