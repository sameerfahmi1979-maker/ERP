"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  changeExpiryReminderPolicyState, readExpiryReminderPolicy, readExpiryReminderScopes, saveExpiryReminderPolicy,
  type ExpiryReminderPolicy, type ExpiryReminderRecipientChoice, type ExpiryReminderScopeChoice,
} from "@/server/actions/notifications/expiry-reminders";

const inputStyle = "rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring";
const scopeKey = (scope: ExpiryReminderScopeChoice) => [scope.companyId, scope.branchId ?? ""].join(":");

export function ExpiryReminderPolicyPanel() {
  const [scopes, setScopes] = useState<ExpiryReminderScopeChoice[]>();
  const [domain, setDomain] = useState<"hr" | "fleet">("hr");
  const [selected, setSelected] = useState("");
  const [policy, setPolicy] = useState<ExpiryReminderPolicy>();
  const [recipients, setRecipients] = useState<ExpiryReminderRecipientChoice[]>([]);
  const [recipientIds, setRecipientIds] = useState<number[]>([]);
  const [expiryDay, setExpiryDay] = useState(false);
  const [escalation, setEscalation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const flight = useRef(false);

  async function run(operation: () => Promise<void>) {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    setError("");
    try {
      await operation();
    } catch {
      setError("The reminder settings could not be confirmed. Refresh the policy.");
    } finally {
      flight.current = false;
      setBusy(false);
    }
  }

  function applyPolicy(current: ExpiryReminderPolicy) {
    setPolicy(current);
    setRecipientIds(current.recipientIds);
    setExpiryDay(current.expiryDay);
    setEscalation(current.escalationDays?.toString() ?? "");
  }

  function loadScope(key: string, nextDomain: "hr" | "fleet") {
    const chosen = scopes?.find(scope => scopeKey(scope) === key);
    const valid = chosen && (nextDomain === "hr" || chosen.branchId !== null);
    setSelected(valid ? key : "");
    setDomain(nextDomain);
    setPolicy(undefined);
    setRecipients([]);
    setError("");
    if (valid) void run(async () => {
      const result = await readExpiryReminderPolicy({ companyId: chosen.companyId, branchId: chosen.branchId, domain: nextDomain });
      if (!result.success) return setError(result.error);
      applyPolicy(result.data.policy);
      setRecipients(result.data.recipients);
    });
  }

  const selectable = scopes?.filter(scope => domain === "hr" || scope.branchId !== null);
  const staleRecipients = recipientIds.filter(id => !recipients.some(recipient => recipient.id === id));
  const escalationDays = escalation === "" ? null : Number(escalation);
  const validEscalation = escalationDays === null || (Number.isInteger(escalationDays) && escalationDays >= 1 && escalationDays <= 365);
  const draftChanged = policy &&
    (recipientIds.length !== policy.recipientIds.length || recipientIds.some(id => !policy.recipientIds.includes(id)) ||
      expiryDay !== policy.expiryDay || escalationDays !== policy.escalationDays);

  return <section aria-labelledby="expiry-reminders-heading" className="space-y-3 border-t pt-4">
    <h2 id="expiry-reminders-heading" className="font-semibold">Expiry reminders</h2>
    {!scopes ? <Button variant="outline" disabled={busy} onClick={() => run(async () => {
      const result = await readExpiryReminderScopes();
      if (!result.success) return setError(result.error);
      setScopes(result.data);
    })}>Manage expiry reminders</Button> : <fieldset disabled={busy} className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <label className="grid gap-1 text-sm font-medium">Record type
          <select className={inputStyle} value={domain} onChange={event => loadScope(selected, event.target.value === "fleet" ? "fleet" : "hr")}>
            <option value="hr">Employee compliance</option>
            <option value="fleet">Fleet registration and insurance</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium">Company and branch
          <select className={inputStyle} value={selected} onChange={event => loadScope(event.target.value, domain)}>
            <option value="">Choose a scope</option>
            {selectable?.map(choice => <option key={scopeKey(choice)} value={scopeKey(choice)}>{choice.label}</option>)}
          </select>
        </label>
        {selected && <Button variant="outline" onClick={() => loadScope(selected, domain)}>Refresh policy</Button>}
      </div>
      {selectable?.length === 0 && <p className="text-sm text-muted-foreground">No active scopes are available.</p>}
      {policy && <div className="space-y-4 rounded-md border bg-card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm">In-app notifications at {policy.preExpiryDays.join(", ")} days before expiry</p>
          <p role="status" className="text-sm font-semibold">{policy.active ? "Active" : "Inactive"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={expiryDay}
            onChange={event => setExpiryDay(event.target.checked)} />Notify on expiry day</label>
          <label className="flex items-center gap-2">Escalate days after expiry
            <input className={inputStyle + " w-24"} type="number" min={1} max={365} step={1} value={escalation}
              onChange={event => setEscalation(event.target.value)} placeholder="Off" />
          </label>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Recipients</legend>
          {recipients.length === 0 && <p className="text-sm text-muted-foreground">No authorised recipients are available in this scope.</p>}
          <ul className="max-h-56 space-y-2 overflow-y-auto text-sm">
            {[...recipients, ...staleRecipients.map(id => ({ id, label: "Recipient #" + id + " needs review" }))].map(recipient =>
              <li key={recipient.id}><label className="flex items-center gap-2">
                <input type="checkbox" checked={recipientIds.includes(recipient.id)}
                  onChange={event => setRecipientIds(ids => event.target.checked ? [...ids, recipient.id] : ids.filter(id => id !== recipient.id))}/>
                {recipient.label}
              </label></li>)}
          </ul>
        </fieldset>
        <div className="flex flex-wrap gap-2">
          <Button disabled={!draftChanged || !validEscalation || recipientIds.length < 1 || recipientIds.length > 50 || staleRecipients.length > 0}
            onClick={() => run(async () => {
              const { companyId, branchId, domain, revision } = policy;
              const result = await saveExpiryReminderPolicy({ companyId, branchId, domain, revision, recipientIds, expiryDay, escalationDays });
              if (!result.success) return setError(result.error);
              applyPolicy(result.data);
            })}>Save reminder policy</Button>
          {policy.revision > 0 && <Button variant="outline" disabled={!policy.active && !!draftChanged} onClick={() => run(async () => {
            const { companyId, branchId, domain, revision } = policy;
            const result = await changeExpiryReminderPolicyState({ companyId, branchId, domain, revision, active: !policy.active });
            if (!result.success) return setError(result.error);
            setPolicy(result.data);
          })}>{policy.active ? "Pause policy" : "Activate policy"}</Button>}
        </div>
      </div>}
    </fieldset>}
    {busy && <p role="status" className="text-sm">Checking reminder settings…</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}
