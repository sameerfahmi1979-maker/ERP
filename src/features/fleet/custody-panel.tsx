"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  availabilityBlockers, type CustodyAction, type CustodyChoices, type CustodyCommand, type CustodyWorkspace,
} from "@/lib/fleet/custody-contract";
import { outputPath } from "@/lib/official-documents/operational-output";
import { checkFleetAvailability, findFleetCustodyAt, getCustodyChoices, saveFleetCustody } from "@/server/actions/fleet/custody";
import { FleetField, fleetSelectClass, readFleetText } from "./asset-form";

const dateTimeFormat = new Intl.DateTimeFormat("en-AE", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dubai",
});
function showFleetTime(value: string) {
  return dateTimeFormat.format(new Date(value));
}
const readNumber = (f: FormData, key: string) => Number(readFleetText(f, key)) || undefined;
const readDubaiTime = (f: FormData, key: string) => {
  const value = readFleetText(f, key);
  return value ? `${value}:00+04:00` : undefined;
};
const nowInDubai = () => new Date(Date.now() + 4 * 3600_000).toISOString().slice(0,16);
const labels: Record<CustodyAction,string> = {
  checkout:"Check out asset", return:"Record actual return", transfer:"Transfer custody",
  "request-loan":"Request an overnight or cross-scope loan", "approve-loan":"Approve loan",
  tentative:"Log tentative request", reserve:"Confirm new reservation", confirm:"Confirm tentative reservation",
  cancel:"Cancel reservation", dispatch:"Start verified assignment", "place-hold":"Place hold", "release-hold":"Release one hold",
};
const physical = ["checkout","return","transfer","dispatch"];

function CustodyForm({workspace,action,fields,children,submitLabel}:{
  workspace:CustodyWorkspace; action:CustodyCommand["action"]; fields:(f:FormData)=>CustodyCommand["data"];
  children:ReactNode; submitLabel:string;
}) {
  const router=useRouter();
  const busy=useRef(false);
  const [pending,setPending]=useState(false);
  const [retry,setRetry]=useState<CustodyCommand|null>(null);
  const [message,setMessage]=useState("");
  async function submit(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy.current) return;
    const command=retry??{operation:crypto.randomUUID(),asset:workspace.asset,company:workspace.company,action,data:fields(new FormData(e.currentTarget))};
    busy.current=true;
    setPending(true);
    setMessage("");
    try {
      const result=await saveFleetCustody(command);
      if ("error" in result) {
        setRetry(result.uncertain?command:null);
        setMessage(result.error??"The Fleet action could not be saved.");
      } else {
        setRetry(null);
        setMessage("Saved.");
        router.refresh();
      }
    } catch {
      setRetry(command);
      setMessage("Save outcome is unconfirmed. Retry the original request.");
    } finally {
      busy.current=false;
      setPending(false);
    }
  }
  return <form className="space-y-4 rounded-lg border bg-card p-4" onSubmit={submit}>
    <fieldset disabled={pending||retry!==null} className="grid gap-3 sm:grid-cols-2">{children}</fieldset>
    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" disabled={pending}>{pending?"Saving…":retry?"Retry original request":submitLabel}</Button>
      {message && <p className="text-sm text-muted-foreground" role="status">{message}</p>}
    </div>
  </form>;
}

function EmployeeAndSite({asset,initial}:{asset:number;initial:CustodyChoices}) {
  const [query,setQuery]=useState("");
  const [choices,setChoices]=useState(initial);
  const [running,setRunning]=useState(false);
  const [message,setMessage]=useState("");
  async function search() {
    setRunning(true);
    try {
      const result=await getCustodyChoices(asset,query);
      setChoices(result??{workers:[],sites:[]});
      setMessage(result?.workers.length?"":"No verified employees match your permitted scopes and search.");
    } finally { setRunning(false); }
  }
  return <>
    <FleetField label="Find an employee by name or code"><Input value={query} maxLength={100}
      onChange={e=>{setQuery(e.target.value);setChoices({workers:[],sites:choices.sites});setMessage("");}} /></FleetField>
    <div className="self-end">
      <Button type="button" variant="outline" disabled={running||query.trim().length<2} onClick={search}>
        {running?"Searching…":"Find employee"}
      </Button>
      {message && <p role="status" className="text-xs text-muted-foreground">{message}</p>}
    </div>
    <FleetField label="Named employee"><select name="employee" required className={fleetSelectClass}>
      <option value="">Choose an employee</option>
      {choices.workers.map(worker=><option key={worker.id} value={worker.id}>{worker.label}</option>)}
    </select></FleetField>
    <FleetField label="Site"><select name="site" required className={fleetSelectClass}>
      <option value="">Choose a site</option>
      {choices.sites.map(site=><option key={site.id} value={site.id}>{site.label}</option>)}
    </select></FleetField>
  </>;
}

