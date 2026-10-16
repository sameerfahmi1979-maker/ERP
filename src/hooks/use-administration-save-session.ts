"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { z } from "zod";
import { useWorkspaceDraftStoreContext } from "@/components/workspace/workspace-draft-provider";
import { useWorkspaceFormOwner } from "@/hooks/use-workspace-form-owner";
import { useWorkspaceSaveSession } from "@/hooks/use-workspace-save-session";
import type { WorkspaceSaveContract } from "@/lib/workspace/save-contract";

export const administrationSaveReceiptSchema = z.object({
  id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  revision: z.string().regex(/^[1-9]\d*$/),
  changed: z.boolean(),
  replayed: z.boolean(),
});
export const administrationLifecyclePayloadSchema = z.object({
  status: z.enum(["active", "inactive", "suspended"]),
  retire: z.boolean(),
}).strict();

type PendingSave<P> = { id: number | null; payload: P; contract: WorkspaceSaveContract };
const pendingSaveSchema = z.object({
  id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable(),
  payload: z.record(z.string(), z.unknown()),
  contract: z.object({ operationId: z.string().uuid(), revision: z.string().regex(/^[1-9]\d*$/).nullable() }).strict(),
}).strict();
const recoveryError = "The saved request could not be verified. Reopen the latest record and check whether the change was saved before continuing.";

/** F06 adapter: the F04 session owns operation/revision; its memory-only draft
 * store also retains the submitted payload so a retry never resolves lookups again.
 * These administration payloads contain no credentials, tokens, or file contents.
 */
