"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useReadLifetime } from "@/hooks/use-read-lifetime";
import { payrollToday } from "@/lib/hr/payroll/salary-as-of";
import { invalidateHrEmployeeTime, invalidateHrGlobalLeaveRequests } from "@/lib/query/invalidation";
import type { AuthContext } from "@/lib/rbac/check";
import {
  approveLeaveBalanceSetup, changeAssistedLeave, listAssistedLeave, previewAssistedLeave,
  proposeLeaveBalanceSetup, readAssistedLeave, readAssistedLeaveBalance, readAssistedSickCertificates,
  readLeaveBalanceSetup, verifyAssistedSickCertificate,
} from "@/server/actions/hr/leave-operations";

export const assistedLeaveCapabilities = ["hr.leave.assist", "hr.leave.approve", "hr.leave.sick.review"] as const;
type Request = NonNullable<Awaited<ReturnType<typeof readAssistedLeave>>>;
type Review = NonNullable<Awaited<ReturnType<typeof readLeaveBalanceSetup>>>;
type Receipt = NonNullable<Awaited<ReturnType<typeof changeAssistedLeave>>["data"]>;
type Write = () => ReturnType<typeof changeAssistedLeave>;
type Action = "review" | "approve" | "approve-exception" | "reject" | "withdraw" | "return" | "cancel";
const selectStyle = "rounded-md border bg-background p-2 text-sm";

function LeaveDateSegments({ days }: { days: { day: string; rate: number }[] }) {
  const ranges: { start: string; end: string; rate: number }[] = [];
  for (const { day, rate } of days) {
    const last = ranges.at(-1);
    if (last?.rate === rate && Date.parse(day) - Date.parse(last.end) === 86400000) last.end = day;
    else ranges.push({ start: day, end: day, rate });
  }
  return <ul className="text-sm" aria-label="Leave date segments">{ranges.map(range =>
    <li key={range.start}>{range.start}{range.start !== range.end && <> to {range.end}</>} · {range.rate === 1 ? "Paid" : range.rate === 0 ? "Unpaid" : `${range.rate * 100}% paid`}</li>)}</ul>;
}

