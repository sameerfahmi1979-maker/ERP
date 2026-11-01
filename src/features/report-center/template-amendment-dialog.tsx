'use client';

import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {ERPChildDialogForm} from '@/components/erp/erp-child-dialog-form';
import {Button} from '@/components/ui/button';
import {useReadCacheOwner} from '@/components/layout/read-cache-boundary';
import {getTemplateAmendment,transitionTemplateAmendment} from '@/server/actions/reports/template-amendments';
import {createWorkspaceSaveAttempt,type WorkspaceSaveContract} from '@/lib/workspace/save-contract';
import type {TemplateAmendmentReceipt,TemplateAmendmentAction} from '@/lib/report-center/template-amendment';
import type {ReportTemplate,ReportBrandingProfile} from '@/lib/report-center/types';
import {TemplateForm} from './template-form';

type Props={open:boolean;onOpenChange:(open:boolean)=>void;template:ReportTemplate;profiles:ReportBrandingProfile[];
 canEdit:boolean;canApprove:boolean;canPublish:boolean;canSignGlobal:boolean;onPublished:(template:ReportTemplate)=>void};
type Transition=Exclude<TemplateAmendmentAction,'save'>;
// Names, rather than implementation keys or request UUIDs, are shown to users.
const labels:Partial<Record<keyof ReportTemplate,string>>={template_name:'Name',template_type:'Type',branding_profile_id:'Branding profile',
 default_orientation:'Orientation',page_size:'Paper size',font_family:'Font',language_mode:'Language',show_logo:'Logo',show_small_logo:'Small logo',
 show_address:'Address',show_trn:'TRN',show_license:'Licence',show_signatory:'Signatory',show_stamp:'Stamp',show_watermark:'Watermark',
 watermark_text:'Watermark text',is_active:'Active',is_default:'Default',body_html_en:'English content',body_html_ar:'Arabic content',custom_css:'Custom styles'};

