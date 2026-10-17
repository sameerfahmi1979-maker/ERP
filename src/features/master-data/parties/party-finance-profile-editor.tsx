"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AuthContext } from "@/lib/rbac/check";
import { hasGlobalPermission } from "@/lib/rbac/scope";
import { useWorkspaceDraftStoreContext } from "@/components/workspace/workspace-draft-provider";
import { useWorkspaceFormOwner } from "@/hooks/use-workspace-form-owner";
import { FormErrorSummary, useInlineFieldFeedback } from "@/components/workspace/form-feedback";
import { collectWorkspaceFieldIssues, type WorkspaceFieldIssue } from "@/lib/workspace/form-validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { ERPCombobox } from "@/components/erp/combobox";
import { CurrencySelect, PaymentTermSelect } from "@/components/erp/finance-basics";
import { getPaymentMethods } from "@/server/actions/master-data/parties";
import { getPartyFinanceProfile } from "@/server/actions/master-data/party-finance-profiles";
import { financeReadSchema, usePartyFinanceEditor, type FinanceRead } from "./use-party-finance-editor";

type Props = { partyId: number; authContext?: AuthContext; disabled?: boolean; onBusyChange?: (busy: boolean) => void };

export function PartyFinanceProfileEditor({ partyId, authContext, disabled, onBusyChange }: Props) {
  const owner = useWorkspaceFormOwner();
  const canRead = !!authContext && hasGlobalPermission(authContext, "master_data.parties.view");
  const canEdit = canRead && !disabled && hasGlobalPermission(authContext!, "master_data.parties.edit");
  const principalId = authContext?.profile?.id;
  return <div>
    <h3 className="text-sm font-semibold mb-3">Finance Profile</h3>
    {!canRead || !principalId || !Number.isSafeInteger(partyId) || partyId <= 0
      ? <p role="alert">You do not have access to this finance profile.</p>
      : <AuthorizedFinanceProfile key={`${principalId}:${partyId}:${owner?.id ?? "standalone"}:${canEdit}`} partyId={partyId} principalId={principalId} canEdit={canEdit} onBusyChange={onBusyChange} />}
  </div>;
}

function AuthorizedFinanceProfile({ partyId, principalId, canEdit, onBusyChange }: {
  partyId: number; principalId: number; canEdit: boolean; onBusyChange?: (busy: boolean) => void;
}) {
  const store = useWorkspaceDraftStoreContext();
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<{ store: typeof store; version: number; profile?: FinanceRead | null; error?: string } | null>(null);
  useEffect(() => {
    let current = true;
    const failed = () => { if (current) setResult({ store, version, error: "Finance details could not be loaded. Try again before making changes." }); };
    void (async () => {
      try {
        const response = await getPartyFinanceProfile(partyId);
        if (!response.success || response.data === undefined) { failed(); return; }
        const profile = response.data === null ? null : financeReadSchema.parse(response.data);
        if (profile && profile.party_id !== partyId) { failed(); return; }
        if (current) setResult({ store, version, profile });
      } catch { failed(); }
    })();
    return () => { current = false; };
  }, [partyId, store, version]);
  if (!result || result.store !== store || result.version !== version) return <Skeleton aria-label="Loading finance profile" className="h-40 w-full" />;
  if (result.error || result.profile === undefined) return <div role="alert"><p>{result.error}</p><Button type="button" onClick={() => setVersion(value => value + 1)}>Try loading finance again</Button></div>;
  return <LoadedFinanceProfile key={version} partyId={partyId} principalId={principalId} profile={result.profile} canEdit={canEdit} onBusyChange={onBusyChange} onReload={() => setVersion(value => value + 1)} />;
}

