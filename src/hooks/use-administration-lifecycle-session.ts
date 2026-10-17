"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { z } from "zod";
import { useWorkspaceDraftStoreContext } from "@/components/workspace/workspace-draft-provider";
import { useWorkspaceFormOwner } from "@/hooks/use-workspace-form-owner";
import { administrationLifecyclePayloadSchema, administrationSaveReceiptSchema } from "@/hooks/use-administration-save-session";

const revisionSchema = z.string().regex(/^[1-9]\d*$/);
const recordIdSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const payloadSchema = administrationLifecyclePayloadSchema.refine(payload => !payload.retire || payload.status === "inactive");
const contractSchema = z.object({ operationId: z.string().uuid(), revision: revisionSchema }).strict();
const pendingSchema = z.object({ id: recordIdSchema, payload: payloadSchema, contract: contractSchema }).strict();
const stateSchema = z.object({
  id: recordIdSchema,
  revision: revisionSchema.nullable(),
  pending: pendingSchema.nullable(),
  confirmed: z.object({ status: payloadSchema.shape.status, revision: revisionSchema }).strict().nullable(),
}).strict();
const legacyStateSchema = z.object({
  id: recordIdSchema,
  revision: revisionSchema.nullable(),
  pending: z.object({ fingerprint: z.string(), contract: contractSchema }).strict().optional(),
}).strict();
export type AdministrationLifecyclePayload = z.infer<typeof payloadSchema>;
type LifecycleState = z.infer<typeof stateSchema>;
const recoveryError = "The saved status request could not be verified. Reopen the latest record and check whether the change was saved before continuing.";
const rowRevision = (value: number | undefined) => value !== undefined && Number.isSafeInteger(value) && value > 0 ? String(value) : null;

/** List actions have no editable draft: an idle action may adopt a newer row.
 * A pending request never rebases; its exact operation, payload and revision stay
 * together in the account/tab-owned memory store until authoritatively resolved.
 * Ordinary record forms deliberately keep their separate opening-revision hook.
 */
export function useAdministrationLifecycleSession(formId: string, id: number, revision?: number) {
  const store = useWorkspaceDraftStoreContext();
  const owner = useWorkspaceFormOwner();
  const [scope] = useState(() => ({ formId, id, ownerId: owner?.id, store }));
  const live = useRef({ ...scope, revision });
  const mounted = useRef(true);
  useLayoutEffect(() => {
    mounted.current = true;
    live.current = { formId, id, ownerId: owner?.id, store, revision };
    return () => { mounted.current = false; };
  }, [formId, id, owner?.id, store, revision]);
  const isCurrent = () => mounted.current && live.current.formId === scope.formId && live.current.id === scope.id && live.current.ownerId === scope.ownerId && live.current.store === scope.store;
  const assertCurrent = () => { if (!isCurrent()) throw new Error("The record or workspace owner changed. Reopen this list before continuing."); };
  const [, redraw] = useState(0);
  const [session] = useState(() => {
    const prefix = owner ? `draft:tab:${owner.id}:${formId}` : null;
    const key = prefix ? `${prefix}:administration-lifecycle` : null;
    let state: LifecycleState = { id, revision: rowRevision(revision), pending: null, confirmed: null };
    let blocked = !recordIdSchema.safeParse(id).success;
    let uncertain = false;
    try {
      const stored = key ? store?.getViewState(key) : undefined;
      if (stored !== undefined) state = stateSchema.parse(JSON.parse(stored));
      else if (prefix) {
        // Carry an existing in-memory request forward when the list implementation
        // changes. Never discard one half of an older two-part save session.
        const previous = store?.getViewState(`${prefix}:save`);
        const submitted = store?.getViewState(`${prefix}:administration-payload`);
        if (previous !== undefined) {
          const saved = legacyStateSchema.parse(JSON.parse(previous));
          const pending = submitted && submitted !== "null" ? pendingSchema.parse(JSON.parse(submitted)) : null;
          if (Boolean(saved.pending) !== Boolean(pending) || (pending && (!saved.pending || saved.pending.fingerprint !== JSON.stringify([pending.id, pending.payload]) || saved.pending.contract.operationId !== pending.contract.operationId || saved.pending.contract.revision !== pending.contract.revision))) throw new Error(recoveryError);
          state = { id: saved.id, revision: saved.revision, pending, confirmed: null };
        } else if (submitted && submitted !== "null") throw new Error(recoveryError);
      }
      if (state.id !== id || (state.pending && (state.pending.id !== id || state.pending.contract.revision !== state.revision)) || (state.confirmed && (state.revision === null || BigInt(state.confirmed.revision) > BigInt(state.revision)))) throw new Error(recoveryError);
      if (state.pending) state.pending = Object.freeze({ ...state.pending, payload: Object.freeze(state.pending.payload), contract: Object.freeze(state.pending.contract) });
      uncertain = state.pending !== null;
    } catch { blocked = true; }
    const persist = () => { if (key && !blocked) store?.setViewState(key, JSON.stringify(state)); };
    const reconcile = (current: number | undefined) => {
      const incoming = rowRevision(current);
      if (!state.pending && incoming && (state.revision === null || BigInt(incoming) > BigInt(state.revision))) state.revision = incoming;
    };
    reconcile(revision);
    persist();
    return {
      get blocked() { return blocked; },
      get pending() { return state.pending; },
      get uncertain() { return uncertain || blocked; },
      get confirmed() { return state.confirmed; },
      prepare(payload: AdministrationLifecyclePayload, current: number | undefined) {
        if (blocked) throw new Error(recoveryError);
        if (state.pending) return state.pending;
        reconcile(current);
        if (!state.revision) throw new Error("Reopen this list before changing the record. Its current revision is unavailable.");
        state.pending = Object.freeze({ id, payload: Object.freeze(payloadSchema.parse(payload)), contract: Object.freeze({ operationId: crypto.randomUUID(), revision: state.revision }) });
        persist();
        return state.pending;
      },
      setUncertain() { uncertain = true; },
      accept(data: unknown) {
        const receipt = administrationSaveReceiptSchema.parse(data);
        if (blocked || !state.pending || receipt.id !== id || BigInt(receipt.revision) < BigInt(state.pending.contract.revision)) throw new Error("The status response does not match this request.");
        state.confirmed = { status: state.pending.payload.status, revision: receipt.revision };
        state.revision = receipt.revision;
        state.pending = null;
        uncertain = false;
        persist();
        return receipt;
      },
      rejected() { if (blocked) throw new Error(recoveryError); state.pending = null; uncertain = false; persist(); },
    };
  });
  const confirmed = session.confirmed;
  const incoming = rowRevision(revision);
  return {
    uncertain: session.uncertain,
    recoveryError: session.blocked ? recoveryError : null,
    confirmedStatus: confirmed && (!incoming || BigInt(confirmed.revision) > BigInt(incoming)) ? confirmed.status : null,
    isCurrent,
    getPending() { assertCurrent(); if (session.blocked) throw new Error(recoveryError); return session.pending; },
    prepare(payload: AdministrationLifecyclePayload) { assertCurrent(); return session.prepare(payload, live.current.revision); },
    setUncertain() { assertCurrent(); session.setUncertain(); redraw(value => value + 1); },
    accept(data: unknown) { assertCurrent(); const receipt = session.accept(data); redraw(value => value + 1); return receipt; },
    rejected() { assertCurrent(); session.rejected(); redraw(value => value + 1); },
  };
}