export function AssistedLeavePanel({ employee, identity, authContext }: { employee: number; identity: string; authContext: AuthContext }) {
  const life = useReadLifetime(identity), qc = useQueryClient();
  const has = (permission: string) => authContext.permissionCodes.includes(permission);
  const assist = has("hr.leave.assist"), gm = has("hr.leave.approve"), medical = has("hr.leave.sick.review");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [retry, setRetry] = useState<{ write: Write; complete: (value: Receipt) => void } | null>(null);
  const [category, setCategory] = useState<Request["category"]>("annual");
  const [dates, setDates] = useState({ from: "", to: "" });
  const [reason, setReason] = useState(""), [returnDay, setReturnDay] = useState("");
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewAssistedLeave>> | null>(null);
  const [list, setList] = useState<Awaited<ReturnType<typeof listAssistedLeave>>>(null);
  const [record, setRecord] = useState<Request | null>(null), [revising, setRevising] = useState(false);
  const [choices, setChoices] = useState<Awaited<ReturnType<typeof readAssistedSickCertificates>>>(null);
  const [certificateId, setCertificateId] = useState("");
  const [day, setDay] = useState(payrollToday);
  const [balance, setBalance] = useState<Awaited<ReturnType<typeof readAssistedLeaveBalance>> | null>(null);
  const [kind, setKind] = useState<Review["kind"]>("opening");
  const [facts, setFacts] = useState({ earned:"", annual_used:"", sick_used:"", source:"", destination:"", days:"", evidence_reference:"" });
  const [reference, setReference] = useState(""), [setup, setSetup] = useState<Review | null>(null);
  const locked = busy || !!retry;
  if (!life.enabled) return null;

  const read = async (action: () => Promise<void>) => {
    if (!life.active || locked) return;
    setBusy(true); setMessage("");
    try { await action(); }
    catch { if (life.active) setMessage("The leave record could not be loaded. Try again."); }
    finally { if (life.active) setBusy(false); }
  };
  const dispatch = async (write: Write, complete: (value: Receipt) => void) => {
    if (!life.active || busy) return;
    const original = retry ?? { write, complete };
    setBusy(true); setRetry(original); setMessage("");
    try {
      const result = await original.write();
      if (!life.active) return;
      if (!result.uncertain) setRetry(null);
      if (result.data) {
        setMessage("Saved.");
        invalidateHrEmployeeTime(qc, employee);
        invalidateHrGlobalLeaveRequests(qc);
        original.complete(result.data);
      } else {
        if (!result.uncertain) setPreview(null);
        setMessage(result.error);
      }
    } catch {
      if (life.active) setMessage("The result is unconfirmed. Retry the original request.");
    } finally { if (life.active) setBusy(false); }
  };
  const openRequest = async (id: number) => {
    const result = await readAssistedLeave(employee, id);
    if (life.active) { setRecord(result); setChoices(null); setCertificateId(""); if (!result) setMessage("Request unavailable."); }
  };
  const finishRequest = ({ id }: Receipt) => {
    setPreview(null); setRevising(false); setBalance(null); setReason("");
    void openRequest(id).catch(() => { if (life.active) setMessage("Saved. Reload the request to see the result."); });
    void listAssistedLeave(employee).then(rows => { if (life.active) setList(rows); }).catch(() => {});
  };
  const savePreview = () => {
    if (preview?.status !== "ready") return;
    const operation = crypto.randomUUID();
    const data = { ...dates, fingerprint: preview.fingerprint, ...(revising ? { revision: record?.revision } : { category }) };
    return dispatch(() => changeAssistedLeave({ employee, id: revising ? record?.id : null, action: revising ? "revise" : "submit", operation, data }), finishRequest);
  };
  const decide = (action: Action) => {
    if (!record) return;
    const id = record.id, operation = crypto.randomUUID();
    const data = { revision: record.revision, ...(["return","cancel","reject","approve-exception"].includes(action) ? { reason } : {}),
      ...(action === "return" ? { from: returnDay } : {}) };
    return dispatch(() => changeAssistedLeave({ employee, id, action, operation, data }), finishRequest);
  };
  const verify = () => {
    const selected = choices?.find(choice => String(choice.medical_id) === certificateId);
    if (!selected || !record) return;
    const operation = crypto.randomUUID(), { id, revision } = record;
    return dispatch(() => verifyAssistedSickCertificate({ employee, id, revision, medicalId: selected.medical_id, version: selected.version_id, operation }), finishRequest);
  };
  const prepareBalance = () => {
    const operation = crypto.randomUUID();
    const values = kind === "opening" ? { cutoff: day, earned: Number(facts.earned), annual_used: Number(facts.annual_used), sick_used: Number(facts.sick_used) }
      : { destination: Number(facts.destination), days: Number(facts.days), ...(kind === "carry" ? { source: Number(facts.source) } : {}) };
    return dispatch(() => proposeLeaveBalanceSetup({ employee, kind, operation, facts: { ...values, evidence_reference: facts.evidence_reference } }),
      result => { setReference(String(result.id)); setMessage(`Balance proposal #${result.id} is ready for independent review.`); });
  };
  const act = (label: string, action: Action, enabled = true) => <Button type="button" size="sm" variant="outline" disabled={locked || !enabled} onClick={() => void decide(action)}>{label}</Button>;
  const pending = record?.status === "pending" || record?.status === "reviewed";
  const approver = record?.category === "sick" ? medical : gm;
  const eligibleException = gm && has("hr.leave.sick.exception") && record?.cutoff_due && record.evidence_status === "pending" && record.cutoff_due <= payrollToday();
  const editable = (key: keyof typeof facts, label: string, number = true) => <label className="text-sm">{label}
    <Input aria-label={label} type={number ? "number" : "text"} step={key === "sick_used" || key === "source" || key === "destination" ? "1" : "0.01"}
      value={facts[key]} disabled={locked} onChange={event => setFacts(previous => ({ ...previous, [key]: event.target.value }))}/></label>;

  return <section className="space-y-4 rounded-md border p-4" aria-label="Assisted leave" onKeyDown={e => { if (e.key === "Enter" && e.target instanceof HTMLInputElement) e.preventDefault(); }}>
    <h3 className="font-semibold">Assisted leave</h3>
    {retry && <Button type="button" size="sm" disabled={busy} onClick={() => void dispatch(retry.write, retry.complete)}>Retry original action</Button>}
    {message && <p role="status" className="text-sm">{message}</p>}
    {assist && <details open={revising || undefined} className="space-y-2">
      <summary className="cursor-pointer font-medium">{revising ? "Revise pending request" : "Prepare a leave request"}</summary>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-sm">Leave type <select className={selectStyle} value={category} disabled={locked || revising} onChange={e => { setCategory(e.target.value as Request["category"]); setPreview(null); }}>
          <option value="annual">Annual leave</option><option value="unpaid">Unpaid leave</option><option value="sick">Sick leave</option></select></label>
        {(["from","to"] as const).map((field) => <label className="text-sm" key={field}>{field === "from" ? "From" : "To"}
          <Input type="date" value={dates[field]} disabled={locked} onChange={e => { setDates(prev => ({...prev, [field]:e.target.value})); setPreview(null); }}/></label>)}
      </div>
      <Button type="button" size="sm" variant="outline" disabled={locked || !dates.from || !dates.to} onClick={() => void read(async () => {
        const result = await previewAssistedLeave(employee, category, dates.from, dates.to, revising ? record?.id : undefined);
        if (life.active) setPreview(result);
      })}>Preview dates and pay</Button>
      {preview?.status === "review-required" && <p>{preview.reason}</p>}
      {preview?.status === "ready" && <>
        <p>{preview.paid_days} paid · {preview.partial_days} partly paid · {preview.unpaid_days} unpaid</p>
        <LeaveDateSegments days={preview.days}/>
        <Button type="button" size="sm" disabled={locked} onClick={() => void savePreview()}>{revising ? "Save revised dates" : "Submit on behalf of employee"}</Button>
      </>}
      {revising && <Button type="button" size="sm" variant="outline" disabled={locked} onClick={() => { setRevising(false); setPreview(null); }}>Close revision</Button>}
    </details>}
    <details className="space-y-2">
      <summary className="cursor-pointer font-medium">Review requests</summary>
      <Button type="button" size="sm" variant="outline" disabled={locked} onClick={() => void read(async () => {
        const rows = await listAssistedLeave(employee); if (life.active) { setList(rows); if (!rows) setMessage("Requests could not be verified."); }
      })}>Load recent requests</Button>
      {list?.length === 0 && <p>No assisted requests recorded.</p>}
      {list?.map(item => <div key={item.id}><Button type="button" variant="link" disabled={locked} onClick={() => void read(async () => {
        await openRequest(item.id); if (life.active) { setRevising(false); setPreview(null); }
      })}>#{item.id} · {item.category} · {item.from} to {item.to} · {item.status}</Button></div>)}
      {record && <div className="space-y-3 rounded border p-3">
        <p className="font-medium">{record.category} leave #{record.id} · {record.status}</p>
        {record.employee_reason && <p className="text-sm">Employee’s reason · {record.employee_reason}</p>}
        <LeaveDateSegments days={record.days}/>
        {record.evidence_status && <p>Certificate evidence {record.evidence_status}</p>}
        {record.cutoff_due && record.evidence_status === "pending" && <p>Independent cutoff review from {record.cutoff_due}</p>}
        {pending && record.category === "sick" && medical && has("hr.medical.view") && has("hr.medical.manage") && <>
          <Button type="button" size="sm" variant="outline" disabled={locked} onClick={() => void read(async () => {
            const result = await readAssistedSickCertificates(employee, record.id);
            if (life.active) { setChoices(result); if (!result) setMessage("Certificate choices are unavailable."); }
          })}>Load verified certificates</Button>
          {choices?.length === 0 && <p>No verified certificate matches these dates.</p>}
          {!!choices?.length && <div className="flex flex-wrap gap-2">
            <select aria-label="Verified certificate" className={selectStyle} disabled={locked} value={certificateId} onChange={e => setCertificateId(e.target.value)}>
              <option value="">Choose certificate</option>{choices.map(value => <option key={value.medical_id} value={value.medical_id}>{value.label}</option>)}
            </select>
            <Button type="button" size="sm" disabled={locked || !certificateId} onClick={() => void verify()}>Verify evidence for request</Button>
          </div>}
        </>}
        {((record.status === "reviewed" || record.status === "approved") && approver || eligibleException) &&
          <label className="block max-w-xl text-sm">Decision reason <Input value={reason} disabled={locked} maxLength={1000} onChange={e => setReason(e.target.value)}/></label>}
        <div className="flex flex-wrap gap-2">
          {assist && record.status === "pending" && act("Confirm PRO review", "review")}
          {assist && pending && <>
            <Button type="button" size="sm" variant="outline" disabled={locked} onClick={() => { setCategory(record.category); setDates({ from: record.from, to: record.to }); setRevising(true); setPreview(null); }}>Revise dates</Button>
            {act("Withdraw request", "withdraw")}
          </>}
          {record.status === "reviewed" && approver && <>
            {act("Approve reviewed leave", "approve", record.category !== "sick" || record.evidence_status === "verified")}
            {act("Reject", "reject", !!reason.trim())}
          </>}
          {record.status === "reviewed" && eligibleException && act("Approve configured exception", "approve-exception", !!reason.trim())}
          {record.status === "approved" && approver && <>
            <label className="text-sm">First day back <Input type="date" value={returnDay} disabled={locked} onChange={e => setReturnDay(e.target.value)}/></label>
            {act("Record early return", "return", !!returnDay && !!reason.trim())}
            {act("Cancel remaining leave", "cancel", !!reason.trim())}
          </>}
        </div>
      </div>}
    </details>
    <details className="space-y-2">
      <summary className="cursor-pointer font-medium">Verified balances and carry-forward</summary>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">Date in entitlement period <Input type="date" value={day} disabled={locked} onChange={e => { setDay(e.target.value); setBalance(null); }}/></label>
        <Button type="button" size="sm" variant="outline" disabled={locked || !day} onClick={() => void read(async () => {
          const result = await readAssistedLeaveBalance(employee, day); if (life.active) setBalance(result);
        })}>Check balance</Button>
      </div>
      {balance?.status === "review-required" && <p>{balance.reason}</p>}
      {balance?.status === "ready" && <div className="text-sm">
        <p>Period #{balance.id} · {balance.period_start} to {balance.period_end} · Balance on {balance.as_of_date}</p>
        <p>{balance.full_entitlement} entitlement · {balance.earned} earned · {balance.reserved} pending reservation · {balance.approved_usage} used · {balance.available} verified available · {balance.carry_available} available from carry</p>
      </div>}
      {assist && <div className="grid max-w-xl gap-2">
        <label className="text-sm">Balance change <select className={selectStyle} value={kind} disabled={locked} onChange={e => setKind(e.target.value as Review["kind"])}>
          <option value="opening">Reviewed opening at selected date</option><option value="carry">Carry-forward</option><option value="adjustment">Reviewed adjustment</option></select></label>
        {kind === "opening" ? <>
          {editable("earned","Earned days at cutoff")}{editable("annual_used","Annual days already used")}{editable("sick_used","Sick days already used")}
        </> : <>
          {kind === "carry" && editable("source","Source period number")}{editable("destination","Receiving period number")}{editable("days","Days")}
        </>}
        {editable("evidence_reference","Reviewed source reference",false)}
        <Button type="button" size="sm" disabled={locked || !facts.evidence_reference.trim() || (kind === "opening"
          ? !day || !facts.earned || !facts.annual_used || !facts.sick_used : !facts.destination || !facts.days || (kind === "carry" && !facts.source))}
          onClick={() => void prepareBalance()}>Prepare balance proposal</Button>
      </div>}
      {gm && <div className="max-w-xl space-y-2">
        <label className="text-sm">Balance proposal number <Input type="number" min={1} step={1} value={reference} disabled={locked} onChange={e => { setReference(e.target.value); setSetup(null); }}/></label>
        <Button type="button" size="sm" variant="outline" disabled={locked || !reference} onClick={() => void read(async () => {
          const result = await readLeaveBalanceSetup(Number(reference));
          if (life.active) { setSetup(result?.employee_id === employee ? result : null); if (result?.employee_id !== employee) setMessage("Balance proposal unavailable for this employee."); }
        })}>Review balance proposal</Button>
        {setup && <>
          <p>{setup.kind} proposal #{setup.id}</p>
          <dl>{Object.entries(setup.facts).map(([key,value]) => <div key={key} className="flex gap-2"><dt>{key.replaceAll("_"," ")}</dt><dd>{value}</dd></div>)}</dl>
          <Button type="button" size="sm" disabled={locked || setup.approved} onClick={() => {
            const operation = crypto.randomUUID();
            void dispatch(() => approveLeaveBalanceSetup({ id:setup.id, digest:setup.digest, operation }), () => { setSetup(null); setBalance(null); });
          }}>{setup.approved ? "Approved" : "Approve reviewed balance"}</Button>
        </>}
      </div>}
    </details>
  </section>;
}
