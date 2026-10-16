"use client";

import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { useWorkspaceDraftStoreContext } from "@/components/workspace/workspace-draft-provider";
import { useWorkspaceFormOwner } from "@/hooks/use-workspace-form-owner";
import { useAdministrationSaveSession } from "@/hooks/use-administration-save-session";
import { partySaveReceipt } from "@/lib/master-data/party-save-contract";
import { upsertPartyFinanceProfile } from "@/server/actions/master-data/party-finance-profiles";

const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const nullableId = id.nullable();
export const financeFieldsSchema = z.object({
  default_currency_id: nullableId,
  default_payment_term_id: nullableId,
  default_payment_method_id: nullableId,
  credit_limit: z.string(),
  credit_currency_id: nullableId,
  finance_hold: z.boolean(),
  finance_hold_reason: z.string().max(2000),
  finance_remarks: z.string().max(4000),
}).strict();
export type FinanceFields = z.infer<typeof financeFieldsSchema>;
const financeEditorReadSchema = financeFieldsSchema.omit({ credit_limit: true, finance_hold_reason: true, finance_remarks: true }).extend({
  id, party_id: id, workspace_revision: id,
  credit_limit: z.number().finite().nonnegative().nullable(),
  finance_hold_reason: z.string().nullable(), finance_remarks: z.string().nullable(),
});
// The server returns audit metadata as well as editable values. Validate the
// complete response before projecting it into the editor; metadata must never
// become writable fields or be fabricated for receipt-based optimistic updates.
const financeTimestamp = z.iso.datetime({ offset: true });
export const financeReadSchema = financeEditorReadSchema.extend({
  finance_hold_by: nullableId,
  finance_hold_at: financeTimestamp.nullable(),
  created_at: financeTimestamp,
  updated_at: financeTimestamp,
}).strict().transform(row => ({
  id: row.id,
  party_id: row.party_id,
  workspace_revision: row.workspace_revision,
  default_currency_id: row.default_currency_id,
  default_payment_term_id: row.default_payment_term_id,
  default_payment_method_id: row.default_payment_method_id,
  credit_limit: row.credit_limit,
  credit_currency_id: row.credit_currency_id,
  finance_hold: row.finance_hold,
  finance_hold_reason: row.finance_hold_reason,
  finance_remarks: row.finance_remarks,
}));
export type FinanceRead = z.infer<typeof financeReadSchema>;
const payloadSchema = financeFieldsSchema.omit({ credit_limit: true, finance_hold_reason: true, finance_remarks: true }).extend({
  party_id: id,
  credit_limit: z.number().nonnegative().lt(100000000000000).refine(value => /^\d+(?:\.\d{1,4})?$/.test(String(value))).nullable(),
  finance_hold_reason: z.string().max(2000).nullable(), finance_remarks: z.string().max(4000).nullable(),
}).strict();
type FinancePayload = z.infer<typeof payloadSchema>;
const snapshotSchema = z.object({
  principalId: id, partyId: id, ownerId: z.string().nullable(), sessionId: z.string().uuid(),
  openingId: nullableId, openingRevision: id.nullable(), fields: financeFieldsSchema,
}).strict().refine(value => (value.openingId === null) === (value.openingRevision === null));
type Snapshot = z.infer<typeof snapshotSchema>;
const recoveryError = "The saved finance draft could not be verified. Close and reopen this record, then check the saved profile before making changes.";

export function financeFields(profile: FinanceRead | null): FinanceFields {
  return {
    default_currency_id: profile?.default_currency_id ?? null,
    default_payment_term_id: profile?.default_payment_term_id ?? null,
    default_payment_method_id: profile?.default_payment_method_id ?? null,
    credit_limit: profile?.credit_limit == null ? "" : String(profile.credit_limit),
    credit_currency_id: profile?.credit_currency_id ?? null,
    finance_hold: profile?.finance_hold ?? false,
    finance_hold_reason: profile?.finance_hold_reason ?? "",
    finance_remarks: profile?.finance_remarks ?? "",
  };
}

/** A typed, tab/account-owned adapter over the existing F04/F06 memory-only
 * draft and operation sessions. The opening identity survives an uncertain
 * create even when a fresh authorized read now sees its committed row. */