function LoadedFinanceProfile(props: { partyId: number; principalId: number; profile: FinanceRead | null; canEdit: boolean; onBusyChange?: (busy: boolean) => void; onReload: () => void }) {
  const editor = usePartyFinanceEditor(props);
  const root = useRef<HTMLDivElement>(null);
  const [issues, setIssues] = useState<WorkspaceFieldIssue[]>([]);
  useInlineFieldFeedback(issues);
  const { data: paymentMethods, error: paymentError } = useQuery({
    queryKey: ["payment_methods", props.principalId],
    queryFn: async () => { const result = await getPaymentMethods(); if (!result.success || !result.data) throw new Error("Payment methods could not be loaded."); return result.data; },
    staleTime: 5 * 60 * 1000,
  });
  const paymentOptions = (paymentMethods ?? []).map(item => ({ value: item.id, label: item.name_en }));
  const paymentId = editor.fields.default_payment_method_id;
  if (paymentId !== null && !paymentOptions.some(item => item.value === paymentId)) paymentOptions.push({ value: paymentId, label: `Payment method #${paymentId} (saved selection)` });
  const save = () => {
    if (!editor.uncertain) {
      const next = root.current ? collectWorkspaceFieldIssues(root.current) : [];
      setIssues(next);
      if (next.length) { next[0].control?.focus(); return; }
    }
    void editor.save();
  };
  const fields = editor.fields;
  return <div ref={root} aria-busy={editor.saving} onChangeCapture={() => { if (issues.length && root.current) setIssues(collectWorkspaceFieldIssues(root.current)); }}>
    {editor.error && <p role="alert" className="text-sm text-destructive">{editor.error}</p>}
    {editor.uncertain && !editor.blocked && <p role="status" className="text-sm">The original finance request is retained. Retry it unchanged to confirm the outcome.</p>}
    {(editor.dirty || editor.uncertain) && <p className="text-sm text-muted-foreground">Finance entries are kept only in this workspace session. Reloading the browser, signing out, or closing this record loses them; confirm any pending save first.</p>}
    {editor.restored && !editor.blocked && <p className="text-sm">Finance draft restored for this record.</p>}
    <FormErrorSummary issues={issues} onReveal={issue => issue.control?.focus()} />
    <fieldset disabled={editor.locked} className="grid grid-cols-12 gap-4 min-w-0">
      <div className="col-span-6"><Label>Default Currency</Label><CurrencySelect ariaLabel="Default Currency" includeInactive allowClear value={fields.default_currency_id} onValueChange={value => editor.update("default_currency_id", value)} disabled={editor.locked} />{fields.default_currency_id !== null && <p className="text-xs text-muted-foreground">Selected currency ID: {fields.default_currency_id}</p>}</div>
      <div className="col-span-6"><Label>Default Payment Term</Label><PaymentTermSelect ariaLabel="Default Payment Term" includeInactive allowClear value={fields.default_payment_term_id} onValueChange={value => editor.update("default_payment_term_id", value)} disabled={editor.locked} />{fields.default_payment_term_id !== null && <p className="text-xs text-muted-foreground">Selected payment term ID: {fields.default_payment_term_id}</p>}</div>
      <div className="col-span-6"><Label>Default Payment Method</Label><ERPCombobox ariaLabel="Default Payment Method" value={paymentId} onValueChange={value => editor.update("default_payment_method_id", value === null ? null : Number(value))} options={paymentOptions} placeholder="Select payment method..." disabled={editor.locked || !!paymentError} allowClear />{paymentError && <p role="alert" className="text-sm text-destructive">Payment methods could not be loaded. The saved selection has been retained.</p>}</div>
      <div className="col-span-3"><Label>Credit Limit</Label><Input aria-label="Credit Limit" type="number" step="0.0001" min="0" value={fields.credit_limit} onChange={event => editor.update("credit_limit", event.target.value)} disabled={editor.locked} /></div>
      <div className="col-span-3"><Label>Credit Currency</Label><CurrencySelect ariaLabel="Credit Currency" includeInactive allowClear value={fields.credit_currency_id} onValueChange={value => editor.update("credit_currency_id", value)} disabled={editor.locked} />{fields.credit_currency_id !== null && <p className="text-xs text-muted-foreground">Selected credit currency ID: {fields.credit_currency_id}</p>}</div>
      <div className="col-span-6 flex items-end gap-3 pb-1"><Label>Finance Hold</Label><Switch aria-label="Finance Hold" checked={fields.finance_hold} onCheckedChange={value => editor.update("finance_hold", value)} disabled={editor.locked} /><span className="text-sm text-muted-foreground">{fields.finance_hold ? "Yes" : "No"}</span></div>
      {fields.finance_hold && <div className="col-span-6"><Label>Finance Hold Reason</Label><Input aria-label="Finance Hold Reason" value={fields.finance_hold_reason} onChange={event => editor.update("finance_hold_reason", event.target.value)} disabled={editor.locked} required maxLength={2000} /></div>}
      <div className="col-span-12"><Label>Finance Remarks</Label><Textarea aria-label="Finance Remarks" value={fields.finance_remarks} onChange={event => editor.update("finance_remarks", event.target.value)} rows={2} disabled={editor.locked} maxLength={4000} /></div>
    </fieldset>
    {props.canEdit && <div className="mt-4 flex justify-end gap-2">
      <Button type="button" variant="outline" size="sm" onClick={editor.reload} disabled={editor.saving || editor.uncertain || editor.blocked}>Reload saved finance profile</Button>
      <Button type="button" size="sm" onClick={save} disabled={editor.saving || editor.blocked || editor.needsReload}>{editor.saving ? "Saving..." : editor.uncertain ? "Retry Finance Save" : "Save Finance Profile"}</Button>
    </div>}
  </div>;
}
