"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { OwnerCompanySelect } from "@/components/erp/organizations/owner-company-select";
import { BranchSelect } from "@/components/erp/organizations/branch-select";
import { useReadLifetime } from "@/hooks/use-read-lifetime";
import type { AuthContext } from "@/lib/rbac/check";
import { canUseApplication, hasPermissionInScope } from "@/lib/rbac/scope";
import { hrReadIdentity } from "@/lib/reads/hr-read-identity";
import { decideEmploymentChange, proposeEmploymentChange, readEmploymentChange } from "@/server/actions/hr/employment-lifecycle";

const manage = "hr.employment.lifecycle.manage";
const accept = "hr.employment.lifecycle.accept";
type EmploymentChange = NonNullable<Awaited<ReturnType<typeof readEmploymentChange>>>;
type ProposalKind = "confirm" | "transfer" | "end" | "rehire";
type Decision = "source" | "destination" | "apply";
type Outcome = Awaited<ReturnType<typeof decideEmploymentChange>>;

function useEmploymentOperation<T>(execute: (input: T) => Promise<Outcome>, identity: string) {
  const lifetime = useReadLifetime(identity);
  const [pending, setPending] = useState<T | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const run = async (input: T, onSaved: (receipt: NonNullable<Outcome["data"]>) => void) => {
    if (!lifetime.active || busy) return;
    const original = pending ?? input;
    setBusy(true);
    setPending(original);
    setMessage("");
    try {
      const outcome = await execute(original);
      if (!lifetime.active) return;
      if (!outcome.uncertain) setPending(null);
      if (outcome.data) onSaved(outcome.data);
      else setMessage(outcome.error);
    } catch {
      if (lifetime.active) setMessage("The outcome is unconfirmed. Retry the same request.");
    } finally {
      if (lifetime.active) setBusy(false);
    }
  };
  return { pending, busy, message, run, enabled: lifetime.enabled };
}

export function EmployeeEmploymentChangeRequest(props: {
  employee: number; revision: number; company: number; branch: number | null; authContext: AuthContext;
}) {
  const { authContext, company, branch } = props;
  if (!authContext.permissionCodes.includes(manage) || !hasPermissionInScope(authContext, manage, company, branch)) return null;
  return <ProposalForm key={`${hrReadIdentity(authContext)}:${props.employee}:${props.revision}`} {...props} />;
}

