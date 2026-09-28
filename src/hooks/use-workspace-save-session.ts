"use client";
import { useState } from "react";
import { useWorkspaceDraftStoreContext } from "@/components/workspace/workspace-draft-provider";
import { useWorkspaceFormOwner } from "./use-workspace-form-owner";
import type { WorkspaceSaveContract, WorkspaceSaveReceipt } from "@/lib/workspace/save-contract";

type SaveState = {id:number|null;revision:string|null;pending?:{fingerprint:string;contract:WorkspaceSaveContract}};
/** Bound to the opening revision, not a later cache refresh underneath a restored draft. Memory only. */
export function useWorkspaceSaveSession(formId:string,id:number|null,revision:number|undefined) {
  const store=useWorkspaceDraftStoreContext();
  const owner=useWorkspaceFormOwner();
  const [session]=useState(()=>{
    const key=owner ? `draft:tab:${owner.id}:${formId}:save` : null;
    const stored=key ? store?.getViewState(key) : undefined;
    let state:SaveState=stored ? JSON.parse(stored) as SaveState : {id,revision:revision==null?null:String(revision)};
    const persist=()=>{if(key) store?.setViewState(key,JSON.stringify(state));};
    persist();
    return {
      get id(){return state.id;},
      begin(payload:unknown) {
        const fingerprint=JSON.stringify(payload);
        if(state.pending && state.pending.fingerprint!==fingerprint) throw new Error("A previous save is unconfirmed. Retry its unchanged values or reopen the record to reconcile it before saving different data.");
        state.pending??={fingerprint,contract:{operationId:crypto.randomUUID(),revision:state.revision}};
        persist();return state.pending.contract;
      },
      accept(receipt:WorkspaceSaveReceipt){state={id:receipt.id,revision:receipt.revision};persist();},
      rejected(){delete state.pending;persist();},
    };
  });
  return session;
}
