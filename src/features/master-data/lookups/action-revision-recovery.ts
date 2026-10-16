import {z} from 'zod';
import {saveStateSchema} from '@/hooks/use-workspace-save-session';
import type {WorkspaceDraftStoreApi} from '@/lib/workspace/workspace-draft-types';
import {lookupCommandSchema,lookupRevision} from './mutation-contract';

export const lookupActionRecoveryMessage='The earlier lookup action could not be identified safely. Reopen this list and reconcile the original request before another change.';
type Scope={store:WorkspaceDraftStoreApi;ownerId:string;kind:'category'|'value';id:number;revision:number;categoryId?:number;categoryRevision?:number};
export type LookupActionOpening={formKey:string;revision:number;pending:boolean};
const retainedSchema=z.object({id:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),payload:lookupCommandSchema,contract:z.object({operationId:z.string().uuid(),revision:lookupRevision}).strict()}).strict();
const positive=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>0;

/** Read-only scoped admission. A pending legacy/new pair wins over fresh props;
 * settled history is retained, never rewritten to manufacture a fresh revision. */
export function resolveLookupActionOpening(input:Omit<Scope,'store'|'ownerId'>&{store:WorkspaceDraftStoreApi|null;ownerId:string|undefined}):{ok:true;opening:LookupActionOpening}|{ok:false;error:string}{
 try{
  if(!input.store||!input.ownerId||!input.store.listViewStateKeysForTab||!positive(input.id)||!positive(input.revision)||
   (input.kind==='value'&&(!positive(input.categoryId)||!positive(input.categoryRevision))))throw Error(lookupActionRecoveryMessage);
  const {store,ownerId,kind,id}=input,base=`draft:tab:${ownerId}:`,prefix=`lookup-row-action:${kind}:${id}:`,legacy=`lookup-${kind}-actions-${id}`;
  const listed=[...store.listViewStateKeysForTab!(ownerId,prefix)];
  if(new Set(listed).size!==listed.length)throw Error(lookupActionRecoveryMessage);
  const forms=new Set<string>();
  for(const key of listed){
   if(!key.startsWith(base+prefix))throw Error(lookupActionRecoveryMessage);
   const suffix=key.slice((base+prefix).length);
   const match=suffix.match(/^([1-9]\d*):([1-9]\d*|category):(save|administration-payload)$/);
   if(!match||!lookupRevision.safeParse(match[1]).success||
    (kind==='category'?match[2]!=='category':!lookupRevision.safeParse(match[2]).success))throw Error(lookupActionRecoveryMessage);
   forms.add(key.slice(base.length,-(':'+match[3]).length));
  }
  if(store.getViewState(base+legacy+':save')!==undefined||store.getViewState(base+legacy+':administration-payload')!==undefined)forms.add(legacy);
  const pending:LookupActionOpening[]=[];
  for(const formKey of forms){
   const raw=store.getViewState(base+formKey+':save'),payload=store.getViewState(base+formKey+':administration-payload');
   if(typeof raw!=='string')throw Error(lookupActionRecoveryMessage);
   const state=saveStateSchema.parse(JSON.parse(raw));
   if(state.id!==id||!lookupRevision.safeParse(state.revision).success)throw Error(lookupActionRecoveryMessage);
   if(formKey!==legacy){
    const openingRevision=formKey.slice(prefix.length).split(':')[0];
    if(BigInt(state.revision!)<BigInt(openingRevision))throw Error(lookupActionRecoveryMessage);
   }
   const hasPayload=payload!==undefined&&payload!=='null';
   if(!!state.pending!==hasPayload)throw Error(lookupActionRecoveryMessage);
   if(state.pending){
    const original=retainedSchema.parse(JSON.parse(payload!)),command=original.payload;
    if(original.id!==id||command.kind!==kind||command.action==='save'||
     (kind==='value'&&command.categoryId!==input.categoryId)||
     original.contract.revision!==state.revision||original.contract.revision!==state.pending.contract.revision||
     original.contract.operationId!==state.pending.contract.operationId||state.pending.fingerprint!==JSON.stringify([id,command]))throw Error(lookupActionRecoveryMessage);
    pending.push({formKey,revision:Number(state.revision),pending:true});
   }else if(payload!==undefined&&payload!=='null')throw Error(lookupActionRecoveryMessage);
  }
  if(pending.length>1)throw Error(lookupActionRecoveryMessage);
  if(pending.length===1)return{ok:true,opening:pending[0]};
  const formKey=`${prefix}${input.revision}:${kind==='category'?'category':input.categoryRevision}`;
  const current=store.getViewState(base+formKey+':save');
  // An accepted own receipt can be newer than the still-arriving RSC props.
  const revision=current===undefined?input.revision:Number(saveStateSchema.parse(JSON.parse(current)).revision);
  return{ok:true,opening:{formKey,revision,pending:false}};
 }catch{return{ok:false,error:lookupActionRecoveryMessage};}
}
