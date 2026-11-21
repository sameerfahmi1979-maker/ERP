
"use client";

import { useState, type ReactNode } from "react";
import { FineActionForm, FineInput, FineSelect, DriverSearch, EvidenceFields,
  dateTimeField, evidenceField, idField, textField } from "@/features/fleet/fine-form";
import { fineRevisionStatuses, type FineFleetWorkspace } from "@/lib/fleet/fine-contract";
import { outputPath } from "@/lib/official-documents/operational-output";

type Case = FineFleetWorkspace["cases"][number];
type Incident = FineFleetWorkspace["incidents"][number];

const occurrence = new Intl.DateTimeFormat("en-AE", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dubai",
});
const number = new Intl.NumberFormat("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const timeLabel = (time: string) => occurrence.format(new Date(time));
const moneyLabel = (currency: string, amount: number) => currency + " " + number.format(amount);
const label = (name: string) => name.replaceAll("-", " ");
const noticeType = ["T13_AUTHORITY_NOTICE"] as const;
const revisionTypes = ["T13_AUTHORITY_NOTICE", "T13_AUTHORITY_REVISION"] as const;
const driverType = ["T13_DRIVER_EVIDENCE"] as const;
const insurerType = ["T13_INSURER_RECORD"] as const;
const matchLabels: Record<string, string> = {
  pending: "Awaiting historical custody match",
  "plate-unresolved": "Historical plate could not be resolved",
  boundary: "Custody changes at the occurrence time",
  overlap: "Overlapping custody records",
  "no-custody": "No recorded custody at that time",
  "custody-candidate": "Custody candidate found",
};
const activityLabels = { work: "Fleet work order", repair: "Workshop repair cycle", hse: "HSE hold", insurer: "Insurer record" };

function EvidenceLink({ file, children = "Open retained original" }: { file: number; children?: ReactNode }) {
  return <a href={"/api/dms/file?fileId=" + file} target="_blank" rel="noreferrer"
    className="text-sm font-medium text-primary underline">{children}</a>;
}

function Disclosure({ title, children, subtitle }: { title: string; children: ReactNode; subtitle?: string }) {
  return <details className="rounded-lg border bg-card">
    <summary className="cursor-pointer px-4 py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary">
      {title}{subtitle && <span className="ml-2 text-xs font-normal text-muted-foreground">{subtitle}</span>}
    </summary>
    <div className="space-y-3 border-t px-4 py-3">{children}</div>
  </details>;
}

function terms(form: FormData) {
  return {
    amount: textField(form, "amount"), notice_on: textField(form, "notice_on"),
    discount_amount: textField(form, "discount_amount") || undefined,
    appeal_deadline: textField(form, "appeal_deadline") || undefined,
    payment_deadline: textField(form, "payment_deadline") || undefined,
  };
}

function AuthorityTerms({ revised = false, amount }: { revised?: boolean; amount?: number }) {
  return <>
    <FineInput name="notice_on" type="date" label={revised ? "Authority decision date" : "Notice date"} />
    <FineInput name="amount" type="number" label={revised ? "Revised authority amount" : "Authority amount"} value={amount} />
    <FineInput name="discount_amount" type="number" label="Discount amount" optional />
    <FineInput name="appeal_deadline" type="date" label="Appeal deadline" optional />
    <FineInput name="payment_deadline" type="date" label="Payment deadline" optional />
  </>;
}

const incidentChoices = (rows: Incident[]) => rows.map(incident => ({
  id: incident.id, label: incident.reference + " · " + timeLabel(incident.occurred_at),
}));

function NewFine({ workspace }: { workspace: FineFleetWorkspace }) {
  return <FineActionForm action="record-fine" target={workspace.branch_id} label="Record official notice"
    unavailable={!workspace.evidence_choices.some(item => item.type_code === noticeType[0])}
    values={form => ({
      ...terms(form), authority: textField(form, "authority"), reference: textField(form, "reference"),
      offence: textField(form, "offence"), location: textField(form, "location"),
      occurred_at: dateTimeField(form, "occurred_at"), plate_jurisdiction: textField(form, "plate_jurisdiction"),
      plate_class: textField(form, "plate_class"), plate_number: textField(form, "plate_number"),
      currency: textField(form, "currency"), evidence: evidenceField(form, workspace.evidence_choices),
      incident: idField(form, "incident"),
    })}>
    <FineInput name="authority" label="Issuing authority" maxLength={100} />
    <FineInput name="reference" label="Official notice reference" />
    <FineInput name="offence" label="Offence on the notice" maxLength={300} />
    <FineInput name="occurred_at" type="datetime-local" label="Occurrence time (Dubai)" />
    <FineInput name="location" label="Occurrence location" maxLength={300} />
    <FineInput name="plate_jurisdiction" label="Plate jurisdiction" maxLength={24} />
    <FineInput name="plate_class" label="Plate class or code" maxLength={24} />
    <FineInput name="plate_number" label="Plate number at occurrence" maxLength={32} />
    <FineInput name="currency" label="Currency" value="AED" maxLength={3} />
    <AuthorityTerms />
    <EvidenceFields originals={workspace.evidence_choices} accepted={noticeType} />
    {workspace.incidents.length > 0 && <FineSelect name="incident" label="Related incident" optional
      choices={incidentChoices(workspace.incidents)} />}
  </FineActionForm>;
}

function NewDamage({ workspace }: { workspace: FineFleetWorkspace }) {
  const [selected, choose] = useState<number>();
  const assessment = workspace.assessments.find(row => row.id === selected);
  const assessments = workspace.assessments.filter(row => row.case_id === null);
  const incidents = assessment ? workspace.incidents.filter(incident => incident.asset_id === assessment.asset_id &&
    Date.parse(incident.occurred_at) === Date.parse(assessment.occurred_at)) : [];
  return <FineActionForm action="open-damage" target={workspace.branch_id} label="Record assessed damage"
    unavailable={assessments.length === 0} values={form => ({ assessment: idField(form, "assessment"), incident: idField(form, "incident") })}>

    <FineSelect name="assessment" label="Completed Workshop assessment" empty="No unrecorded assessment"
      onChange={value => choose(Number(value) || undefined)}
      choices={assessments.map(row => ({
        id: row.id, label: row.reference + " · " + label(row.outcome) + " · " + timeLabel(row.occurred_at),
      }))} />
    {incidents.length > 0 &&
      <FineSelect key={selected} name="incident" label="Related incident" optional choices={incidentChoices(incidents)} />}
    <p className="self-center text-sm text-muted-foreground">HR reviews liability independently from the assessment.</p>
  </FineActionForm>;
}

function Facts({ row }: { row: Case }) {
  const plate = [row.plate_jurisdiction, row.plate_class, row.plate_number].filter(Boolean).join(" · ");
  const facts = [
    ["Occurrence (Dubai)", timeLabel(row.occurred_at)], ["Current source amount", moneyLabel(row.currency, row.source_amount)],
    ["Notice date", row.notice_on], ["Appeal deadline", row.appeal_deadline], ["Payment deadline", row.payment_deadline],
    ["Discount", row.discount_amount === null ? null : moneyLabel(row.currency, row.discount_amount)],
    ["Offence", row.offence], ["Location", row.location], ["Historical plate", plate],
    ["Workshop assessment", row.assessment_id ? "#" + row.assessment_id : null],
    ["Assessment outcome", row.assessment_outcome && label(row.assessment_outcome)],
    ["Estimated repair", row.estimated_amount === null ? null : moneyLabel(row.currency, row.estimated_amount)],
    ["Verified repair cost", row.actual_amount === null ? null : moneyLabel(row.currency, row.actual_amount)],
    ["Incident", row.incident_id ? "#" + row.incident_id : null],
  ];
  return <dl className="grid gap-3 rounded-md border p-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
    {facts.filter(([, value]) => !!value).map(([name, value]) => <div key={name}>
      <dt className="text-muted-foreground">{name}</dt><dd>{value}</dd>
    </div>)}
    {row.evidence && <div><dt className="text-muted-foreground">Authority evidence</dt>
      <dd><EvidenceLink file={row.evidence.file} /></dd></div>}
  </dl>;
}

function CaseActions({ row, workspace }: { row: Case; workspace: FineFleetWorkspace }) {
  const isFine = row.source_kind === "fine";
  const activeFine = isFine && row.source_status !== "cancelled";
  const revision = row.source_revision;
  const incidents = workspace.incidents.filter(incident => incident.asset_id === row.asset_id &&
    Date.parse(incident.occurred_at) === Date.parse(row.occurred_at));
  return <div className="space-y-3">
    {isFine && <div className="grid gap-3 border-l-2 border-primary/50 bg-muted/40 p-3 text-sm sm:grid-cols-2">
      <div>
        <p className="font-medium">Custody at occurrence</p>
        <p>{matchLabels[row.match_state ?? "pending"] ?? label(row.match_state ?? "pending")}</p>
        {row.custody_candidate_id !== null && <p className="text-muted-foreground">Custodian employee #{row.custody_candidate_id}</p>}
      </div>
      <div>
        <p className="font-medium">Driver responsibility</p>
        <p>{row.subject_status === "verified" ? row.employee_id === null ? "Confirmed" : "Confirmed employee #" + row.employee_id :
          "Awaiting independent confirmation"}</p>
      </div>
    </div>}
    {activeFine && workspace.can_match && row.subject_status !== "verified" &&
      <FineActionForm action="match-custody" target={row.id} label="Match historical custody" values={() => ({ revision })} />}
    {activeFine && workspace.can_verify && row.subject_status === "custody-candidate" && <Disclosure title="Confirm actual driver">
      <FineActionForm action="verify-driver" target={row.id} label="Confirm driver"
        unavailable={!workspace.evidence_choices.some(item => item.type_code === driverType[0])}
        values={form => ({ revision, employee: idField(form, "employee"),
          evidence: evidenceField(form, workspace.evidence_choices), reason: textField(form, "reason") })}>
        <DriverSearch caseId={row.id} />
        <EvidenceFields originals={workspace.evidence_choices} accepted={driverType} />
        <FineInput name="reason" label="How the evidence confirms the driver" maxLength={1000} />
      </FineActionForm>
    </Disclosure>}
    {activeFine && workspace.can_record && <Disclosure title="Record authority update">
      <FineActionForm action="revise-fine" target={row.id} label="Save authority update"
        unavailable={!workspace.evidence_choices.some(item => revisionTypes.some(type => type === item.type_code))}
        values={form => ({
          ...terms(form), revision, authority_revision: textField(form, "authority_revision"), status: textField(form, "status"),
          evidence: evidenceField(form, workspace.evidence_choices), reason: textField(form, "reason"),
        })}>
        <FineInput name="authority_revision" label="Authority decision reference" />
        <FineSelect name="status" label="Decision"
          choices={fineRevisionStatuses.map(status => ({ id: status, label: label(status) }))} />
        <AuthorityTerms revised amount={row.source_amount} />
        <EvidenceFields originals={workspace.evidence_choices} accepted={revisionTypes} />
        <FineInput name="reason" label="Reason for this update" maxLength={1000} />
      </FineActionForm>
    </Disclosure>}
    {!isFine && workspace.can_intake_damage &&
      <FineActionForm action="refresh-damage" target={row.id} label="Refresh assessment and repair costs" values={() => ({ revision })} />}
    {workspace.can_link && row.incident_id === null && incidents.length > 0 &&
      <FineActionForm action="link-incident" target={row.id} label="Link incident"
        values={form => ({ revision, incident: idField(form, "incident") })}>
        <FineSelect name="incident" label="Matching incident" choices={incidentChoices(incidents)} />
      </FineActionForm>}
  </div>;
}

function Cases({ workspace }: { workspace: FineFleetWorkspace }) {
  if (!workspace.cases.length) return <p className="text-sm text-muted-foreground">No cases in this branch view.</p>;
  return <div className="space-y-2">
    {workspace.cases.map(row => {
      const reference = row.reference ?? "Case #" + row.id;
      return <Disclosure key={row.id} title={(row.authority ? row.authority + " · " : "") + reference}
        subtitle={(row.source_kind === "fine" ? "Fine" : "Damage") + " · " + label(row.source_status) + " · " +
          moneyLabel(row.currency, row.source_amount)}>
        <Facts row={row} />
        {workspace.can_print && <a className="text-sm text-primary underline" href={outputPath("fine", row.id)}>Print Fleet case summary</a>}
        <CaseActions row={row} workspace={workspace} />
        {row.history.length > 0 && <Disclosure title="Source history">
          <ul className="divide-y text-sm">{row.history.map(version => <li key={version.revision} className="flex flex-wrap gap-x-3 py-2">
            <span>Revision {version.revision}</span><span>{label(version.action)}</span><span>{label(version.status)}</span>
            <span>{moneyLabel(row.currency, version.amount)}</span><span>{timeLabel(version.recorded_at)}</span>
            {version.authority_revision && <span>Reference {version.authority_revision}</span>}
            {version.notice_on && <span>Notice {version.notice_on}</span>}
            {version.evidence && <EvidenceLink file={version.evidence.file} />}
          </li>)}</ul>
        </Disclosure>}
      </Disclosure>;
    })}
  </div>;
}

function IncidentActivities({ row, workspace }: { row: Incident; workspace: FineFleetWorkspace }) {
  const [kind, setKind] = useState<keyof typeof activityLabels>("work");
  return <>
    {row.activities.length > 0 && <ul className="divide-y rounded-md border px-3 text-sm">
      {row.activities.map(activity => <li key={activity.id} className="flex flex-wrap gap-x-3 py-2">
        <span>{activityLabels[activity.kind]} · {activity.reference ?? "#" + activity.parent}</span>
        {activity.evidence && <EvidenceLink file={activity.evidence.file} />}
      </li>)}
    </ul>}
    {workspace.can_link && <FineActionForm action="link-activity" target={row.id} label="Link activity"
      unavailable={kind === "insurer" && !workspace.evidence_choices.some(item => item.type_code === insurerType[0])}
      values={form => kind === "insurer" ? { kind, reference: textField(form, "reference"),
        evidence: evidenceField(form, workspace.evidence_choices) } : { kind, parent: idField(form, "parent") }}>
      <label className="grid gap-1.5 text-sm font-medium">Activity type
        <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={kind} onChange={event => setKind(event.target.value as keyof typeof activityLabels)}>
          {Object.entries(activityLabels).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </label>
      {kind === "insurer" ? <>
        <FineInput name="reference" label="Insurer reference" />
        <EvidenceFields originals={workspace.evidence_choices} accepted={insurerType} />
      </> : <FineInput key={kind} name="parent" type="number" label={activityLabels[kind] + " ID"} />}
    </FineActionForm>}
  </>;
}

function Incidents({ workspace }: { workspace: FineFleetWorkspace }) {
  return <section className="space-y-2">
    <h2 className="font-semibold">Incidents</h2>
    {workspace.can_link && <Disclosure title="Open incident">
      <FineActionForm action="open-incident" target={workspace.branch_id} label="Open incident" unavailable={!workspace.assets.length}
        values={form => ({ asset: idField(form, "asset"), occurred_at: dateTimeField(form, "occurred_at"),
          reference: textField(form, "reference"), summary: textField(form, "summary") })}>
        <FineSelect name="asset" label="Fleet asset" choices={workspace.assets} empty="No active asset in this branch" />
        <FineInput name="reference" label="Incident reference" />
        <FineInput name="occurred_at" type="datetime-local" label="Occurrence time (Dubai)" />
        <FineInput name="summary" label="What happened" maxLength={500} />
      </FineActionForm>
    </Disclosure>}
    {workspace.incidents.length === 0 ? <p className="text-sm text-muted-foreground">No incidents in this branch.</p> :
      workspace.incidents.map(row => <Disclosure key={row.id} title={row.reference} subtitle={timeLabel(row.occurred_at)}>
        {row.summary && <p className="text-sm">{row.summary}</p>}
        <IncidentActivities row={row} workspace={workspace} />
      </Disclosure>)}
  </section>;
}

export function FleetFineWorkspace({ workspace, children }: { workspace: FineFleetWorkspace; children?: ReactNode }) {
  return <div className="space-y-5">
    <section className="space-y-2">
      <h2 className="font-semibold">Fine and damage cases</h2>
      {workspace.can_record && <Disclosure title="Record official fine notice"><NewFine workspace={workspace} /></Disclosure>}
      {workspace.can_intake_damage && <Disclosure title="Record assessed damage"><NewDamage workspace={workspace} /></Disclosure>}
      <Cases workspace={workspace} />
      {children && <nav className="flex gap-3" aria-label="Fine and damage case pages">{children}</nav>}
    </section>
    {(workspace.can_link || workspace.incidents.length > 0) && <Incidents workspace={workspace} />}
  </div>;
}