function ProposalForm({ employee, revision, company: currentEmployer, authContext }: {
  employee: number; revision: number; company: number; authContext: AuthContext;
}) {
  const [kind, setKind] = useState<ProposalKind>("transfer");
  const [date, setDate] = useState("");
  const [contract, setContract] = useState("");
  const [company, setCompany] = useState<number | null>(null);
  const [branch, setBranch] = useState<number | null>(null);
  const [exitCase, setExitCase] = useState("");
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState<number | null>(null);
  const operation = useEmploymentOperation(proposeEmploymentChange, `employment-prepare:${hrReadIdentity(authContext)}:${employee}`);
  const moves = kind === "transfer" || kind === "rehire";
  const needsContract = kind === "rehire" || (kind === "transfer" && company !== null && company !== currentEmployer);
  const needsExit = kind === "end" || kind === "rehire";
  const locked = operation.busy || !!operation.pending;
  if (!operation.enabled) return null;
  async function submit() {
    await operation.run({
      employee, revision, kind, effectiveDate: date, company: moves ? company : null, branch: moves ? branch : null,
      contractualStart: needsContract ? contract : null, exitCase: needsExit ? Number(exitCase) : null,
      reason, operation: crypto.randomUUID(),
    }, result => { setReference(result.id); setReason(""); });
  }
  return <details className="space-y-2 rounded-md border p-3">
    <summary className="cursor-pointer font-medium">Prepare an employment change</summary>
    <div className="grid max-w-xl gap-2" onKeyDown={event=>{if(event.key==='Enter'&&event.target instanceof HTMLInputElement)event.preventDefault();}}>
      <Label htmlFor="employment-change-kind">Change type</Label>
      <select id="employment-change-kind" className="rounded-md border bg-background p-2" value={kind} disabled={locked}
        onChange={event => { setKind(event.target.value as ProposalKind); setReference(null); }}>
        <option value="transfer">Transfer to another company or branch</option>
        <option value="rehire">Rehire the same employee</option>
        <option value="confirm">Confirm an existing employment period</option>
        <option value="end">Record a verified employment end</option>
      </select>
      <Label htmlFor="employment-change-date">{kind === "end" ? "First day after employment ends" : "Effective date"}</Label>
      <Input id="employment-change-date" type="date" value={date} disabled={locked} onChange={event => setDate(event.target.value)} />
      {moves && <>
        <Label>Receiving employer</Label>
        <OwnerCompanySelect value={company} disabled={locked} ariaLabel="Receiving employer"
          onValueChange={value => { setCompany(value); setBranch(null); setContract(""); }} />
        <Label>Receiving branch</Label>
        <BranchSelect value={branch} ownerCompanyId={company} disabled={locked || company === null} allowClear onValueChange={setBranch} />
      </>}
      {needsContract && <>
        <Label htmlFor="employment-change-contract">Contractual start</Label>
        <Input id="employment-change-contract" type="date" value={contract} disabled={locked} onChange={event => setContract(event.target.value)} />
      </>}
      {needsExit && <>
        <Label htmlFor="employment-exit-case">Closed exit case number</Label>
        <Input id="employment-exit-case" type="number" min={1} step={1} value={exitCase} disabled={locked} onChange={event => setExitCase(event.target.value)} />
      </>}
      <Label htmlFor="employment-change-reason">Change reason</Label>
      <Textarea id="employment-change-reason" maxLength={1500} value={reason} disabled={locked} onChange={event => setReason(event.target.value)} />
      <Button type="button" size="sm" className="w-fit" onClick={() => void submit()}
        disabled={operation.busy || (!operation.pending && (!date || !reason.trim() || (moves && company === null) || (needsContract && !contract) || (needsExit && !exitCase)))}>
        {operation.pending ? "Retry original request" : "Prepare for review"}
      </Button>
      {operation.message && <p role="status">{operation.message}</p>}
      {reference && <p role="status">Employment change #{reference} is ready for review in the Employees directory.</p>}
    </div>
  </details>;
}

export function EmploymentChangeReview({ authContext }: { authContext: AuthContext }) {
  if (!canUseApplication(authContext) || ![manage, accept].some(code => authContext.permissionCodes.includes(code))) return null;
  return <ReviewForm key={hrReadIdentity(authContext)} authContext={authContext} />;
}

function ReviewForm({ authContext }: { authContext: AuthContext }) {
  const router = useRouter();
  const identity = `employment-review:${hrReadIdentity(authContext)}`;
  const lifetime = useReadLifetime(identity);
  const operation = useEmploymentOperation(decideEmploymentChange, identity);
  const [reference, setReference] = useState("");
  const [reviewed, setReviewed] = useState<EmploymentChange | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const locked = operation.busy || !!operation.pending || loading;

  const load = async (id: number) => {
    setLoading(true);
    setMessage("");
    setReviewed(null);
    try {
      const change = await readEmploymentChange(id);
      if (lifetime.active) {
        setReviewed(change);
        if (!change) setMessage("This change reference is unavailable with your current access.");
      }
    } catch {
      if (lifetime.active) setMessage("The employment change could not be loaded. Try again.");
    } finally {
      if (lifetime.active) setLoading(false);
    }
  };
  if (!operation.enabled) return null;
  const twoScopes = reviewed && (reviewed.source_company !== reviewed.destination_company || reviewed.source_branch !== reviewed.destination_branch);
  const source = reviewed && hasPermissionInScope(authContext, accept, reviewed.source_company, reviewed.source_branch);
  const destination = reviewed && hasPermissionInScope(authContext, accept, reviewed.destination_company, reviewed.destination_branch);
  const apply = reviewed && hasPermissionInScope(authContext, manage, reviewed.source_company, reviewed.source_branch)
    && hasPermissionInScope(authContext, manage, reviewed.destination_company, reviewed.destination_branch);
  const decide = async (step: Decision) => {
    if (!reviewed || !reason.trim()) return;
    await operation.run({ change: reviewed.id, digest: reviewed.digest, step, reason, operation: crypto.randomUUID() }, result => {
      setReason("");
      if (result.status === "applied") router.refresh();
      void load(reviewed.id);
    });
  };

  return <details className="space-y-2 rounded-md border p-3">
    <summary className="cursor-pointer font-medium">Review an employment change</summary>
    <form className="flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); if (!locked) void load(Number(reference)); }}>
      <div><Label htmlFor="employment-review-reference">Change reference</Label>
        <Input id="employment-review-reference" type="number" min={1} step={1} required value={reference} disabled={locked}
          onChange={event => { setReference(event.target.value); setReviewed(null); setMessage(""); }} /></div>
      <Button type="submit" size="sm" variant="outline" disabled={locked}>Load change</Button>
    </form>
    {reviewed && <div className="max-w-xl space-y-2">
      <p>Employee #{reviewed.employee_id} · {reviewed.kind} · {reviewed.effective_on}</p>
      <p>Source company #{reviewed.source_company}, branch {reviewed.source_branch ?? "company scope"} · {reviewed.source_accepted ? "Accepted" : "Awaiting acceptance"}</p>
      {twoScopes && <p>Receiving company #{reviewed.destination_company}, branch {reviewed.destination_branch ?? "company scope"} · {reviewed.destination_accepted ? "Accepted" : "Awaiting acceptance"}</p>}
      {reviewed.contractual_start && <p>Contractual start {reviewed.contractual_start}</p>}
      <p>{reviewed.reason}</p>
      {reviewed.applied ? <p>Applied</p> : (source || destination || apply) && <>
        <Label htmlFor="employment-review-reason">Decision reason</Label>
        <Textarea id="employment-review-reason" maxLength={1500} value={reason} disabled={locked} onChange={event => setReason(event.target.value)} />
        <div className="flex flex-wrap gap-2">
          {operation.pending ? <Button size="sm" disabled={operation.busy} onClick={() => void decide("apply")}>Retry original decision</Button> : <>
            {source && !reviewed.source_accepted && <Button size="sm" variant="outline" disabled={locked || !reason.trim()} onClick={() => void decide("source")}>Accept for source</Button>}
            {twoScopes && destination && !reviewed.destination_accepted && <Button size="sm" variant="outline" disabled={locked || !reason.trim()} onClick={() => void decide("destination")}>Accept for receiving scope</Button>}
            {apply && <Button size="sm" disabled={locked || !reason.trim() || !reviewed.source_accepted || (!!twoScopes && !reviewed.destination_accepted)} onClick={() => void decide("apply")}>Apply accepted change</Button>}
          </>}
        </div>
      </>}
    </div>}
    {(message || operation.message) && <p role="status">{message || operation.message}</p>}
  </details>;
}
