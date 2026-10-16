'use client';
import {useEffect,useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useRouter} from 'next/navigation';
import {toast} from 'sonner';
import {Button} from '@/components/ui/button';
import {Checkbox} from '@/components/ui/checkbox';
import {Label} from '@/components/ui/label';
import {Skeleton} from '@/components/ui/skeleton';
import {hasGlobalPermission} from '@/lib/rbac/scope';
import type {AuthContext} from '@/lib/rbac/check';
import type {PartyTypeState} from '@/lib/master-data/party-save-contract';
import type {WorkspaceDraftCodec} from '@/hooks/use-workspace-controlled-draft';
import {useWorkspaceFormDraft} from '@/hooks/use-workspace-form-draft';
import {useWorkspaceTabDirty} from '@/hooks/use-workspace-tab-dirty';
import {getPartyTypeState,getPartyTypes} from '@/server/actions/master-data/parties';
import {usePartyTypeSave,type PartyTypeSelection} from './use-party-type-save';
import type {PartyType} from './party-types';

const codec:WorkspaceDraftCodec<PartyTypeSelection>={
 encode:v=>({selected_type_ids:[...v.selected].sort((a,b)=>a-b).join(','),primary_type_id:v.primary==null?'':String(v.primary)}),
 restore:(initial,read)=>{
  const value=read('selected_type_ids',initial.selected.join(','));
  const selected=value===''?[]:value.split(',').map(Number).filter(n=>Number.isSafeInteger(n)&&n>0);
  const primary=read('primary_type_id',initial.primary??'');
  return {selected,primary:primary===''?null:Number(primary)};
 },
};
type Props={partyId:number|null|undefined;disabled?:boolean;authContext:AuthContext;defaultTypeCode?:string|null;onDirtyChange?:(dirty:boolean)=>void};
export function PartyTypesTab({partyId,disabled,authContext,onDirtyChange}:Props){
 const types=useQuery({queryKey:['party_types'],queryFn:async()=>{const r=await getPartyTypes();if(!r.success||!r.data)throw Error('Party types could not be loaded.');return r.data;},staleTime:5*60*1000});
 const state=useQuery({queryKey:['party_type_assignments',partyId,'state'],enabled:!!partyId,queryFn:async()=>{const r=await getPartyTypeState(partyId!);if(!r.success||!r.data)throw Error(r.error??'Party assignments could not be loaded.');return r.data;},staleTime:0});
 if(!partyId)return <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">Save the party first to assign party types.</p>;
 if(types.isError||state.isError)return <div role="alert" className="space-y-3"><p>Party types could not be loaded. Your existing assignments have not been changed.</p><Button type="button" variant="outline" onClick={()=>{void types.refetch();void state.refetch();}}>Retry loading types</Button></div>;
 if(types.isPending||state.isPending||!state.data)return <Skeleton className="h-20 w-full"/>;
 return <PartyTypeEditor key={partyId} state={state.data} allTypes={types.data??[]} disabled={disabled} authContext={authContext} onDirtyChange={onDirtyChange}/>;
}
function PartyTypeEditor({state,allTypes,disabled,authContext,onDirtyChange}:{state:PartyTypeState;allTypes:PartyType[];disabled?:boolean;authContext:AuthContext;onDirtyChange?:(dirty:boolean)=>void}){
 const canManage=hasGlobalPermission(authContext,'master_data.parties.manage_types');
 const store=useWorkspaceFormDraft({formId:'party-types:'+state.id,enabled:canManage&&!disabled});
 const [baseline,setBaseline]=useState<PartyTypeSelection>(()=>({selected:state.assignments.map(a=>a.typeId),primary:state.primary}));
 const [value,setValue]=useState(()=>codec.restore(baseline,store.getDraftDefault)),current=useRef(value);
 const dirty=JSON.stringify(codec.encode(value))!==JSON.stringify(codec.encode(baseline));
 // Parent owns the combined dirty flag. A child no-op/save must never clear an
 // unsaved overview, or let overview Save & Close discard type selections.
 useEffect(()=>{onDirtyChange?.(dirty);},[dirty,onDirtyChange]);
 useWorkspaceTabDirty({isDirty:dirty,enabled:!onDirtyChange&&canManage&&!disabled});
 const setDraft=(update:(v:PartyTypeSelection)=>PartyTypeSelection)=>{
  const next=update(current.current);current.current=next;setValue(next);for(const [field,v]of Object.entries(codec.encode(next)))store.writeDraftField(field,v);
 };
 const acceptSaved=(submitted:PartyTypeSelection)=>{setBaseline(submitted);store.clearDraft();};
 const save=usePartyTypeSave(state.id,state.revision),flight=useRef(false),router=useRouter(),query=useQueryClient();
 const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[notice,setNotice]=useState<string|null>(null),[uncertain,setUncertain]=useState(false);
 const choices=[...allTypes];
 for(const a of state.assignments)if(!choices.some(t=>t.id===a.typeId))choices.push({id:a.typeId,type_code:a.code??'',type_name:a.name??'Unavailable saved type',is_active:a.active===true} as PartyType);
 const readonly=disabled||!canManage||busy||uncertain;
 const change=async()=>{
  if(flight.current)return;
  const payload={selected:[...value.selected].sort((a,b)=>a-b),primary:value.primary};
  if(payload.primary!==null&&!payload.selected.includes(payload.primary)){setError('Select a primary type from your selected types, or clear the primary.');return;}
  flight.current=true;setBusy(true);setError(null);setNotice(null);
  try{
   const r=await save(payload);setUncertain(r.uncertain===true);
   if(!r.success){setError(r.error??'The selections were not saved.');return;}
   acceptSaved(payload);toast.success(r.data?.changed?'Party types saved':'No changes to save');
   setNotice('Saved. Reopen the party overview before editing it; its revision may have changed.');
   try{await query.invalidateQueries({queryKey:['party_type_assignments',state.id]});await query.invalidateQueries({queryKey:['party_select_options']});router.refresh();}
   catch{setNotice('Saved, but the display could not refresh. Reopen this record before continuing.');}
  }finally{flight.current=false;setBusy(false);}
 };
 return <div className="space-y-4" aria-busy={busy}>
  {!canManage&&<p className="text-sm text-muted-foreground">Read-only: managing this shared catalogue requires global party-type permission.</p>}
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  {notice&&<p role="status" className="text-sm text-muted-foreground">{notice}</p>}
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{choices.map(t=>{
   const selected=value.selected.includes(t.id),primary=value.primary===t.id;
   return <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
    <div className="flex items-center gap-3"><Checkbox id={`party-${state.id}-type-${t.id}`} checked={selected} disabled={readonly||(!t.is_active&&!selected)} onCheckedChange={()=>setDraft(v=>({selected:selected?v.selected.filter(id=>id!==t.id):[...v.selected,t.id],primary:selected&&v.primary===t.id?null:v.primary}))}/>
     <Label htmlFor={`party-${state.id}-type-${t.id}`}>{t.type_name}{!t.is_active?' (inactive)':''}</Label></div>
    {selected&&<Button type="button" size="sm" variant={primary?'secondary':'ghost'} aria-label={`${primary?'Clear primary':'Set primary'} ${t.type_name}`} aria-pressed={primary} disabled={readonly||(!t.is_active&&!primary)} onClick={()=>setDraft(v=>({...v,primary:primary?null:t.id}))}>{primary?'Primary':'Set primary'}</Button>}
   </div>;
  })}</div>
  {choices.length===0&&<p>No party types are configured.</p>}
  {canManage&&!disabled&&<div className="flex items-center justify-end gap-3"><span className="text-sm text-muted-foreground">{dirty?'Unsaved type changes':''}</span><Button type="button" disabled={busy} onClick={()=>void change()}>{busy?'Saving…':uncertain?'Retry same selection':'Save Types'}</Button></div>}
 </div>;
}
