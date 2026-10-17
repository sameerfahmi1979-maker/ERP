"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { useAdministrationSaveSession } from "@/hooks/use-administration-save-session";
import { useWorkspaceDraftStoreContext } from "@/components/workspace/workspace-draft-provider";
import { useWorkspaceFormOwner } from "@/hooks/use-workspace-form-owner";
import { signatoryId, signatoryFields, signatoryRequest, signatoryReceipt, type OwnerCompanySignatoryRow, type SignatoryRequest } from "@/lib/administration/company-signatory-contract";
import { createCompanySignatory, updateCompanySignatory, softDeleteCompanySignatory, restoreCompanySignatory } from "@/server/actions/common-master-data/owner-company-signatories";

const draftFields = z.object({
  full_name: z.string().max(200), user_id: signatoryId.nullable(), designation: z.string().max(200), signature_scope: z.string().max(500),
  notes: z.string().max(2000), is_primary: z.boolean(), is_active: z.boolean(), effective_from: z.string(), effective_to: z.string(),
}).strict();
export type SignatoryDraftFields = z.infer<typeof draftFields>;
export const signatorySnapshot = z.object({
  principalId: signatoryId, companyId: signatoryId, ownerId: z.string().nullable(), sessionId: z.string().uuid(),
  openingId: signatoryId.nullable(), openingRevision: signatoryId.nullable(), action: z.enum(["save", "archive", "restore"]), fields: draftFields, edited: z.boolean(),
}).strict().refine(value => (value.openingId === null) === (value.openingRevision === null) && (value.openingId !== null || value.action === "save"));
export type SignatorySnapshot = z.infer<typeof signatorySnapshot>;
export const signatoryRecoveryError = "The saved signatory request could not be verified. Reload this page and review the saved register before continuing. Workspace-only entries are not retained after a browser reload.";
export function signatoryDraftKey(ownerId: string | null, principalId: number, companyId: number) {
  return ownerId ? `draft:tab:${ownerId}:company-signatory:${principalId}:${companyId}` : null;
}
export function newSignatorySnapshot(principalId: number, companyId: number, ownerId: string | null, row: OwnerCompanySignatoryRow | null, action: SignatorySnapshot["action"]): SignatorySnapshot {
  return { principalId, companyId, ownerId, sessionId: crypto.randomUUID(), openingId: row?.id ?? null, openingRevision: row?.workspace_revision ?? null, action, edited: false,
    fields: { full_name: row?.full_name ?? "", user_id: row?.user_id ?? null, designation: row?.designation ?? "", signature_scope: row?.signature_scope ?? "", notes: row?.notes ?? "", is_primary: row?.is_primary ?? false, is_active: row?.is_active ?? true, effective_from: row?.effective_from ?? "", effective_to: row?.effective_to ?? "" } };
}

/** One child task reuses the F04 operation session and its memory-only tab store.
 * No local/session storage, parent dirty toggle, shared cache or new session engine. */
