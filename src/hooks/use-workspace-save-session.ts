"use client";
import { useState } from "react";
import { useWorkspaceDraftStoreContext } from "@/components/workspace/workspace-draft-provider";
import { useWorkspaceFormOwner } from "./use-workspace-form-owner";
import type { WorkspaceSaveContract, WorkspaceSaveReceipt } from "@/lib/workspace/save-contract";
import {createSaveRetirement, parseSaveRetirements, saveRetirementKey, validRetiredReceipt} from "@/lib/workspace/save-retirement";

type SaveState = {id:number|null;revision:string|null;pending?:{fingerprint:string;contract:WorkspaceSaveContract}};
/** Bound to the opening revision, not a later cache refresh underneath a restored draft. Memory only. */
export function useWorkspaceSaveSession(formId:string,id:number|null,revision:number|undefined, options?: {retirementScope: string; recordScope?: (id: number) => string}) {
  const store=useWorkspaceDraftStoreContext();
  const owner=useWorkspaceFormOwner();
  const [session]=useState(()=>{
    const key=owner ? `draft:tab:${owner.id}:${formId}:save` : null;
    const stored=key ? store?.getViewState(key) : undefined;
    let state:SaveState=stored ? JSON.parse(stored) as SaveState : {id,revision:revision==null?null:String(revision)};
    const scope = () => state.id !== null && options?.recordScope ? options.recordScope(state.id) : options?.retirementScope;
    const markerKey = () => {const value = scope(); return value ? saveRetirementKey(value) : null;};
    let retired = false;
    let localMarker: string | undefined;
    const readMarker = () => {const key = markerKey(); return key ? (store ? store.getViewState(key) || undefined : localMarker) : undefined;};
    const writeMarker = (value: string) => {localMarker = value || undefined; const key = markerKey(); if (key) store?.setViewState(key, value);};
    const persist=()=>{if(key) store?.setViewState(key,JSON.stringify(state));};
    if (readMarker()) {
      const markers = parseSaveRetirements(readMarker()!, scope()!);
      if (state.pending && markers && !markers.some(marker => marker.operationId === state.pending!.contract.operationId)) {
        writeMarker(JSON.stringify([...markers, createSaveRetirement(scope()!, state.id, state.pending.contract)]));
      }
      state = {id: state.id, revision: state.revision}; retired = true;
    }
    persist();
    return {
      get id(){return state.id;},
      get isRetired(){return retired;},
      get hasPending(){return !!state.pending;},
      get requiresReconciliation(){return !!readMarker();},
      begin(payload:unknown) {
        if (retired || readMarker()) throw new Error("This save is blocked after an access change. An earlier operation may still be unconfirmed; do not submit it again.");
        const fingerprint=JSON.stringify(payload);
        if(state.pending && state.pending.fingerprint!==fingerprint) throw new Error("A previous save is unconfirmed. Retry its unchanged values or reopen the record to reconcile it before saving different data.");
        state.pending??={fingerprint,contract:{operationId:crypto.randomUUID(),revision:state.revision}};
        persist();return state.pending.contract;
      },
      accept(receipt:WorkspaceSaveReceipt){if (retired || readMarker()) return; state={id:receipt.id,revision:receipt.revision};persist();},
      rejected(){if (retired || readMarker()) return; delete state.pending;persist();},
      /** Opt-in only: remove the raw fingerprint, retaining only opaque receipt identity. */
      retireForAccessLoss() {
        if (!options) return;
        if (state.pending) {
          const raw = readMarker(), markers = raw ? parseSaveRetirements(raw, scope()!) : [];
          // Malformed state stays blocked. Never overwrite another tab's marker.
          if (markers && !markers.some(marker => marker.operationId === state.pending!.contract.operationId)) {
            writeMarker(JSON.stringify([...markers, createSaveRetirement(scope()!, state.id, state.pending.contract)]));
          }
        }
        retired = true;
        state = {id: state.id, revision: state.revision};
        persist();
      },
      /** Only a matching definitive result may resolve an opaque marker. Never restores a draft. */
      settleRetired(operationId: string, outcome: {receipt: WorkspaceSaveReceipt} | {rolledBack: true}) {
        if (!options || !retired) return false;
        const raw = readMarker(), markers = raw ? parseSaveRetirements(raw, scope()!) : null;
        const marker = markers?.find(entry => entry.operationId === operationId);
        if (!marker || !markers) return false;
        if ("receipt" in outcome) {
          if (!validRetiredReceipt(marker, outcome.receipt)) return false;
        }
        const remaining = markers.filter(entry => entry.operationId !== operationId);
        writeMarker(remaining.length ? JSON.stringify(remaining) : "");
        if ("receipt" in outcome) state = {id: outcome.receipt.id, revision: outcome.receipt.revision};
        persist(); return true;
      },
    };
  });
  return session;
}
