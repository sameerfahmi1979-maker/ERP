'use client';
import {useMemo}from 'react';
import {z}from 'zod';
import {useWorkspaceSaveSession}from '@/hooks/use-workspace-save-session';
import {useWorkspaceDraftStoreContext}from '@/components/workspace/workspace-draft-provider';
import {saveRetirementKey}from '@/lib/workspace/save-retirement';
import type {WorkspaceDraftStoreApi}from '@/lib/workspace/workspace-draft-types';
export const employeeRecoveryIndexKey=(actor:string)=>`f11-employee-recovery-index:v1:${actor}`;
export function readEmployeeRecoveryIndex(store:WorkspaceDraftStoreApi,actor:string):string[]|null{
 const raw=store.getViewState(employeeRecoveryIndexKey(actor));if(!raw)return[];
 try{const scopes=z.array(z.string().min(1).max(160)).max(1000).parse(JSON.parse(raw));return new Set(scopes).size===scopes.length&&scopes.every(s=>s.startsWith(`f11-employee:${actor}:`))?scopes:null;}catch{return null;}
}
/** Opaque scope index survives tab closure. It contains no field values,
 * subject names or evidence. Malformed retained state is never overwritten. */
export function useEmployeeSaveSession(formId:string,id:number|null,revision:number|undefined,actor:string,options:{retirementScope:string;recordScope?:(id:number)=>string}){
 const store=useWorkspaceDraftStoreContext(),session=useWorkspaceSaveSession(formId,id,revision,options);
 return useMemo(()=>{
  const scope=()=>session.id!==null&&options.recordScope?options.recordScope(session.id):options.retirementScope;
  const index=()=>{
   if(!store)return;const current=readEmployeeRecoveryIndex(store,actor);if(current===null)return;
   const retained=store.getViewState(saveRetirementKey(scope()));
   const next=current.filter(s=>s!==scope());if(retained)next.push(scope());
   store.setViewState(employeeRecoveryIndexKey(actor),JSON.stringify(next));
  };
  // Inherit live getters rather than copying a stale id/pending snapshot.
  return Object.assign(Object.create(session)as typeof session,{
   begin(payload:unknown){if(!store||readEmployeeRecoveryIndex(store,actor)===null)throw Error('Employee recovery storage could not be verified. No request was sent.');return session.begin(payload);},
   retireForAccessLoss(){session.retireForAccessLoss();index();},
   settleRetired(...args:Parameters<typeof session.settleRetired>){const accepted=session.settleRetired(...args);if(accepted)index();return accepted;},
  });
 // These are opening-scope options, exactly like the underlying save session.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[session,store,actor]);
}