function SnapshotFields({proofs,prefix,title}:{
  proofs:CustodyWorkspace["signed_choices"]; prefix:string; title:string;
}) {
  const [unknown,setUnknown]=useState(false);
  return <fieldset className="grid gap-3 rounded-md border p-3 sm:col-span-2 sm:grid-cols-2">
    <legend className="px-1 text-sm font-medium">{title}</legend>
    <FleetField label="Condition"><select name={prefix+"condition"} className={fleetSelectClass} required>
      <option value="">Select condition</option>
      <option value="good">Good</option><option value="fair">Fair</option>
      <option value="damaged">New damage</option><option value="unknown">Unknown</option>
    </select></FleetField>
    <FleetField label="Meter reading"><Input type="number" min="0" step="0.001" required={!unknown} disabled={unknown} name={prefix+"meter"} /></FleetField>
    <FleetField label="Meter unit"><select name={prefix+"unit"} className={fleetSelectClass} disabled={unknown}>
      <option value="km">Kilometres</option><option value="hours">Operating hours</option>
    </select></FleetField>
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name={prefix+"unknown"} checked={unknown} onChange={e=>setUnknown(e.target.checked)} /> Meter unknown
    </label>
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name={prefix+"discrepancy"} /> Record a discrepancy
    </label>
    <FleetField label="Signed DMS acknowledgement"><select name={prefix+"proof"} className={fleetSelectClass}>
      <option value="">Select signed proof when required</option>
      {proofs.map(proof=><option key={proof.file} value={proof.file}>{proof.label}</option>)}
    </select></FleetField>
  </fieldset>;
}

function WindowFields({planned}:{planned:boolean}) {
  return <>
    <FleetField label={planned?"Planned start (Dubai time)":"Actual handover (Dubai time)"}>
      <Input type="datetime-local" name="from" defaultValue={nowInDubai()} required />
    </FleetField>
    <FleetField label="Planned return (Dubai time)"><Input type="datetime-local" name="until" required /></FleetField>
  </>;
}

