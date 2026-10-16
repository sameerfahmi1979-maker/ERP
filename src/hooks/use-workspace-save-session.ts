"use client";
import { useState } from "react";
import { z } from "zod";
import { useWorkspaceDraftStoreContext } from "@/components/workspace/workspace-draft-provider";
import { useWorkspaceFormOwner } from "./use-workspace-form-owner";
import type { WorkspaceSaveContract, WorkspaceSaveReceipt } from "@/lib/workspace/save-contract";

type SaveState = {id:number|null;revision:string|null;pending?:{fingerprint:string;contract:WorkspaceSaveContract}};
export const saveStateSchema=z.object({
  id:z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable(),revision:z.string().nullable(),
  pending:z.object({fingerprint:z.string(),contract:z.object({operationId:z.string().uuid(),revision:z.string().nullable()}).strict()}).strict().optional(),
}).strict();
/** Bound to the opening revision, not a later cache refresh underneath a restored draft. Memory only. */
export function useWorkspaceSaveSession(formId:string,id:number|null,revision:number|undefined) {
  const store=useWorkspaceDraftStoreContext();
  const owner=useWorkspaceFormOwner();
  const [session]=useState(()=>{
    const key=owner ? `draft:tab:${owner.id}:${formId}:save` : null;
    const stored=key ? store?.getViewState(key) : undefined;
    let state:SaveState={id,revision:revision==null?null:String(revision)};
    let recoveryError:string|null=null;
    if(stored!==undefined) {
      try { state=saveStateSchema.parse(JSON.parse(stored)); }
      catch { recoveryError="The saved request could not be verified. Reopen the latest record and check whether it was saved before continuing."; }
    }
    const assertRecoverable=()=>{if(recoveryError) throw new Error(recoveryError);};
    // Never replace unverified persisted state with a fresh operation.
    const persist=()=>{if(key && !recoveryError) store?.setViewState(key,JSON.stringify(state));};
    persist();
    return {
      get id(){return state.id;},
      get recoveryError(){return recoveryError;},
      begin(payload:unknown) {
        assertRecoverable();
        const fingerprint=JSON.stringify(payload);
        if(state.pending && state.pending.fingerprint!==fingerprint) throw new Error("A previous save is unconfirmed. Retry its unchanged values or reopen the record to reconcile it before saving different data.");
        state.pending??={fingerprint,contract:{operationId:crypto.randomUUID(),revision:state.revision}};
        persist();return state.pending.contract;
      },
      accept(receipt:WorkspaceSaveReceipt){assertRecoverable();state={id:receipt.id,revision:receipt.revision};persist();},
      rejected(){assertRecoverable();delete state.pending;persist();},
    };
  });
  return session;
}
