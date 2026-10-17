import {saveStateSchema} from '@/hooks/use-workspace-save-session';
import type {WorkspaceDraftStoreApi} from '@/lib/workspace/workspace-draft-types';

export const partyRecoveryMessage='The earlier save request could not be identified safely. Do not submit another change. Reconcile the saved record before starting a new edit.';
export type PartyRevisionSnapshot=readonly (readonly [string,string])[];
export type PartyRevisionScope={store:WorkspaceDraftStoreApi;ownerId:string;family:'party-address'|'party-child';formId:string;id:number|null};
export type PartyRevisionOpening=PartyRevisionScope&{
 formKey:string;key:string;initial:ReturnType<typeof saveStateSchema.parse>;snapshot:PartyRevisionSnapshot;
};
export type PartyRevisionAdmission={ok:true;opening:PartyRevisionOpening}|{ok:false;error:string};

const relativePrefix=(scope:PartyRevisionScope)=>`${scope.family}:${scope.formId}:${scope.id??'new'}:`;
const fullPrefix=(scope:PartyRevisionScope)=>`draft:tab:${scope.ownerId}:${relativePrefix(scope)}`;

/** Scoped discovery reads view strings only. It never initializes or repairs a session. */
export function readPartyRevisionSnapshot(scope:PartyRevisionScope):PartyRevisionSnapshot{
 if(!scope.ownerId||!scope.formId||!scope.store.listViewStateKeysForTab)throw Error(partyRecoveryMessage);
 const prefix=fullPrefix(scope);
 const keys=[...scope.store.listViewStateKeysForTab(scope.ownerId,relativePrefix(scope))].sort();
 if(new Set(keys).size!==keys.length)throw Error(partyRecoveryMessage);
 return keys.map(key=>{
  const token=key.slice(prefix.length);
  if(!key.startsWith(prefix)||!(scope.id===null?/^new:save$/:/^(?:[1-9]\d*|new):save$/).test(token))throw Error(partyRecoveryMessage);
  const raw=scope.store.getViewState(key);
  if(typeof raw!=='string')throw Error(partyRecoveryMessage);
  return [key,raw] as const;
 });
}

export function assertPartyRevisionSnapshot(scope:PartyRevisionScope,expected:PartyRevisionSnapshot){
 const actual=readPartyRevisionSnapshot(scope);
 if(actual.length!==expected.length||actual.some(([key,raw],i)=>key!==expected[i][0]||raw!==expected[i][1]))throw Error(partyRecoveryMessage);
}

/** Pure expected-state calculation; callers still verify bytes before adopting it. */
export function withPartyRevisionWrite(opening:PartyRevisionOpening,expected:PartyRevisionSnapshot,raw:string):PartyRevisionSnapshot{
 return [...expected.filter(([key])=>key!==opening.key),[opening.key,raw] as const].sort(([a],[b])=>a<b?-1:a>b?1:0);
}

export function resolvePartyRevisionOpening(input:{store:WorkspaceDraftStoreApi|null;ownerId:string|undefined;family:PartyRevisionScope['family'];formId:string;id:number|null;revision?:number}):PartyRevisionAdmission{
 try{
  if(!input.store||!input.ownerId||!input.formId)throw Error(partyRecoveryMessage);
  if(input.id!==null&&(!Number.isSafeInteger(input.id)||input.id<=0))throw Error(partyRecoveryMessage);
  if(input.revision!==undefined&&(!Number.isSafeInteger(input.revision)||input.revision<=0))throw Error(partyRecoveryMessage);
  const scope:PartyRevisionScope={...input,store:input.store,ownerId:input.ownerId};
  const snapshot=readPartyRevisionSnapshot(scope);
  const entries=snapshot.map(([key,raw])=>{
   const state=saveStateSchema.parse(JSON.parse(raw));
   if(state.id!==scope.id||(scope.id===null&&state.revision!==null)||
      (state.revision!==null&&!/^[1-9]\d*$/.test(state.revision))||
      (state.pending&&state.pending.contract.revision!==state.revision))throw Error(partyRecoveryMessage);
   return {key,state};
  });
  const pending=entries.filter(entry=>entry.state.pending);
  if(pending.length>1)throw Error(partyRecoveryMessage);
  const current=`${fullPrefix(scope)}${scope.id===null?'new':input.revision??'new'}:save`;
  const selected=pending[0]??entries.find(entry=>entry.key===current);
  const key=selected?.key??current;
  const initial=selected?.state??{id:scope.id,revision:scope.id===null||input.revision==null?null:String(input.revision)};
  return {ok:true,opening:{...scope,key,formKey:key.slice(`draft:tab:${scope.ownerId}:`.length,-':save'.length),initial,snapshot}};
 }catch{return {ok:false,error:partyRecoveryMessage};}
}