function CustodyActionForm({workspace,choices,action}:{
  workspace:CustodyWorkspace;choices:CustodyChoices;action:CustodyAction;
}) {
  const [reference,setReference]=useState("");
  const [approval,setApproval]=useState("");
  const [holdKind,setHoldKind]=useState(workspace.can_workshop?"workshop":"hse");
  const loan=workspace.loans.find(item=>item.id===Number(approval));
  const selected=workspace.commitments.find(item=>item.id===Number(reference||loan?.commitment));
  const solo=["checkout","dispatch"].includes(action);
  const activeItems=workspace.commitments.filter(item=>!item.managed_by_operation&&item.status==="active"&&(action!=="transfer"||item.kind==="custody"));
  const reservations=workspace.commitments.filter(item=>!item.managed_by_operation&&item.kind==="reservation"&&(
    action==="confirm"?item.status==="tentative":action==="cancel"?item.status==="tentative"||item.status==="confirmed":item.status==="confirmed"));
  const requireReference=["return","transfer","confirm","cancel"].includes(action);
  const selectable=["return","transfer","request-loan"].includes(action)?activeItems:reservations;
  const pendingLoans=workspace.loans.filter(item=>item.status==="pending");
  const approvedLoans=workspace.loans.filter(item=>item.status==="approved"&&(
    action==="transfer"?item.commitment!==null:item.commitment===null));
  const eligibleHolds=workspace.holds.filter(h=>h.released_at===null&&(h.kind==="workshop"?workspace.can_workshop:workspace.can_hse));
  const needWindow=["request-loan","reserve","tentative"].includes(action)||((solo||action==="transfer")&&!selected&&!loan)
    || (action==="transfer"&&!loan);

  function snapshot(form:FormData,prefix:string) {
    const proof=workspace.signed_choices.find(item=>item.file===readNumber(form,prefix+"proof"));
    return {
      condition:readFleetText(form,prefix+"condition"), meter_unknown:form.has(prefix+"unknown"),
      meter:form.has(prefix+"unknown")?undefined:Number(readFleetText(form,prefix+"meter")),
      meter_unit:readFleetText(form,prefix+"unit")||undefined, discrepancy:form.has(prefix+"discrepancy"),
      document:proof?.document,version:proof?.version,file:proof?.file,
    };
  }
  function fields(form:FormData):CustodyCommand["data"] {
    const command:CustodyCommand["data"]={reason:readFleetText(form,"reason")};
    if (selected) { command.commitment=selected.id; command.revision=selected.revision; }
    if (loan) {
      command.approval=loan.id;
      if (action==="transfer") {command.commitment=loan.commitment;command.revision=loan.revision;}
    }
    if (needWindow) {
      command.employee=readNumber(form,"employee");
      command.site=readNumber(form,"site");
      command.from=readDubaiTime(form,"from");
      command.until=readDubaiTime(form,"until");
    }
    if (action==="return"||((solo||action==="transfer")&&(selected||loan)&&!needWindow)) command.at=readDubaiTime(form,"at");
    if (physical.includes(action)) command.snapshot=snapshot(form,"");
    if (action==="transfer") command.handover=snapshot(form,"handover-");
    if (action==="place-hold") command.kind=holdKind;
    if (action==="release-hold") command.hold=readNumber(form,"hold");
    return command;
  }
  return <CustodyForm workspace={workspace} action={action} fields={fields} submitLabel={labels[action]}>
    {(action==="approve-loan"||((action==="checkout"||action==="transfer")&&approvedLoans.length>0)) &&
      <FleetField label={action==="approve-loan"?"Pending loan":"Approved loan"}>
        <select value={approval} required={action==="approve-loan"} className={fleetSelectClass}
          onChange={e=>{setApproval(e.target.value);setReference("");}}>
          <option value="">{action==="approve-loan"?"Choose the request":"Choose approved loan when required"}</option>
          {(action==="approve-loan"?pendingLoans:approvedLoans).map(item=><option key={item.id} value={item.id}>
            {item.employee_name} · {item.site_name} · {showFleetTime(item.start)} to {showFleetTime(item.until)}
          </option>)}
        </select>
      </FleetField>}
    {!loan&&(requireReference||action==="request-loan"||(solo&&selectable.length>0)) &&
      <FleetField label={["return","transfer","request-loan"].includes(action)?"Current custody or assignment":"Reservation"}>
        <select required={requireReference} value={reference} className={fleetSelectClass} onChange={e=>setReference(e.target.value)}>
          <option value="">{requireReference?"Choose a record":"Start a new record"}</option>
          {selectable.map(item=><option key={item.id} value={item.id}>
            {item.employee_name} · {showFleetTime(item.from)} · {item.status}
          </option>)}
        </select>
      </FleetField>}
    {needWindow&&<><EmployeeAndSite asset={workspace.asset} initial={choices} /><WindowFields planned={!physical.includes(action)} /></>}
    {(action==="return"||((solo||action==="transfer")&&(selected||loan)&&!needWindow)) &&
      <FleetField label={action==="return"?"Actual return (Dubai time)":"Actual handover (Dubai time)"}>
        <Input type="datetime-local" name="at" defaultValue={nowInDubai()} required />
      </FleetField>}
    {action==="place-hold"&&<FleetField label="Hold type"><select value={holdKind} onChange={e=>setHoldKind(e.target.value)} className={fleetSelectClass}>
      {workspace.can_workshop&&<option value="workshop">Workshop</option>}{workspace.can_hse&&<option value="hse">HSE</option>}
    </select></FleetField>}
    {action==="release-hold"&&<FleetField label="Hold to release"><select name="hold" required className={fleetSelectClass}>
      <option value="">Choose an active hold</option>
      {eligibleHolds.map(item=><option key={item.id} value={item.id}>{item.kind.toUpperCase()} · {showFleetTime(item.placed_at)} · {item.reason}</option>)}
    </select></FleetField>}
    <FleetField label="Reason"><Input name="reason" maxLength={500} required /></FleetField>
    {physical.includes(action)&&<SnapshotFields proofs={workspace.signed_choices} prefix="" title={action==="return"||action==="transfer"?"Return condition":"Handover condition"} />}
    {action==="transfer"&&<SnapshotFields proofs={workspace.signed_choices} prefix="handover-" title="Receiving employee handover condition" />}
  </CustodyForm>;
}