export function useAdministrationSaveSession<P>(formId: string, id: number | null, revision?: number, validatePayload?: (payload: unknown, id: number | null) => boolean) {
  const session = useWorkspaceSaveSession(formId, id, revision);
  const store = useWorkspaceDraftStoreContext();
  const owner = useWorkspaceFormOwner();
  const [scope] = useState(() => ({ formId, id, ownerId: owner?.id, store }));
  const live = useRef(scope);
  const mounted = useRef(false);
  const retired = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    live.current = { formId, id, ownerId: owner?.id, store };
    if (formId !== scope.formId || id !== scope.id || owner?.id !== scope.ownerId || store !== scope.store) retired.current = true;
    return () => { mounted.current = false; };
  }, [formId, id, owner?.id, store, scope]);
  const isCurrent = () => {
    const current = live.current;
    return mounted.current && !retired.current && current.formId === scope.formId && current.id === scope.id && current.ownerId === scope.ownerId && current.store === scope.store;
  };
  const assertCurrentScope = () => {
    if (!isCurrent()) {
      throw new Error("The record or workspace owner changed. Reopen this record before saving.");
    }
  };
  const [attempt] = useState(() => {
    const key = owner ? `draft:tab:${owner.id}:${formId}:administration-payload` : null;
    const saveKey = owner ? `draft:tab:${owner.id}:${formId}:save` : null;
    let expectedSave: string | undefined;
    let expectedPayload: string | undefined;
    let pending: PendingSave<P> | null = null;
    let blocked = !!session.recoveryError || (id !== null && session.id !== id);
    let stopped = blocked;
    let confirmedFailure = false;
    const copy = () => pending === null ? null : JSON.parse(JSON.stringify(pending)) as PendingSave<P>;
    const assertWitness = () => {
      if (stopped) throw new Error(recoveryError);
      if (key && (!store || store.getViewState(key) !== expectedPayload || store.getViewState(saveKey!) !== expectedSave)) throw new Error(recoveryError);
    };
    // F04 already validated/normalized this string. Inspect presence only; its
    // schema and fingerprint/operation policy continue to belong to F04.
    const captureSave = () => {
      if (!saveKey) return;
      const raw = store?.getViewState(saveKey);
      if (typeof raw !== "string") throw new Error(recoveryError);
      expectedSave = raw;
    };
    try {
      if (key) {
        if (!store || blocked) throw new Error(recoveryError);
        captureSave();
        expectedPayload = store.getViewState(key);
        const normalized: unknown = JSON.parse(expectedSave!);
        if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) throw new Error(recoveryError);
        const hasPending = Object.hasOwn(normalized, "pending");
        const hasPayload = expectedPayload !== undefined && expectedPayload !== "null";
        if (hasPending !== hasPayload) throw new Error(recoveryError);
      }
      if (expectedPayload !== undefined && expectedPayload !== "null") {
        const parsed = pendingSaveSchema.parse(JSON.parse(expectedPayload));
        if (parsed.id !== session.id || (parsed.id === null) !== (parsed.contract.revision === null) || (validatePayload && !validatePayload(parsed.payload, parsed.id))) throw new Error(recoveryError);
        assertWitness();
        const contract = session.begin([parsed.id, parsed.payload]);
        if (contract.operationId !== parsed.contract.operationId || contract.revision !== parsed.contract.revision) throw new Error("Mismatched operation.");
        pending = parsed as PendingSave<P>;
        captureSave();
      }
    } catch { blocked = true; stopped = true; }
    const fail = (confirmed = false): never => {
      stopped = true;
      // Finance/signatory/service already distinguish confirmed local failure.
      // Do not disable their read-only recovery through a corruption flag.
      if (confirmed) confirmedFailure = true; else if (!confirmedFailure) blocked = true;
      throw new Error(recoveryError);
    };
    const check = () => { try { assertWitness(); } catch { fail(); } };
    const persist = () => {
      if (!key) return;
      const raw = JSON.stringify(pending);
      store!.setViewState(key, raw);
      if (store!.getViewState(key) !== raw || store!.getViewState(saveKey!) !== expectedSave) throw new Error(recoveryError);
      expectedPayload = raw;
    };
    return {
      get pending() { return pending; },
      get blocked() { return blocked; },
      get confirmedFailure() { return confirmedFailure; },
      getPending() { check(); return copy(); },
      prepare(payload: P) {
        check();
        if (pending) return copy()!;
        // Round-trip the JSON once: later component edits cannot mutate this request.
        const immutable = JSON.parse(JSON.stringify(payload)) as P;
        if (validatePayload && !validatePayload(immutable, session.id)) throw new Error("Invalid save payload.");
        let contract: WorkspaceSaveContract;
        try {
          contract = session.begin([session.id, immutable]);
          if (key && store!.getViewState(key) !== expectedPayload) throw new Error(recoveryError);
          captureSave();
        } catch { return fail(); }
        if (session.id !== null && !/^[1-9]\d*$/.test(contract.revision ?? "")) {
          try { session.rejected(); captureSave(); } catch { return fail(); }
          throw new Error("Reopen this record before saving. Its current revision is unavailable.");
        }
        pending = { id: session.id, payload: immutable, contract: { ...contract } };
        try { persist(); } catch { return fail(); }
        return copy()!;
      },
      accept(data: unknown) {
        const receipt = administrationSaveReceiptSchema.parse(data);
        if (!pending || (pending.id !== null && receipt.id !== pending.id)) throw new Error("Save response does not match the record.");
        try {
          assertWitness();
          session.accept(receipt);
          captureSave();
          pending = null;
          persist();
        } catch { return fail(true); }
        return receipt;
      },
      rejected() {
        check();
        try { session.rejected(); captureSave(); pending = null; persist(); }
        catch { fail(); }
      },
    };
  });
  const [savedId, setSavedId] = useState(session.id);
  const [uncertain, setUncertain] = useState(() => attempt.pending !== null || attempt.blocked);
  return {
    savedId, uncertain, setUncertain, isCurrent,
    get recoveryError() { return attempt.blocked ? recoveryError : null; },
    getPending: () => { assertCurrentScope(); return attempt.getPending(); },
    prepare(payload: P) { assertCurrentScope(); return attempt.prepare(payload); },
    accept(data: unknown) {
      assertCurrentScope();
      let receipt: z.infer<typeof administrationSaveReceiptSchema>;
      try { receipt = attempt.accept(data); }
      catch (error) { if (attempt.confirmedFailure) setUncertain(false); throw error; }
      setSavedId(receipt.id);
      setUncertain(false);
      return receipt;
    },
    rejected() { assertCurrentScope(); attempt.rejected(); setUncertain(false); },
  };
}
