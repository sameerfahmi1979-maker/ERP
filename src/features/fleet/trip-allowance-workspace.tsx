"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FleetField, fleetSelectClass } from "@/features/fleet/asset-form";
import type { AllowanceOrder, DirectionalRates } from "@/lib/fleet/allowance-contract";
import { witnessKind } from "@/lib/fleet/allowance-contract";
import { saveTripAllowance, saveTripAllowanceRate } from "@/server/actions/fleet/trip-allowances";

const proofLabel = {
  "customer-confirmation":"Customer confirmation",
  "destination-weighbridge":"Destination weighbridge ticket",
  "site-receipt":"Destination site receipt",
} as const;
const proofType = {
  "customer-confirmation":"FLEET_CUSTOMER_DELIVERY_CONFIRMATION",
  "destination-weighbridge":"FLEET_WEIGH_TICKET",
  "site-receipt":"FLEET_DESTINATION_SITE_RECEIPT",
} as const;
const statusLabels: Record<string,string> = {
  empty:"Empty leg · zero allowance", ready:"Ready for Accounts review", accepted:"Accepted by Accounts",
  claimed:"Payroll claim recorded", "rate-review":"Rate recheck required", "missing-rate":"Approved rate missing",
  "pod-review":"Delivery proof required", "assignment-review":"Assignment review required",
};
const dateTime = new Intl.DateTimeFormat("en-AE",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Dubai"});
const fileHref = (id:number) => "/api/dms/file?fileId="+id;

type FormResult = {id?:number;error?:string;uncertain?:boolean};
function DecisionForm({label,submit,children}:{
  label:string;submit:(operation:string,values:FormData)=>Promise<FormResult>;children?:ReactNode;
}) {
  const router=useRouter();
  const original=useRef<{operation:string;values:FormData;send:typeof submit}|null>(null);
  const sending=useRef(false);
  const [busy,setBusy]=useState(false);
  const [retry,setRetry]=useState(false);
  const [problem,setProblem]=useState("");
  async function apply(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;
    sending.current=true;
    setBusy(true);
    original.current??={operation:crypto.randomUUID(),values:new FormData(event.currentTarget),send:submit};
    try {
      const request=original.current;
      const result=await request.send(request.operation,request.values);
      setRetry(Boolean(result.uncertain));
      if (!result.uncertain) original.current=null;
      setProblem(result.error??"Saved.");
      if (result.id) router.refresh();
    } catch {
      setRetry(true);
      setProblem("Outcome unconfirmed. Retry the original request.");
    } finally {
      sending.current=false;
      setBusy(false);
    }
  }
  return <form onSubmit={apply} className="space-y-2 rounded-md border p-3">
    <fieldset disabled={busy||retry} className="grid gap-3 sm:grid-cols-2">
      {children}
      <FleetField label="Reason"><Input name="reason" maxLength={500} required /></FleetField>
    </fieldset>
    <Button type="submit" size="sm" disabled={busy}>{busy?"Saving…":retry?"Retry original request":label}</Button>
    {problem&&<p role="status">{problem}</p>}
  </form>;
}

type Leg=AllowanceOrder["legs"][number];
function WitnessForm({data,leg}:{data:AllowanceOrder;leg:Leg}) {
  const [kind,setKind]=useState<keyof typeof proofType|"">("");
  const [selected,setSelected]=useState("");
  const choices=kind?leg.sources.filter(s=>s.type===proofType[kind]):[];
  const current=choices.find(s=>s.file===Number(selected));
  return <DecisionForm label="Submit proof exception" submit={(operation,f)=>saveTripAllowance({
    actual:leg.id,operation,action:"submit-exception",data:{
      kind,evidence:current&&{document:current.document,version:current.version,file:current.file,reference:f.get("reference")},
      observed:{trip:f.get("trip"),sequence:Number(f.get("sequence")),asset:f.get("asset"),origin:Number(f.get("origin")),
        destination:Number(f.get("destination")),delivered:String(f.get("delivered"))+":00+04:00",
        issuer:f.has("issuer")?Number(f.get("issuer")):undefined},
      reason:f.get("reason"),
    },
  })}>
    <FleetField label="Independent evidence type">
      <select className={fleetSelectClass} required value={kind} onChange={e=>{
        const parsed=witnessKind.safeParse(e.target.value);
        setKind(parsed.success?parsed.data:"");
        setSelected("");
      }}>
        <option value="">Choose</option>
        {witnessKind.options.map(k=><option key={k} value={k}>{proofLabel[k]}</option>)}
      </select>
    </FleetField>
    <FleetField label="Verified DMS original">
      <select className={fleetSelectClass} required value={selected} onChange={e=>setSelected(e.target.value)}>
        <option value="">{kind&&choices.length===0?"No permitted original is available":"Choose an original"}</option>
        {choices.map(s=><option key={s.file} value={s.file}>{s.label} · Version {s.version}</option>)}
      </select>
    </FleetField>
    {current&&<a className="text-primary underline" href={fileHref(current.file)} target="_blank" rel="noreferrer">Open selected original</a>}
    <p className="self-center text-sm text-muted-foreground">Enter the values you read on the witness original.</p>
    <FleetField label="Witness paper reference"><Input name="reference" maxLength={100} required /></FleetField>
    <FleetField label="Trip reference on witness"><Input name="trip" maxLength={100} required /></FleetField>
    <FleetField label="Leg number on witness"><Input name="sequence" type="number" min={1} max={50} required /></FleetField>
    <FleetField label="Fleet number on witness"><Input name="asset" maxLength={100} required /></FleetField>
    <FleetField label="Observed origin"><select name="origin" className={fleetSelectClass} required>
      <option value="">Choose</option><option value={leg.origin_id}>{leg.origin}</option><option value={leg.destination_id}>{leg.destination}</option>
    </select></FleetField>
    <FleetField label="Observed destination"><select name="destination" className={fleetSelectClass} required>
      <option value="">Choose</option><option value={leg.origin_id}>{leg.origin}</option><option value={leg.destination_id}>{leg.destination}</option>
    </select></FleetField>
    <FleetField label="Delivery time on witness (Dubai time)"><Input name="delivered" type="datetime-local" required /></FleetField>
    {kind==="customer-confirmation"&&<FleetField label="Customer who confirmed delivery">
      <select name="issuer" className={fleetSelectClass} required>
        <option value="">Choose</option>
        {data.customer!==null&&<option value={data.customer}>{data.customer_label??"Trip customer"}</option>}
      </select>
    </FleetField>}
  </DecisionForm>;
}

export function TripAllowanceWorkspace({data}:{data:AllowanceOrder}) {
  return <section className="space-y-4">
    {data.legs.length===0&&<p className="text-sm text-muted-foreground">No completed legs are available.</p>}
    {data.legs.map(leg=><article key={leg.id} className="space-y-3 rounded-md border p-4 text-sm">
      <h2 className="font-semibold">Leg {leg.sequence} · {leg.origin} → {leg.destination}</h2>
      <p>{leg.worker} · {leg.asset} {leg.truck&&" · "+leg.truck} · {leg.date}</p>
      <p>{statusLabels[leg.state]??leg.state}</p>
      {leg.load==="loaded"&&<p>{leg.has_signed_pod?"Signed POD accepted":"Signed POD follow-up pending"}
        {!leg.has_signed_pod&&leg.proof_available&&" · Allowance witness approved"}</p>}
      {leg.load==="loaded"&&(data.can_approve||data.can_payroll)&&leg.current_rate&&
        <p>Assignment rate version {leg.assigned_rate??"missing"} · Current rate version {leg.current_rate}</p>}
      {leg.amount&&<p className="font-medium">{leg.currency} {leg.amount} for this leg</p>}
      {leg.proof&&<a className="text-primary underline" href={fileHref(leg.proof.file)} target="_blank" rel="noreferrer">
        Proof {leg.proof.reference} · Version {leg.proof.version}
      </a>}
      {leg.can_decide&&leg.rate_needs_review&&leg.route_digest&&
        <DecisionForm label="Confirm current route and rate" submit={(operation,f)=>saveTripAllowance({
          actual:leg.id,operation,action:"review-rate",data:{digest:leg.route_digest,reason:f.get("reason")},
        })} />}
      {data.can_submit&&leg.load==="loaded"&&!leg.proof_available&&!leg.exceptions.some(x=>x.state==="pending")&&
        <details className="space-y-2"><summary className="cursor-pointer font-medium">Submit a POD exception</summary><WitnessForm data={data} leg={leg}/></details>}
      {leg.exceptions.map(entry=><section key={entry.id} className="space-y-2 rounded-md bg-muted/40 p-3">
        <h3 className="font-medium">{proofLabel[entry.kind]} · {entry.state}</h3>
        <p>{entry.reason}{entry.decision_reason&&" · "+entry.decision_reason}</p>
        {entry.file&&<a href={fileHref(entry.file)} target="_blank" rel="noreferrer" className="text-primary underline">Reviewed original · Version {entry.version}</a>}
        {entry.observed&&<p>Witness {entry.observed.trip} · Leg {entry.observed.sequence} · {entry.observed.asset} · Delivered {dateTime.format(new Date(entry.observed.delivered))}</p>}
        {entry.can_decide&&<details className="space-y-2">
          <summary className="cursor-pointer font-medium">Decide exception</summary>
          <DecisionForm label="Save independent decision" submit={(operation,f)=>saveTripAllowance({
            actual:leg.id,operation,action:f.get("decision"),data:{id:entry.id,reason:f.get("reason")},
          })}>
            <FleetField label="Decision"><select name="decision" className={fleetSelectClass} required>
              <option value="">Compare the original first</option>
              <option value="approve-exception">Approve matching witness</option><option value="reject-exception">Reject witness</option>
            </select></FleetField>
          </DecisionForm>
        </details>}
      </section>)}
      {leg.can_accept&&leg.state==="ready"&&leg.digest&&
        <DecisionForm label="Accept for payroll" submit={(operation,f)=>saveTripAllowance({
          actual:leg.id,operation,action:"accept",data:{digest:leg.digest,reason:f.get("reason")},
        })} />}
      {data.can_submit&&leg.settled&&!leg.changes.some(c=>!c.decided)&&
        <details className="space-y-2">
          <summary className="cursor-pointer font-medium">Propose a settled allowance correction</summary>
          <DecisionForm label="Submit correction" submit={(operation,f)=>saveTripAllowance({
            actual:leg.id,operation,action:"propose-adjustment",data:{mode:f.get("mode"),reason:f.get("reason")},
          })}>
            <FleetField label="Correction"><select className={fleetSelectClass} name="mode" required>
              <option value="void">Reverse settled allowance</option><option value="reprice">Use current approved rate</option>
            </select></FleetField>
          </DecisionForm>
        </details>}
      {leg.changes.map(change=><section key={change.id} className="space-y-2 rounded-md border p-3">
        <p>{change.mode==="void"?"Reversal":"Rate correction"} · {change.outcome??"Awaiting Accounts"} · {change.reason}</p>
        {change.amount&&<p>{change.currency} {change.amount}</p>}
        {change.can_accept&&<DecisionForm label="Save Accounts decision" submit={(operation,f)=>saveTripAllowance({
          actual:leg.id,operation,action:f.get("decision"),data:{id:change.id,reason:f.get("reason")},
        })}>
          <FleetField label="Decision"><select className={fleetSelectClass} name="decision" required>
            <option value="">Choose</option><option value="accept-adjustment">Accept linked adjustment</option>
            <option value="reject-adjustment">Reject correction proposal</option>
          </select></FleetField>
        </DecisionForm>}
        {change.withdraw_version&&<DecisionForm label="Withdraw stale, unclaimed adjustment" submit={(operation,f)=>saveTripAllowance({
          actual:leg.id,operation,action:"withdraw-adjustment",data:{id:change.withdraw_version,reason:f.get("reason")},
        })} />}
      </section>)}
    </article>)}
  </section>;
}

export function AllowanceRateWorkspace({company,data}:{company:number;data:DirectionalRates}) {
  return <section className="space-y-4">
    {data.can_prepare&&<details className="space-y-2">
      <summary className="cursor-pointer font-semibold">Prepare a directional rate</summary>
      <DecisionForm label="Prepare rate" submit={(operation,f)=>saveTripAllowanceRate({
        operation,company,action:"prepare",data:{origin:Number(f.get("origin")),destination:Number(f.get("destination")),truck_type:f.get("truck"),
          from:f.get("from"),until:f.get("until")||undefined,amount:f.get("amount"),currency:f.get("currency"),reason:f.get("reason")},
      })}>
        {(["origin","destination"] as const).map(key=><FleetField key={key} label={key==="origin"?"From":"To"}>
          <select name={key} className={fleetSelectClass} required><option value="">Choose a site</option>
            {data.sites.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </FleetField>)}
        <FleetField label="Truck body type"><Input name="truck" list="trip-truck-types" maxLength={120} required />
          <datalist id="trip-truck-types">{data.truck_types.map(type=><option value={type} key={type}/>)}</datalist>
        </FleetField>
        <FleetField label="Rate per loaded leg"><Input name="amount" type="number" min={0.01} step="0.01" required /></FleetField>
        <FleetField label="Currency"><select className={fleetSelectClass} name="currency" required>
          <option value="">Choose</option>{data.currencies.map(c=><option key={c}>{c}</option>)}
        </select></FleetField>
        <FleetField label="Effective from"><Input name="from" type="date" required /></FleetField>
        <FleetField label="End date (exclusive, optional)"><Input name="until" type="date" /></FleetField>
      </DecisionForm>
    </details>}
    {data.rates.length===0&&<p className="text-sm text-muted-foreground">No directional rates have been prepared.</p>}
    {data.rates.slice(0,25).map(rate=><article className="space-y-2 rounded-md border p-3 text-sm" key={rate.id}>
      <h2 className="font-semibold">{rate.origin} → {rate.destination} · {rate.truck}</h2>
      <p>{rate.currency} {rate.amount} · From {rate.from}{rate.until&&" until "+rate.until} · {rate.approved?"Approved":"Awaiting independent approval"}</p>
      <p>{rate.reason}</p>
      {rate.can_decide&&<DecisionForm label="Approve this rate version" submit={(operation,f)=>saveTripAllowanceRate({
        operation,company,action:"approve",data:{id:rate.id,reason:f.get("reason")},
      })}/>}
    </article>)}
  </section>;
}
