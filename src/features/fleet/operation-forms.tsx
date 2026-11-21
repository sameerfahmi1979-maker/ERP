"use client";

import { type FormEvent, type ReactNode, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { OperationChoices, OperationCommand, OperationDetail } from "@/lib/fleet/operations-contract";
import { getOperationsChoices, saveFleetOperation } from "@/server/actions/fleet/operations";
import { FleetField, fleetSelectClass, readFleetText } from "./asset-form";

const timeFormatter=new Intl.DateTimeFormat("en-AE",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Dubai"});
const present=(value:string|null)=>value?timeFormatter.format(new Date(value)):"Pending";
const string=(f:FormData,key:string)=>readFleetText(f,key)||undefined;
const number=(f:FormData,key:string)=>string(f,key)?Number(f.get(key)):undefined;
const time=(f:FormData,key:string)=>string(f,key)?`${f.get(key)}:00+04:00`:undefined;
const emptyChoices:OperationChoices={scopes:[],sites:[],parties:[],assets:[],workers:[]};
const actions:Record<OperationCommand["action"],string>={
  create:"Create request",authorize:"Authorize request","plan-leg":"Add or edit planned leg",assign:"Confirm assignment",
  substitute:"Substitute asset or worker",inspect:"Verify pre-trip inspection","issue-paper":"Issue Trip Order",
  start:"Record actual handover","complete-leg":"Record completed leg","resolve-pod":"Verify signed delivery",
  return:"Record actual return","cancel-assignment":"Cancel planned assignment",complete:"Review completion",
  cancel:"Cancel request",reopen:"Reopen completed record","record-sheet":"Record signed rental sheet",
  "resolve-sheet":"Resolve signed sheet interval","approve-handover":"Approve named rental handover",
  "rental-event":"Record rental milestone","extend-rental":"Approve rental extension",
  "prepare-terms":"Prepare quote and agreement terms","approve-terms":"Approve rental terms",
  "prepare-statement":"Prepare statement or amendment","approve-statement":"Approve statement",
};
type Kind=OperationCommand["action"];
type Option={id:string|number;label:string};

export function FinishTripOrder({order,issue}:{order:number;issue:number}) {
  const router=useRouter();
  const [pending,setPending]=useState(false);
  const [error,setError]=useState(false);
  async function finalize() {
    setPending(true);
    setError(false);
    try {
      const response=await fetch(`/print/fleet-trip-order/${order}/${issue}`,{
        method:"POST",headers:{"X-Fleet-Action":"finalize"},
      });
      if (response.status===204) router.refresh();
      else setError(true);
    } catch { setError(true); }
    finally { setPending(false); }
  }
  return <span className="inline-flex items-center gap-2">
    <Button type="button" size="sm" variant="outline" disabled={pending} onClick={()=>void finalize()}>
      {pending?"Preparing PDF…":"Finish issuing PDF"}
    </Button>
    {error&&<span role="status">PDF still pending. Refresh and retry.</span>}
  </span>;
}

function Select({name,label,options,required=true,value,defaultValue,onChange}:{name:string;label:string;options:Option[];
 required?:boolean;value?:string;defaultValue?:string|number;onChange?:(value:string)=>void}) {
  return <FleetField label={label}><select name={name} required={required} value={value} defaultValue={defaultValue}
    onChange={event=>onChange?.(event.target.value)} className={fleetSelectClass}>
    <option value="">{required?"Choose a record":"Optional"}</option>
    {options.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}
  </select></FleetField>;
}

function Field({name,label,type="text",required=true,max=160,defaultValue}:{name:string;label:string;type?:string;required?:boolean;max?:number;defaultValue?:string}) {
  return <FleetField label={label}><Input name={name} type={type} required={required} maxLength={max} defaultValue={defaultValue}
    min={type==="number"?"0":undefined} step={type==="number"?"any":undefined} /></FleetField>;
}

function CommandForm({order,action,fields,children}:{order:number|null;action:Kind;fields:(form:FormData)=>OperationCommand["data"];children:ReactNode}) {
  const router=useRouter();
  const busy=useRef(false);
  const [pending,setPending]=useState(false);
  const [retry,setRetry]=useState<OperationCommand|null>(null);
  const [message,setMessage]=useState("");
  async function submit(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy.current) return;
    busy.current=true;
    setPending(true);
    setMessage("");
    const command=retry??{operation:crypto.randomUUID(),order,action,data:fields(new FormData(e.currentTarget))};
    try {
      const response=await saveFleetOperation(command);
      if ("error" in response) {
        setRetry(response.uncertain?command:null);
        setMessage(response.error??"The record could not be saved.");
        return;
      }
      setRetry(null);
      setMessage("Saved.");
      if (order===null) router.push(`/modules/fleet/operations/${response.data.id}`);
      else router.refresh();
    } catch {
      setRetry(command);
      setMessage("The result is unconfirmed. Retry the original request.");
    } finally {
      busy.current=false;
      setPending(false);
    }
  }
  return <form className="space-y-4 rounded-md border bg-card p-4" onSubmit={submit}>
    <fieldset className="grid gap-3 sm:grid-cols-2" disabled={pending||retry!==null}>{children}</fieldset>
    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" disabled={pending}>{pending?"Saving…":retry?"Retry original request":actions[action]}</Button>
      {message&&<p role="status" className="text-sm text-muted-foreground">{message}</p>}
    </div>
  </form>;
}

function Lookup({company,branch,label,children}:{company:number;branch:number;label:string;
 children:(choices:OperationChoices)=>ReactNode}) {
  const [query,setQuery]=useState("");
  const [choices,setChoices]=useState(emptyChoices);
  const [pending,setPending]=useState(false);
  async function search() {
    setPending(true);
    try {
      const found=await getOperationsChoices(company,branch,query);
      if (!found) return;
      const retain=(previous:{id:number;label:string}[],next:{id:number;label:string}[])=>
        [...new Map([...previous,...next].map(item=>[item.id,item])).values()];
      setChoices(previous=>({...found,parties:retain(previous.parties,found.parties),
        assets:retain(previous.assets,found.assets),workers:retain(previous.workers,found.workers)}));
    }
    finally { setPending(false); }
  }
  return <>
    <FleetField label={label}><Input value={query} maxLength={100} onChange={e=>setQuery(e.target.value)} /></FleetField>
    <Button type="button" variant="outline" className="self-end justify-self-start" disabled={pending||query.trim().length<2}
      onClick={()=>void search()}>{pending?"Searching…":"Search"}</Button>
    {children(choices)}
  </>;
}

export function NewFleetOperation({scopes}:{scopes:OperationChoices["scopes"]}) {
  const [branch,setBranch]=useState("");
  const [kind,setKind]=useState("trip");
  const [choices,setChoices]=useState(emptyChoices);
  const scope=scopes.find(item=>item.branch===Number(branch));
  if (!scopes.length) return null;
  async function select(value:string) {
    setBranch(value);
    setChoices(emptyChoices);
    const item=scopes.find(row=>row.branch===Number(value));
    if (item) setChoices(await getOperationsChoices(item.company,item.branch)??emptyChoices);
  }
  return <details className="space-y-3">
    <summary className="cursor-pointer font-semibold">New Fleet request</summary>
    <CommandForm order={null} action="create" fields={f=>({
      company:scope?.company,branch:scope?.branch,site:number(f,"site"),kind,subject:string(f,"subject"),
      reference:string(f,"reference"),customer:number(f,"customer"),supplier:number(f,"supplier"),
      rental_mode:string(f,"rental_mode"),reason:string(f,"reason"),
    })}>
      <Select name="branch" label="Operating company and branch" value={branch} onChange={value=>void select(value)}
        options={scopes.map(row=>({id:row.branch,label:row.label}))} />
      <Select name="kind" label="Operation" value={kind} onChange={setKind}
        options={[{id:"trip",label:"Transport trip"},{id:"rental",label:"Rental"}]} />
      <Field name="subject" label="Job or rental title" />
      <Field name="reference" label="Job, order or internal request reference" />
      <Select name="site" label="Operating site" options={choices.sites} />
      {kind==="rental"&&<Select name="rental_mode" label="Rental arrangement"
        options={[{id:"wet",label:"Wet · with operator"},{id:"dry",label:"Dry · asset custody"}]} />}
      {scope&&<Lookup key={branch} company={scope.company} branch={scope.branch} label="Find customer or supplier">
        {result=><>
          <Select name="customer" label="Customer" options={result.parties} required={kind==="rental"} />
          {kind==="rental"&&<Select name="supplier" label="Cross-hire supplier" options={result.parties} required={false} />}
        </>}
      </Lookup>}
      <Field name="reason" label="Reason" max={500} />
    </CommandForm>
  </details>;
}

function ProofFields({data,asset,type,prefix,label,required=true}:{data:OperationDetail;asset?:number;type:string;prefix:string;label:string;required?:boolean}) {
  return <>
    <Select name={prefix+"file"} label={label} required={required}
      options={data.proofs.filter(proof=>proof.type===type&&(asset===undefined||proof.asset===asset))
        .map(proof=>({id:proof.file,label:proof.label}))} />
    <Field name={prefix+"reference"} label={label+" paper reference"} required={required} max={100} />
  </>;
}

function Snapshot() {
  const [unknown,setUnknown]=useState(false);
  return <>
    <Select name="condition" label="Actual condition" options={["good","fair","damaged","unknown"].map(id=>({id,label:id}))} />
    {!unknown&&<><Field name="meter" label="Meter reading" type="number" />
      <Select name="meter_unit" label="Meter unit" options={[{id:"km",label:"Kilometres"},{id:"hours",label:"Hours"}]} /></>}
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="meter_unknown" checked={unknown} onChange={e=>setUnknown(e.target.checked)} /> Meter unknown</label>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="meter_discrepancy" /> Record a discrepancy</label>
  </>;
}

const formatKind=(value:string)=>value.replaceAll("-"," ");
const milestones=["off-hire","customer-start","customer-stop","supplier-start","supplier-stop","technical-clearance","claim"];
const assignmentActions:Kind[]=["start","return","substitute","inspect","cancel-assignment","record-sheet","resolve-sheet","approve-handover","rental-event","extend-rental","complete-leg","prepare-terms"];
const actualActions:Kind[]=["return","record-sheet","resolve-sheet","rental-event","extend-rental","complete-leg"];

function allowedCommands(data:OperationDetail):Kind[] {
  const result:Kind[]=[];
  if (data.can_manage&&data.status==="requested") result.push(...(data.kind==="trip"?["plan-leg" as const]:[]),"cancel");
  if (data.can_approve&&data.status==="requested") result.push("authorize");
  if (data.can_manage&&["authorized","active","review"].includes(data.status)) {
    result.push("assign","substitute","cancel-assignment","start","return","complete","cancel");
    if (data.kind==="trip") result.push("inspect","issue-paper","complete-leg","resolve-pod");
    else result.push("record-sheet");
  }
  if (data.kind==="rental"&&["active","review"].includes(data.status)) {
    if (data.can_manage&&data.usage.some(item=>item.state!=="signed"||!item.evidence_current)) result.push("resolve-sheet");
    if (data.can_manage||data.can_approve||data.can_commercial) result.push("rental-event");
    if (data.can_approve) result.push("extend-rental");
  }
  if (data.kind==="rental"&&data.can_approve_handover&&["authorized","active","review"].includes(data.status)&&
    data.assignments.some(item=>item.state==="planned"&&!item.handover_approved)) result.push("approve-handover");
  if (data.kind==="rental"&&data.can_commercial&&data.authorization&&data.status!=="cancelled") {
    result.push("prepare-terms","prepare-statement");
    if (data.can_approve) result.push("approve-terms","approve-statement");
  }
  if (data.can_approve&&data.status==="completed") result.push("reopen");
  return result;
}

function OperationActionForm({data,choices,action}:{data:OperationDetail;choices:OperationChoices;action:Kind}) {
  const [assignment,setAssignment]=useState("");
  const [rows,setRows]=useState([1]);
  const [rowNext,setRowNext]=useState(2);
  const [milestone,setMilestone]=useState("");
  const [legId,setLegId]=useState("");
  const row=data.assignments.find(item=>item.id===Number(assignment));
  const leg=data.legs.find(item=>item.id===Number(legId));
  const planning=["assign","substitute"].includes(action);
  const legAction=action==="plan-leg"||action==="complete-leg";
  const approvedReturn=action==="return"||(action==="substitute"&&row?.state==="active");
  const snapshotNeeded=action==="start"||approvedReturn;
  const availableAssignments=data.assignments.filter(item=>{
    if (action==="approve-handover") return item.state==="planned"&&!item.handover_approved;
    if (["start","inspect","cancel-assignment"].includes(action)) return item.state==="planned";
    if (["substitute"].includes(action)) return ["planned","active"].includes(item.state);
    if (["return","extend-rental"].includes(action)) return item.state==="active";
    if (actualActions.includes(action)) return item.handover!==null;
    return true;
  });
  const proofType=action==="inspect"?"FLEET_PRE_TRIP_INSPECTION":action==="start"?(data.kind==="trip"?"FLEET_TRIP_ORDER":"FLEET_CUSTODY_ACK"):
    ["record-sheet","resolve-sheet"].includes(action)?"FLEET_SIGNED_RENTAL_SHEET":approvedReturn&&data.kind==="rental"?"FLEET_CUSTODY_ACK":
    ["rental-event","extend-rental"].includes(action)?"FLEET_RENTAL_NOTICE":action==="prepare-terms"?"FLEET_RENTAL_AGREEMENT":null;
  function evidence(f:FormData,prefix:string) {
    const file=data.proofs.find(item=>item.file===number(f,prefix+"file"));
    return file?{document:file.document,version:file.version,file:file.file,reference:string(f,prefix+"reference")}:undefined;
  }
  function build(f:FormData):OperationCommand["data"] {
    const result:OperationCommand["data"]={reason:string(f,"reason")};
    if (!["prepare-terms","approve-terms","prepare-statement","approve-statement"].includes(action)) result.revision=data.revision;
    if (assignment) result.assignment=Number(assignment);
    for (const field of ["authorization","load","cargo","delivery","discrepancy","pickup_contact","pickup_phone","delivery_contact","delivery_phone","instructions"])
      if (string(f,field)!==undefined) result[field]=string(f,field);
    for (const field of ["asset","employee","slot","origin","destination","issue","gross_kg","tare_kg","ceiling","rate","currency","terms","quantity","supersedes","id"])
      if (number(f,field)!==undefined) result[field]=number(f,field);
    if (legId) result.leg=Number(legId);
    if (action==="plan-leg") result.sequence=data.legs.length+1;
    if (["start","inspect","return","rental-event"].includes(action)) result.at=time(f,"at");
    if (action==="inspect") result.passed=string(f,"passed")==="true";
    if (action==="start"&&data.kind==="trip") result.offline=f.has("offline");
    if (planning||action==="complete-leg") {result.from=time(f,"from");result.until=time(f,"until");}
    if (action==="extend-rental") result.until=time(f,"until");
    if (action==="rental-event") result.kind=milestone;
    if (snapshotNeeded) {
      const proof=evidence(f,"custody-");
      result.snapshot={
        condition:string(f,"condition"),meter:number(f,"meter"),meter_unit:string(f,"meter_unit"),
        meter_unknown:f.has("meter_unknown"),discrepancy:f.has("meter_discrepancy"),
        document:proof?.document,version:proof?.version,file:proof?.file,
      };
    }
    if (proofType) result.evidence=evidence(f,"paper-");
    const pod=evidence(f,"pod-");const weigh=evidence(f,"weigh-");
    if (pod) result.pod=pod;
    if (weigh) result.weigh=weigh;
    if (action==="record-sheet") result.lines=rows.map(n=>({
      assignment:number(f,`line-${n}-assignment`),
      from:time(f,`line-${n}-from`),until:time(f,`line-${n}-until`),state:string(f,`line-${n}-state`),reason:string(f,`line-${n}-reason`),
    }));
    if (action==="prepare-terms") Object.assign(result,{
      quote:string(f,"quote"),lpo:string(f,"lpo"),unit:string(f,"unit"),from:string(f,"from"),until:string(f,"until"),
    });
    if (action==="prepare-statement") result.usage=f.getAll("usage").map(Number);
    if (action==="resolve-sheet") result.usage=number(f,"usage");
    return result;
  }
  return <CommandForm order={data.id} action={action} fields={build}>
    {assignmentActions.includes(action)&&<Select name="assignment" label="Assignment" value={assignment} onChange={setAssignment}
      options={availableAssignments.map(item=>({id:item.id,label:`Slot ${item.slot} · ${item.asset} · ${item.worker} · ${item.state}${
        action==="approve-handover"?` · ${present(item.from)} to ${present(item.until)}`:""}`}))} />}
    {action==="resolve-sheet"&&<Select name="usage" label="Interval with missing, disputed or stale proof"
      options={data.usage.filter(item=>item.state!=="signed"||!item.evidence_current)
        .map(item=>({id:item.id,label:`${present(item.from)} to ${present(item.until)} · ${item.state}`}))} />}
    {action==="authorize"&&<Field name="authorization" label="Approved service order or internal authorization" />}
    {planning&&<Lookup company={data.company} branch={data.branch} label="Find an asset or employee">
      {results=><>
        <Select name="asset" label="Asset" options={results.assets} />
        <Select name="employee" label={data.rental_mode==="dry"?"Accountable employee":"Driver or operator"} options={results.workers} />
      </>}
    </Lookup>}
    {action==="assign"&&<Field name="slot" label="Resource slot" type="number" />}
    {(planning||action==="complete-leg")&&<>
      <Field name="from" label={planning?"Planned start (Dubai time)":"Actual departure (Dubai time)"} type="datetime-local" />
      <Field name="until" label={planning?"Planned end (Dubai time)":"Actual arrival (Dubai time)"} type="datetime-local" />
    </>}
    {["plan-leg","complete-leg","resolve-pod"].includes(action)&&<Select name="leg" label={action==="plan-leg"?"Existing draft leg to edit":"Route leg"} value={legId} onChange={setLegId}
      required={action!=="plan-leg"}
      options={data.legs.filter(item=>action==="plan-leg"|| (action==="complete-leg"?!item.departed:!!item.departed&&item.actual_load==="loaded"&&!item.pod_current))
        .map(item=>({id:item.id,label:`${item.sequence}. ${item.origin} to ${item.destination}`}))} />}
    {legAction&&<>
      <Select key={`origin-${legId}`} name="origin" label={action==="complete-leg"?"Actual origin":"Planned origin"}
        options={choices.sites} defaultValue={leg?.origin_id} />
      <Select key={`destination-${legId}`} name="destination" label={action==="complete-leg"?"Actual destination":"Planned destination"}
        options={choices.sites} defaultValue={leg?.destination_id} />
      <Select key={`load-${legId}`} name="load" label="Load" defaultValue={leg?.load}
        options={[{id:"loaded",label:"Loaded"},{id:"empty",label:"Empty"}]} />
      <Field key={`cargo-${legId}`} name="cargo" label="Cargo for a loaded leg" required={false} max={240} defaultValue={leg?.cargo??undefined} />
    </>}
    {action==="plan-leg"&&<>
      <Field key={`pickup-name-${legId}`} name="pickup_contact" label="Pickup contact" required={false} max={100} defaultValue={leg?.pickup_contact??undefined} />
      <Field key={`pickup-phone-${legId}`} name="pickup_phone" label="Pickup phone" required={false} max={40} defaultValue={leg?.pickup_phone??undefined} />
      <Field key={`delivery-name-${legId}`} name="delivery_contact" label="Delivery contact" required={false} max={100} defaultValue={leg?.delivery_contact??undefined} />
      <Field key={`delivery-phone-${legId}`} name="delivery_phone" label="Delivery phone" required={false} max={40} defaultValue={leg?.delivery_phone??undefined} />
      <Field key={`instructions-${legId}`} name="instructions" label="Trip instructions" required={false} max={500} defaultValue={leg?.instructions??undefined} />
    </>}
    {action==="complete-leg"&&<>
      <Select name="delivery" label="Delivery evidence" options={["accepted","partial","missing","disputed","not-required"].map(id=>({id,label:formatKind(id)}))} />
      <Field name="discrepancy" label="Discrepancy or missing proof reason" required={false} max={500} />
      <Field name="gross_kg" label="Gross kg" type="number" required={false} />
      <Field name="tare_kg" label="Tare kg" type="number" required={false} />
      <ProofFields data={data} asset={row?.asset_id} type="FLEET_WEIGH_TICKET" prefix="weigh-" label="Weigh ticket" required={false} />
    </>}
    {["complete-leg","resolve-pod"].includes(action)&&<ProofFields data={data} asset={row?.asset_id} type="FLEET_SIGNED_POD"
      prefix="pod-" label="Signed proof of delivery" required={action==="resolve-pod"} />}
    {["inspect","start","return","rental-event"].includes(action)&&<Field name="at" label="Actual time (Dubai time)" type="datetime-local" />}
    {action==="inspect"&&<Select name="passed" label="Inspection decision" options={[{id:"true",label:"Passed"},{id:"false",label:"Held for review"}]} />}
    {action==="start"&&data.kind==="trip"&&<>
      <Select name="issue" label="Current issued Trip Order" options={data.papers.slice(0,1).filter(item=>item.ready)} />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="offline" /> Use signed reference from an outage</label>
    </>}
    {snapshotNeeded&&<><Snapshot />
      {data.kind==="trip"&&<ProofFields data={data} asset={row?.asset_id} type="FLEET_CUSTODY_ACK" prefix="custody-" label="Signed custody acknowledgement" required={false} />}
    </>}
    {proofType&&<ProofFields data={data} asset={row?.asset_id} type={proofType} prefix="paper-" label="Reviewed paper original" />}
    {action==="rental-event"&&<Select name="milestone" label="Milestone" value={milestone} onChange={setMilestone}
      options={milestones.filter(item=>item==="technical-clearance"?data.can_approve:item==="off-hire"?data.can_manage:
        data.can_commercial&&(!item.startsWith("supplier")||data.supplier!==null)).map(id=>({id,label:formatKind(id)}))} />}
    {action==="extend-rental"&&<Field name="until" label="New planned return (Dubai time)" type="datetime-local" />}
    {action==="record-sheet"&&<div className="space-y-3 sm:col-span-2">
      {rows.map((n,index)=><fieldset key={n} className="grid gap-2 rounded-md border p-3 sm:grid-cols-2">
        <legend className="px-1 text-sm">Interval {index+1}</legend>
        <Select name={`line-${n}-assignment`} label="Assignment for this interval" required={false}
          options={availableAssignments.map(item=>({id:item.id,label:`Slot ${item.slot} · ${item.worker}`}))} />
        <Field name={`line-${n}-from`} label="Work from (Dubai time)" type="datetime-local" />
        <Field name={`line-${n}-until`} label="Work until (Dubai time)" type="datetime-local" />
        <Select name={`line-${n}-state`} label="Sheet status" options={["signed","disputed","missing"].map(id=>({id,label:id}))} />
        <Field name={`line-${n}-reason`} label="Dispute or missing evidence reason" required={false} max={500} />
        {rows.length>1&&<Button type="button" variant="ghost" onClick={()=>setRows(items=>items.filter(item=>item!==n))}>Remove interval</Button>}
      </fieldset>)}
      <Button type="button" variant="outline" disabled={rows.length>=40} onClick={()=>{setRows(items=>[...items,rowNext]);setRowNext(n=>n+1);}}>Add interval</Button>
    </div>}
    {action==="prepare-terms"&&<>
      <Field name="quote" label="Approved quote reference" max={100} /><Field name="lpo" label="LPO reference" max={100} />
      <Select name="currency" label="Currency" options={data.currencies} />
      <Select name="unit" label="Rate unit" options={["hour","day","trip","tonne","fixed"].map(id=>({id,label:id}))} />
      <Field name="rate" label="Unit rate" type="number" /><Field name="ceiling" label="Approved LPO ceiling" type="number" />
      <Field name="from" label="Effective from" type="date" /><Field name="until" label="Effective through" type="date" />
    </>}
    {action==="approve-terms"&&<Select name="id" label="Terms to approve"
      options={data.terms.filter(item=>!item.approved).map(item=>({id:item.id,label:`${item.lpo} · ${item.currency} ${item.rate} per ${item.unit}`}))} />}
    {action==="prepare-statement"&&<>
      <Select name="terms" label="Approved hourly terms" options={data.terms.filter(item=>item.approved&&item.unit==="hour")
        .map(item=>({id:item.id,label:`${item.lpo} · ${item.currency} ${item.rate} per hour`}))} />
      <Select name="supersedes" label="Current statement to amend" required={false}
        options={data.statements.filter(item=>item.approved&&!data.statements.some(next=>next.approved&&next.supersedes===item.id))
          .map(item=>({id:item.id,label:`Statement ${item.id} · ${item.amount}`}))} />
      <Field name="quantity" label="Verified billable hours" type="number" />
      <fieldset className="grid gap-2"><legend className="text-sm font-medium">Signed usage intervals</legend>
        {data.usage.filter(item=>item.state==="signed"&&item.evidence_current&&item.document!==null).map(item=><label key={item.id} className="flex items-center gap-2 text-sm">
          <input name="usage" type="checkbox" value={item.id} /> {present(item.from)} to {present(item.until)}
        </label>)}
      </fieldset>
    </>}
    {action==="approve-statement"&&<Select name="id" label="Statement to approve"
      options={data.statements.filter(item=>!item.approved).map(item=>({id:item.id,label:`Statement ${item.id} · ${item.quantity} hours · ${item.amount}`}))} />}
    <Field name="reason" label="Reason or verification note" max={500} />
  </CommandForm>;
}

export function FleetOperationControls({data,choices}:{data:OperationDetail;choices:OperationChoices}) {
  const [action,setAction]=useState("");
  const allowed=allowedCommands(data);
  if (!allowed.length) return null;
  return <div className="space-y-3">
    <Select name="action" label="Operation action" options={allowed.map(id=>({id,label:actions[id]}))}
      required={false} value={action} onChange={setAction} />
    {allowed.includes(action as Kind)&&<OperationActionForm key={action} data={data} choices={choices} action={action as Kind} />}
  </div>;
}