export function TemplateAmendmentDialog(props:Props){
 const owner=useReadCacheOwner();
 if(!props.open||owner?.isLive()===false)return null;
 return <AmendmentSession key={JSON.stringify([props.template.id,owner?.identity,owner?.generation])} {...props}/>;
}
function AmendmentSession({onOpenChange,template,profiles,canEdit,canApprove,canPublish,canSignGlobal,onPublished}:Props){
 const [state,setState]=useState<TemplateAmendmentReceipt|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[editing,setEditing]=useState(false),[note,setNote]=useState('');
 const [unconfirmed,setUnconfirmed]=useState(false);
 const owner=useReadCacheOwner(),activation=useRef<{live:boolean}|null>(null),flight=useRef(false);
 const attempt=useRef(createWorkspaceSaveAttempt()),pending=useRef<{action:Transition;contract:WorkspaceSaveContract;note?:string}|null>(null);
 useEffect(()=>{
  if(!busy&&!unconfirmed)return;
  const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
  window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
 },[busy,unconfirmed]);
 useLayoutEffect(()=>{
  const token={live:true};activation.current=token;
  void getTemplateAmendment(template.id).then(r=>{
   if(!token.live||owner?.isLive()===false)return;
   if(r.success&&r.data)setState(r.data);else setError(r.error??'Pending changes could not be loaded.');
  }).catch(()=>{if(token.live&&owner?.isLive()!==false)setError('Pending changes could not be loaded.');});
  return()=>{token.live=false;};
 },[owner,template.id]);
 const load=async()=>{
  const token=activation.current;
  try{const r=await getTemplateAmendment(template.id);if(token?.live&&activation.current===token&&owner?.isLive()!==false){if(r.success&&r.data){setState(r.data);setError('');onPublished(r.data.published_template);}else setError(r.error??'Pending changes could not be loaded.');}}
  catch{if(token?.live&&activation.current===token&&owner?.isLive()!==false)setError('Pending changes could not be loaded.');}
 };
 const change=async(action:Transition)=>{
  if(flight.current||!state||owner?.isLive()===false)return;
  const token=activation.current,current=()=>!!token?.live&&activation.current===token&&owner?.isLive()!==false;
  if(!current())return;
  flight.current=true;setBusy(true);setError('');
  pending.current??={action,contract:attempt.current.begin({id:template.id,action,note},state.revision),note:['reject','discard'].includes(action)?note:undefined};
  const request=pending.current;
  try{
   const r=await transitionTemplateAmendment(template.id,request.action,request.contract,request.note);
   if(!current())return;
   if(!r.success||!r.data){
    if(r.uncertain||unconfirmed){setUnconfirmed(true);setError('Change unconfirmed. Retry the retained request before closing or changing values.');}
    else{attempt.current.resolved();pending.current=null;setError(r.error??'The change was not saved.');}
    return;
   }
   setState(r.data);setUnconfirmed(false);attempt.current.resolved();pending.current=null;setNote('');
   // The receipt may be an old replay; always reconcile the current publication.
   await load();
  }catch{if(current()){setUnconfirmed(true);setError('Change unconfirmed. Retry the retained request before closing.');}}
  finally{if(current()){flight.current=false;setBusy(false);}}
 };
 const status=state?.amendment?.status,active=!!status&&!['published','discarded'].includes(status);
 const stale=active&&state?.amendment?.base_revision!==String(state?.published_template.workspace_revision);
 const differences=state?Object.entries(labels).filter(([key])=>JSON.stringify(state.template[key as keyof ReportTemplate])!==JSON.stringify(state.published_template[key as keyof ReportTemplate])):[];
 function display(value:unknown,key:string){
  if(key==='branding_profile_id')return profiles.find(p=>p.id===value)?.profile_name??(value==null?'No branding profile':'Selected profile');
  return typeof value==='boolean'?(value?'Yes':'No'):value==null||value===''?'—':String(value);
 }
 return <>
  <ERPChildDialogForm open={!editing} onOpenChange={open=>{if(!open&&!flight.current&&!unconfirmed)onOpenChange(false);}}
   title={`Template changes — ${template.template_name}`} mode="view" size="lg" submitLabel="Close"
   onSubmit={()=>{if(!flight.current&&!unconfirmed)onOpenChange(false);}} isSubmitting={busy} closeDisabled={busy||unconfirmed}
   subtitle="Keep the same template. Published settings remain active until reviewed changes are published.">
   {error&&<p role="alert" className="mb-3 text-destructive">{error}</p>}
   {!state&&!error&&<p role="status">Loading template changes…</p>}
   {!state&&error&&<Button onClick={()=>void load()}>Retry loading changes</Button>}
   {state&&<div className="space-y-4">
    <p>Published version: {state.published_template.version_no}. {active?`Pending changes: ${status?.replace('_',' ')}.`:'No pending changes.'}</p>
    {stale&&<p role="alert">The published version changed. Discard these pending changes after reviewing them, then start again.</p>}
    {active&&<div className="overflow-auto"><table className="w-full text-sm"><caption className="text-left mb-2">Changes awaiting publication</caption><thead><tr><th className="text-left">Setting</th><th className="text-left">Published</th><th className="text-left">Pending</th></tr></thead><tbody>
     {differences.map(([key,label])=><tr key={key} className="border-t"><th className="text-left p-2">{label}</th><td className="p-2 whitespace-pre-wrap break-words max-w-60">{display(state.published_template[key as keyof ReportTemplate],key)}</td><td className="p-2 whitespace-pre-wrap break-words max-w-60">{display(state.template[key as keyof ReportTemplate],key)}</td></tr>)}
     {!differences.length&&<tr><td colSpan={3}>No configuration differences.</td></tr>}
    </tbody></table></div>}
    <fieldset disabled={busy||unconfirmed} className="space-y-3">
     <div className="flex flex-wrap gap-2">
      {canEdit&&!stale&&(!active||status==='draft'||status==='rejected')&&<Button onClick={()=>setEditing(true)}>{active?'Edit pending changes':'Edit this template'}</Button>}
      {canEdit&&!stale&&active&&['draft','rejected'].includes(status!)&&<Button onClick={()=>void change('submit')}>Submit changes for review</Button>}
      {canApprove&&!stale&&status==='in_review'&&<Button onClick={()=>void change('approve')}>Approve changes</Button>}
      {canPublish&&!stale&&status==='approved'&&<Button onClick={()=>void change('publish')}>Publish changes</Button>}
      {canEdit&&!stale&&['in_review','approved'].includes(status??'')&&<Button variant="outline" onClick={()=>void change('withdraw')}>Return changes to draft</Button>}
     </div>
     {active&&(canEdit||canApprove&&status==='in_review')&&<><label className="block text-sm">Reason for rejection or discarding
      <textarea value={note} onChange={e=>setNote(e.target.value)} maxLength={2000} className="block w-full border border-input bg-background rounded p-2 mt-1"/></label><div className="flex gap-2">
      {canApprove&&!stale&&status==='in_review'&&<Button variant="outline" disabled={note.trim().length<5} onClick={()=>void change('reject')}>Reject changes</Button>}
      {canEdit&&<Button variant="outline" disabled={note.trim().length<5} onClick={()=>void change('discard')}>Discard pending changes</Button>}
     </div></>}
    </fieldset>
    {unconfirmed&&<Button disabled={busy} onClick={()=>pending.current&&void change(pending.current.action)}>Retry retained request</Button>}
    {!busy&&!unconfirmed&&<Button variant="outline" onClick={()=>void load()}>Refresh current changes</Button>}
    <p className="text-sm text-muted-foreground">A different authorized reviewer must approve changes. Issued documents, reference numbers and verification links keep their original versions.</p>
   </div>}
  </ERPChildDialogForm>
  {editing&&state&&<TemplateForm open onOpenChange={open=>{if(!open)setEditing(false);}} template={state.template} profiles={profiles} canSignGlobal={canSignGlobal} adminAmendment
   onSaved={()=>{setEditing(false);void load();}}/>}
 </>;
}