function AvailabilityForm({asset,choices}:{asset:number;choices:CustodyChoices}) {
  const [loading,setLoading]=useState(false);
  const [answers,setAnswers]=useState<string[]>([]);
  async function check(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form=new FormData(e.currentTarget);
    setLoading(true);
    try {
      const result=await checkFleetAvailability({asset,employee:readNumber(form,"employee"),site:readNumber(form,"site"),
        from:readDubaiTime(form,"from"),until:readDubaiTime(form,"until")});
      setAnswers(result?.available?["Available for the selected employee, site and dates."]:
        result?result.blockers.map(code=>availabilityBlockers[code]):["Availability could not be checked."]);
    } finally { setLoading(false); }
  }
  return <details className="space-y-3">
    <summary className="cursor-pointer font-medium">Check availability</summary>
    <form onSubmit={check} className="space-y-4 rounded-md border p-4">
      <fieldset className="grid gap-3 sm:grid-cols-2" disabled={loading}>
        <EmployeeAndSite asset={asset} initial={choices} /><WindowFields planned />
      </fieldset>
      <Button type="submit" variant="outline" disabled={loading}>{loading?"Checking…":"Check availability"}</Button>
      <ul aria-live="polite" className="space-y-1 text-sm">{answers.map(message=><li key={message}>{message}</li>)}</ul>
    </form>
  </details>;
}

export function CustodyOccurrenceLookup({asset}:{asset?:number}) {
  const [message,setMessage]=useState("");
  const [pending,setPending]=useState(false);
  async function lookup(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form=new FormData(e.currentTarget);
    setPending(true);
    try {
      const result=await findFleetCustodyAt({asset,at:readDubaiTime(form,"at"),jurisdiction:readFleetText(form,"jurisdiction")||undefined,
        plateClass:readFleetText(form,"plateClass")||undefined,plate:readFleetText(form,"plate")||undefined});
      setMessage(result?.status==="custody-candidate"?`Custody candidate employee #${result.custody_candidate}.`:
        result?.status==="verified-dispatch"?`Verified assignment driver #${result.verified_driver}.`:
        result?.status==="no-record"?"No custody or verified assignment covers that time.":"No permitted custody result is available.");
    } finally { setPending(false); }
  }
  return <details className="space-y-3">
    <summary className="cursor-pointer font-medium">{asset?"Find custody at a time":"Look up a historical plate"}</summary>
    <form onSubmit={lookup} className="space-y-4 rounded-md border p-4">
      <fieldset className="grid gap-3 sm:grid-cols-2" disabled={pending}>
        {asset===undefined&&<>
          <FleetField label="Jurisdiction"><Input name="jurisdiction" maxLength={24} required /></FleetField>
          <FleetField label="Plate class"><Input name="plateClass" maxLength={24} required /></FleetField>
          <FleetField label="Plate number"><Input name="plate" maxLength={32} required /></FleetField>
        </>}
        <FleetField label="Occurrence time (Dubai time)"><Input name="at" type="datetime-local" required /></FleetField>
      </fieldset>
      <Button type="submit" variant="outline" disabled={pending}>{pending?"Searching…":"Find custody"}</Button>
      {message&&<p role="status" className="text-sm">{message}</p>}
    </form>
  </details>;
}