export function usePartyFinanceEditor({ partyId, principalId, profile, canEdit, onBusyChange, onReload }: {
  partyId: number; principalId: number; profile: FinanceRead | null; canEdit: boolean;
  onBusyChange?: (busy: boolean) => void; onReload: () => void;
}) {
  const owner = useWorkspaceFormOwner();
  const store = useWorkspaceDraftStoreContext();
  const draftKey = owner ? `draft:tab:${owner.id}:party-finance:${principalId}:${partyId}` : null;
  const [restored] = useState(() => {
    const fallback: Snapshot = { principalId, partyId, ownerId: owner?.id ?? null, sessionId: crypto.randomUUID(), openingId: profile?.id ?? null, openingRevision: profile?.workspace_revision ?? null, fields: financeFields(profile) };
    if (!canEdit) return { snapshot: fallback, error: null, dirty: false };
    const raw = draftKey ? store?.getDraft(draftKey) : undefined;
    if (!raw) return { snapshot: fallback, error: null, dirty: false };
    try {
      if (Object.keys(raw).length !== 1 || typeof raw.finance !== "string") throw new Error();
      const snapshot = snapshotSchema.parse(JSON.parse(raw.finance));
      if (snapshot.principalId !== principalId || snapshot.partyId !== partyId || snapshot.ownerId !== (owner?.id ?? null) || (snapshot.openingId !== null && snapshot.openingId !== profile?.id)) throw new Error();
      return { snapshot, error: null, dirty: true };
    } catch { return { snapshot: fallback, error: recoveryError, dirty: true }; }
  });
  const formId = `party-finance:${principalId}:${partyId}:${restored.snapshot.sessionId}`;
  const session = useAdministrationSaveSession<FinancePayload>(formId, restored.snapshot.openingId, restored.snapshot.openingRevision ?? undefined,
    payload => { const result = payloadSchema.safeParse(payload); return result.success && result.data.party_id === partyId; });
  const [fields, setFields] = useState(restored.snapshot.fields);
  const [dirty, setDirty] = useState(restored.dirty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(restored.error ?? session.recoveryError);
  const [preparationBlocked, setPreparationBlocked] = useState(false);
  const [needsReload, setNeedsReload] = useState(false);
  const flight = useRef(false);
  const blocked = !!restored.error || !!session.recoveryError || preparationBlocked;
  const busy = dirty || saving || session.uncertain || blocked || needsReload;
  useEffect(() => { onBusyChange?.(busy); return () => onBusyChange?.(false); }, [busy, onBusyChange]);
  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);
  const persist = (value: FinanceFields) => {
    if (draftKey) store?.setDraft(draftKey, { finance: JSON.stringify({ ...restored.snapshot, fields: value }) });
  };
  const update = <K extends keyof FinanceFields>(key: K, value: FinanceFields[K]) => {
    if (!canEdit || blocked || needsReload || saving || session.uncertain || !session.isCurrent()) return;
    const next = { ...fields, [key]: value };
    persist(next); setFields(next); setDirty(true);
  };
  const save = async () => {
    if (!canEdit || blocked || needsReload || flight.current || !session.isCurrent()) return;
    let request: ReturnType<typeof session.prepare>;
    try {
      const prior = session.getPending();
      let payload: FinancePayload;
      if (prior) payload = prior.payload;
      else {
        const rawCredit = fields.credit_limit.trim();
        if ((rawCredit && !/^\d+(?:\.\d{1,4})?$/.test(rawCredit)) || (fields.finance_hold && !fields.finance_hold_reason.trim())) {
          setError("Enter a nonnegative credit limit with at most four decimal places and a reason for any finance hold."); return;
        }
        const parsed = payloadSchema.safeParse({ ...fields, party_id: partyId, credit_limit: rawCredit ? Number(rawCredit) : null, finance_hold_reason: fields.finance_hold_reason.trim() || null, finance_remarks: fields.finance_remarks.trim() || null });
        if (!parsed.success) { setError("Check the finance fields before saving. Your entries are still here."); return; }
        payload = parsed.data;
      }
      persist(fields);
      request = session.prepare(payload);
    } catch {
      // An orphaned or inconsistent restored operation may throw before any
      // transport call. Do not reject/reset its retained request or leak it.
      if (session.isCurrent()) { setPreparationBlocked(true); setError(recoveryError); }
      return;
    }
    const wasUncertain = session.uncertain;
    let confirmed = false;
    flight.current = true; setSaving(true); setError(null);
    try {
      const result = await upsertPartyFinanceProfile(request.payload, request.contract);
      if (!session.isCurrent()) return;
      if (!result.success) {
        if (result.uncertain || wasUncertain) {
          session.setUncertain(true);
          setError("The earlier finance save is still unconfirmed. Your original request is retained; retry it unchanged when access is available.");
        } else {
          session.rejected();
          setError("The finance profile was not saved. Your entries are still here. Reload the saved profile before retrying a revision conflict.");
        }
        return;
      }
      const receipt = partySaveReceipt.parse(result.data);
      if (request.id !== null && receipt.id !== request.id) throw new Error("Mismatched finance receipt.");
      // A matching server receipt proves the transaction outcome independently
      // of subsequent local session persistence, cleanup or notification work.
      confirmed = true;
      session.accept(receipt);
      // Receipt confirmation, not a later read, releases the exact pending payload.
      setFields(financeFields({ ...request.payload, id: receipt.id, workspace_revision: Number(receipt.revision) }));
      if (draftKey) store?.clearDraft(draftKey);
      setDirty(false);
      toast.success(receipt.changed ? "Finance profile saved" : "No changes to save");
    } catch {
      if (session.isCurrent()) {
        if (confirmed) {
          session.setUncertain(false);
          setDirty(false);
          setNeedsReload(true);
          setError("Finance profile saved, but the local view could not finish updating. Reload the saved profile before continuing.");
        } else {
          session.setUncertain(true);
          setError("The finance save could not be confirmed. Retry the unchanged request before making further edits.");
        }
      }
    } finally {
      flight.current = false;
      if (session.isCurrent()) setSaving(false);
    }
  };
  const reload = () => {
    if (saving || session.uncertain || blocked || !session.isCurrent()) return;
    if (dirty && !window.confirm("Discard unsaved finance entries and load the saved profile?")) return;
    try {
      if (draftKey) store?.clearDraft(draftKey);
      onReload();
    } catch {
      setError(needsReload ? "Finance profile saved, but local recovery could not finish. Reload this browser page and review the saved profile before continuing." : "The finance draft could not be cleared. Your entries have not been submitted.");
    }
  };
  return { fields, update, save, reload, saving, error, dirty, uncertain: session.uncertain, blocked, needsReload, restored: restored.dirty, locked: !canEdit || blocked || needsReload || saving || session.uncertain };
}
