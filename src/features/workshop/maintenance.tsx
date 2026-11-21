"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { clockUnits, type WorkshopClock, type WorkshopRequest, type WorkshopWorkspace } from "@/lib/workshop/workspace";
import { Field, Times, WorkshopForm, number, optionalText, selectStyle, time } from "./action-form";

type ClockUnit = keyof typeof clockUnits;
const steps = { days: "1", km: "0.001", hours: "0.001", cycles: "1", "usage-hours": "0.001" };

function ClockFields({ unit, clock }: { unit: ClockUnit; clock?: WorkshopClock }) {
  const step = steps[unit];
  return <>
    <Field label="Service interval"><Input name="interval" type="number" min={step} step={step} required defaultValue={clock?.interval} /></Field>
    <Field label="Upcoming lead time"><Input name="notice" type="number" min={0} step={step} required defaultValue={clock?.notice ?? 0} /></Field>
    <Field label="Compliance tolerance"><Input name="tolerance" type="number" min={0} step={step} required defaultValue={clock?.tolerance ?? 0} /></Field>
    {unit !== "days" && <Field label="Reading valid for (days)"><Input name="max_age" type="number" min={1} max={3650} required defaultValue={clock?.max_age ?? 30} /></Field>}
    <label className="flex items-center gap-2 text-sm font-medium"><input name="block" type="checkbox" defaultChecked={clock?.block ?? false} />Block dispatch when overdue</label>
  </>;
}

function settings(form: FormData): WorkshopRequest["data"] {
  return {
    interval: Number(form.get("interval")), notice: Number(form.get("notice")), tolerance: Number(form.get("tolerance")),
    max_age: number(form, "max_age") ?? 30, block: form.has("block"),
  };
}