function FleetPolicies({workspace}:{workspace:CustodyWorkspace}) {
  const options=workspace.policy_choices;
  if (!workspace.can_policy||!options) return null;
  const pending=workspace.policies.filter(rule=>!rule.approved&&!rule.prepared_by_me);
  return <details className="space-y-3">
    <summary className="cursor-pointer font-medium">Availability rules for this asset category</summary>
    <ul className="divide-y rounded-md border px-4 text-sm">
      {workspace.policies.map(rule=><li className="py-2" key={rule.id}>
        <strong>{rule.approved?"Approved":"Pending review"}</strong> · {rule.from} to {rule.until} · routine limit {rule.routine_minutes} minutes
        <p>{rule.reason}</p>
        <p className="text-muted-foreground">
          {[
            rule.registration_required&&"Registration",rule.insurance_required&&"Insurance",rule.signed_handover&&"Signed handover",
            options.licences.find(item=>item.id===rule.licence_type)?.label,
            options.access.find(item=>item.id===rule.access_type)?.label,
            options.employee_categories.find(item=>item.id===rule.employee_category)?.label,
            rule.tentative_allowed&&"Tentative bookings available",
          ].filter(Boolean).join(" · ")}
        </p>
      </li>)}
    </ul>
    <CustodyForm workspace={workspace} action="prepare-policy" submitLabel="Prepare for independent approval" fields={f=>({
      category:workspace.category,from:readFleetText(f,"from"),until:readFleetText(f,"until"),routine_minutes:readNumber(f,"routine"),
      tentative_allowed:f.has("tentative_allowed"),signed_handover:f.has("signed_handover"),
      registration_required:f.has("registration_required"),insurance_required:f.has("insurance_required"),
      licence_type:readNumber(f,"licence"),access_type:readNumber(f,"access"),employee_category:readNumber(f,"employee_category"),
      reason:readFleetText(f,"reason"),
    })}>
      <FleetField label="Effective from"><Input name="from" type="date" required /></FleetField>
      <FleetField label="Effective through"><Input name="until" type="date" required /></FleetField>
      <FleetField label="Routine loan limit in minutes"><Input name="routine" type="number" min="15" max="1440" required /></FleetField>
      {([
        ["licence","Required driving licence",options.licences],["access","Required site credential",options.access],
        ["employee_category","Eligible employee category",options.employee_categories],
      ] as const).map(([key,label,items])=><FleetField key={key} label={label}><select name={key} className={fleetSelectClass}>
        <option value="">No requirement selected</option>
        {items.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}
      </select></FleetField>)}
      {[
        ["tentative_allowed","Permit overlapping tentative requests"],["signed_handover","Require signed handover and return"],
        ["registration_required","Require verified registration"],["insurance_required","Require verified insurance"],
      ].map(([key,label])=><label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" name={key} />{label}</label>)}
      <FleetField label="Reason and policy reference"><Input name="reason" maxLength={500} required /></FleetField>
    </CustodyForm>
    {pending.length>0&&<CustodyForm workspace={workspace} action="approve-policy" submitLabel="Approve reviewed rule"
      fields={f=>({id:readNumber(f,"policy"),reason:readFleetText(f,"reason")})}>
      <FleetField label="Rule prepared by another reviewer"><select name="policy" required className={fleetSelectClass}>
        <option value="">Select pending rule</option>{pending.map(rule=><option key={rule.id} value={rule.id}>{rule.from} to {rule.until} · {rule.reason}</option>)}
      </select></FleetField>
      <FleetField label="Review reason"><Input name="reason" maxLength={500} required /></FleetField>
    </CustodyForm>}
  </details>;
}

export function FleetCustodyPanel({workspace,choices}:{workspace:CustodyWorkspace;choices:CustodyChoices}) {
  const [action,setAction]=useState<CustodyAction|null>(null);
  const router=useRouter();
  const visibleActions:CustodyAction[]=[];
  if (workspace.can_manage) visibleActions.push("checkout","return","transfer","request-loan");
  if (workspace.can_approve) visibleActions.push("approve-loan");
  if (workspace.can_plan) visibleActions.push("tentative","reserve","confirm","cancel","dispatch");
  if (workspace.can_workshop||workspace.can_hse) visibleActions.push("place-hold","release-hold");
  const held=workspace.holds.filter(h=>h.released_at===null);
  return <section id="custody" className="space-y-4 rounded-lg border bg-card p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-semibold">Custody and availability</h2>
      <Button type="button" variant="outline" onClick={()=>router.refresh()}>Refresh Fleet status</Button>
    </div>
    {held.length>0&&<ul className="space-y-1 text-sm" aria-label="Active holds">
      {held.map(h=><li key={h.id}><strong>{h.kind==="hse"?"HSE hold":"Workshop hold"}</strong>{h.reason&&` · ${h.reason}`}</li>)}
    </ul>}
    {(workspace.can_manage||workspace.can_plan)&&<AvailabilityForm asset={workspace.asset} choices={choices} />}
    <CustodyOccurrenceLookup asset={workspace.asset} />
    {visibleActions.length>0&&<FleetField label="Fleet action"><select className={fleetSelectClass}
      value={action??""} onChange={e=>setAction((e.target.value||null) as CustodyAction|null)}>
      <option value="">Choose an action</option>
      {visibleActions.map(value=><option key={value} value={value}>{labels[value]}</option>)}
    </select></FleetField>}
    {action&&<CustodyActionForm key={action} workspace={workspace} choices={choices} action={action} />}
    {workspace.loans.length>0&&<ul className="divide-y rounded-lg border px-4 text-sm" aria-label="Loan requests">
      {workspace.loans.map(loan=><li key={loan.id} className="py-2">
        <strong className="capitalize">{loan.status}</strong> · {loan.employee_name} · {loan.site_name}<br />
        <span className="text-muted-foreground">{showFleetTime(loan.start)} to {showFleetTime(loan.until)}</span>
      </li>)}
    </ul>}
    <h3 className="font-medium">Commitments and handover history</h3>
    {workspace.commitments.length===0?<p className="text-sm text-muted-foreground">No permitted history for this asset.</p>:
      <ul className="divide-y rounded-md border px-4 text-sm">
        {workspace.commitments.slice(0,25).map(item=><li key={item.id} className="space-y-1 py-3">
          <p><strong>{item.employee_name}</strong> · {item.site_name} · {item.kind} · {item.status}{item.overdue&&" · Overdue"}</p>
          {item.can_print && <a className="text-primary hover:underline" href={outputPath("custody", item.id)}>Print custody acknowledgement</a>}
          {item.owning_operation?<Link className="text-primary hover:underline" href={`/modules/fleet/operations/${item.owning_operation}`}>Open owning operation</Link>:
            item.managed_by_operation&&<p className="text-muted-foreground">Managed by Fleet Operations</p>}
          <p className="text-muted-foreground">{item.kind==="reservation"?"Planned start":"Actual handover"} {showFleetTime(item.from)}
            {" · "}Planned return {showFleetTime(item.planned_return)}
            {item.actual_return&&` · Actual return ${showFleetTime(item.actual_return)}`}
          </p>
          <details><summary className="cursor-pointer">Events</summary><ul className="space-y-1 pt-1">
            {item.events.map(event=><li key={event.kind}>
              {showFleetTime(event.at)} · {event.kind} · {event.reason}
              {event.condition&&` · ${event.condition}`}{event.meter!==null&&` · ${event.meter} ${event.meter_unit}`}
              {event.discrepancy&&" · Discrepancy"}{event.signed&&" · Signed proof recorded"}
            </li>)}
          </ul></details>
        </li>)}
      </ul>}
    {workspace.commitments.length>25&&
      <a className="text-sm font-medium text-primary hover:underline" href={`?custodyBefore=${workspace.commitments[24].id}#custody`}>Older commitments</a>}
    <FleetPolicies workspace={workspace} />
  </section>;
}