export function useCompanySignatoryEditor(snapshot: SignatorySnapshot, canEdit: boolean, onConfirmed: () => void) {
  const owner = useWorkspaceFormOwner();
  const store = useWorkspaceDraftStoreContext();
  const draftKey = signatoryDraftKey(owner?.id ?? null, snapshot.principalId, snapshot.companyId);
  const formId = `company-signatory:${snapshot.principalId}:${snapshot.companyId}:${snapshot.sessionId}`;
  const session = useAdministrationSaveSession<SignatoryRequest>(formId, snapshot.openingId, snapshot.openingRevision ?? undefined, (value, id) => {
    const parsed = signatoryRequest.safeParse(value);
    return parsed.success && parsed.data.company_id === snapshot.companyId && parsed.data.action === snapshot.action && (id !== null || parsed.data.action === "save");
  });
  const [fields, setFields] = useState(snapshot.fields);
  const [dirty, setDirty] = useState(snapshot.edited);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(session.recoveryError);
  const [blocked, setBlocked] = useState(!!session.recoveryError);
  const [confirmedLocally, setConfirmedLocally] = useState(false);
  const flight = useRef(false);
  const authority = useRef(canEdit);
  useLayoutEffect(() => { authority.current = canEdit; }, [canEdit]);
  const persist = (value: SignatoryDraftFields) => { if (draftKey) store?.setDraft(draftKey, { signatory: JSON.stringify({ ...snapshot, fields: value, edited: true }) }); };
  const update = <K extends keyof SignatoryDraftFields>(key: K, value: SignatoryDraftFields[K]) => {
    if (!authority.current || saving || session.uncertain || blocked || confirmedLocally || !session.isCurrent()) return;
    const next = { ...fields, [key]: value };
    try { persist(next); setFields(next); setDirty(true); }
    catch { setBlocked(true); setError(signatoryRecoveryError); }
  };
  const save = async () => {
    if (!authority.current || blocked || confirmedLocally || flight.current || !session.isCurrent()) return;
    let request: ReturnType<typeof session.prepare>;
    try {
      const pending = session.getPending();
      let payload: SignatoryRequest;
      if (pending) payload = pending.payload;
      else if (snapshot.action === "save") {
        const parsed = signatoryFields.safeParse({ ...fields, effective_from: fields.effective_from || null, effective_to: fields.effective_to || null });
        if (!parsed.success) { setError("Enter a full name and valid calendar dates. The end date cannot precede the start date."); return; }
        payload = { action: "save", company_id: snapshot.companyId, fields: parsed.data };
      } else payload = { action: snapshot.action, company_id: snapshot.companyId };
      persist(fields);
      request = session.prepare(payload);
    } catch { if (session.isCurrent()) { setBlocked(true); setError(signatoryRecoveryError); } return; }
    const wasUncertain = session.uncertain;
    let confirmed = false;
    flight.current = true; setSaving(true); setError(null);
    try {
      const payload = request.payload;
      const result = payload.action === "save"
        ? request.id === null ? await createCompanySignatory({ ...payload.fields, company_id: payload.company_id }, request.contract)
          : await updateCompanySignatory({ ...payload.fields, company_id: payload.company_id, id: request.id }, request.contract)
        : payload.action === "archive" ? await softDeleteCompanySignatory(request.id!, payload.company_id, request.contract)
          : await restoreCompanySignatory(request.id!, payload.company_id, request.contract);
      if (!session.isCurrent()) return;
      if (!authority.current) { session.setUncertain(true); setError("Access changed while the request was running. Its original identity is retained for recovery when access is restored."); return; }
      if (!result.success) {
        if (result.uncertain || wasUncertain) { session.setUncertain(true); setError("The earlier signatory change is still unconfirmed. Retry its original unchanged request when access is available."); }
        else { session.rejected(); setError("The signatory change was rejected. Your entries are retained. Cancel and reopen the latest record to resolve a revision conflict."); }
        return;
      }
      const receipt = signatoryReceipt.parse(result.data);
      if (request.id !== null && request.id !== receipt.id) throw new Error("Mismatched receipt");
      confirmed = true;
      session.accept(receipt);
      if (draftKey) store?.clearDraft(draftKey);
      setDirty(false); setConfirmedLocally(true);
      toast.success(receipt.changed ? "Signatory change saved" : "No changes to save");
      onConfirmed();
    } catch {
      if (!session.isCurrent()) return;
      if (confirmed) { session.setUncertain(false); setDirty(false); setConfirmedLocally(true); setError("The signatory change was saved, but the view could not finish updating. Close this dialog and reload the register before continuing."); }
      else { session.setUncertain(true); setError("The signatory change could not be confirmed. Retry the same unchanged request before editing or closing."); }
    } finally { flight.current = false; if (session.isCurrent()) setSaving(false); }
  };
  const discard = () => {
    if (saving || session.uncertain || blocked || !session.isCurrent()) return false;
    try { if (draftKey) store?.clearDraft(draftKey); return true; }
    catch { setBlocked(true); setError(signatoryRecoveryError); return false; }
  };
  return { fields, update, save, discard, error, saving, dirty, blocked, confirmedLocally, uncertain: session.uncertain,
    locked: !canEdit || saving || session.uncertain || blocked || confirmedLocally || snapshot.action !== "save" };
}