function MaintenanceSetup({ asset }: { asset: number }) {
  const [unit, setUnit] = useState<ClockUnit>("days");
  const [meter, setMeter] = useState<Exclude<ClockUnit, "days">>("km");
  const [unknown, setUnknown] = useState(false);
  return <div className="grid gap-3">
    <details className="rounded-lg border bg-card p-4">
      <summary className="cursor-pointer font-semibold">Add a service clock</summary>
      <div className="mt-3">
        <WorkshopForm asset={asset} action="create" button="Create service clock" reasonLabel="Baseline source and reason"
          makeData={form => ({ ...settings(form), label: optionalText(form, "label"), unit,
            baseline_day: optionalText(form, "baseline_day"), baseline_value: number(form, "baseline_value") })}>
          <Field label="Service name"><Input name="label" maxLength={100} required /></Field>
          <Field label="Clock unit"><select className={selectStyle} value={unit} onChange={event => setUnit(event.target.value as ClockUnit)}>
            {Object.entries(clockUnits).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </select></Field>
          <Field label="Baseline date"><Input type="date" name="baseline_day" required /></Field>
          {unit !== "days" && <Field label="Baseline reading"><Input type="number" name="baseline_value" min={0} step={steps[unit]} required /></Field>}
          <ClockFields unit={unit} />
        </WorkshopForm>
      </div>
    </details>
    <details className="rounded-lg border bg-card p-4">
      <summary className="cursor-pointer font-semibold">Record a meter or usage reading</summary>
      <div className="mt-3">
        <WorkshopForm asset={asset} action="reading" button="Save reading" reasonLabel="Reading source or reason unavailable"
          makeData={form => ({ unit: meter, observed: time(form, "observed"), value: unknown ? null : number(form, "value"),
            reference: optionalText(form, "reference") })}>
          <Field label="Meter"><select className={selectStyle} value={meter} onChange={event => setMeter(event.target.value as typeof meter)}>
            {Object.entries(clockUnits).filter(([code]) => code !== "days").map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </select></Field>
          <Times name="observed" label="Read at" />
          <Field label="Source reference"><Input name="reference" maxLength={150} required /></Field>
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={unknown} onChange={event => setUnknown(event.target.checked)} />Reading unavailable</label>
          {!unknown && <Field label="Reading"><Input type="number" min={0} step={steps[meter]} name="value" required /></Field>}
        </WorkshopForm>
      </div>
    </details>
  </div>;
}

export function MaintenanceClocks({ data }: { data: WorkshopWorkspace }) {
  return <section aria-labelledby="maintenance-heading" className="space-y-3">
    <h2 id="maintenance-heading" className="text-lg font-semibold">Maintenance</h2>
    {data.maintenance && <MaintenanceSetup asset={data.asset} />}
    {data.clocks.length === 0 && <p className="text-sm text-muted-foreground">No service clocks in this scope.</p>}
    {data.clocks.map(clock => {
      const latest = { clock: clock.id, revision: clock.revision };
      const serviceJobs = data.cases.filter(item => item.clock === clock.id && item.jobs[0]?.state === "closed");
      return <article key={clock.id} className="space-y-3 rounded-lg border bg-card p-4 text-sm">
        <div className="flex flex-wrap gap-2"><h3 className="font-semibold">{clock.label} · {clockUnits[clock.unit]}</h3>
          <span className="rounded border px-2 capitalize">{clock.current.status}{clock.current.blocking ? " · Dispatch blocked" : ""}</span>
        </div>
        <p className="text-muted-foreground">Baseline {clock.baseline_day}{clock.unit !== "days" && ` at ${clock.baseline_value}`}
          {clock.current.due_day && ` · Due ${clock.current.due_day}`}{clock.current.due_reading !== null && ` · Due at ${clock.current.due_reading}`}
          {clock.current.observed !== null && ` · Latest reading ${clock.current.observed}`}
          {` · Reminder ${clock.current.reminder_active ? "active" : "inactive"}`}</p>
        {clock.current.unavailable && <p>Check the reading · {clock.current.unavailable.replaceAll("-", " ")}</p>}
        {clock.editable && <details>
          <summary className="cursor-pointer font-medium">Edit clock or reminder</summary>
          <div className="mt-3 grid gap-4">
            <WorkshopForm key={clock.revision} asset={data.asset} action="edit" button="Save settings" makeData={form => ({ ...latest, ...settings(form) })}>
              <ClockFields unit={clock.unit} clock={clock} />
            </WorkshopForm>
            <WorkshopForm asset={data.asset} action={clock.current.reminder_active ? "deactivate-reminder" : "activate-reminder"}
              button={clock.current.reminder_active ? "Deactivate reminder" : "Activate reminder"} makeData={() => latest} />
            {serviceJobs.length > 0 && <WorkshopForm asset={data.asset} action="record-service" button="Record completed service and advance baseline"
              makeData={form => ({ ...latest, job: number(form, "job") })}>
              <Field label="Released service job">
                <select className={selectStyle} name="job" required defaultValue="">
                  <option value="">Select the completed job</option>
                  {serviceJobs.map(finding => <option key={finding.id} value={finding.jobs[0].id}>WO-{finding.id}/{finding.jobs[0].cycle}</option>)}
                </select>
              </Field>
            </WorkshopForm>}
          </div>
        </details>}
        {clock.history && clock.history.length > 0 && <details>
          <summary className="cursor-pointer text-muted-foreground">Clock history</summary>
          <ul className="mt-2 space-y-2 border-l pl-3">{clock.history.map(version => <li key={version.id}>
            <p className="capitalize">{version.action.replaceAll("-", " ")} · Baseline {version.base_day}</p>
            {version.previous_service_status && <p>Service compliance · {version.previous_service_status.compliance.replaceAll("-", " ")} · Rule {version.previous_service_status.rule_version}</p>}
            <p className="text-muted-foreground">{version.reason}</p>
          </li>)}</ul>
        </details>}
      </article>;
    })}
  </section>;
}
