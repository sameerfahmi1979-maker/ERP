'use client';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {useQueryClient} from '@tanstack/react-query';
import {toast} from 'sonner';
import {Info,Landmark,Shield,Tag} from 'lucide-react';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Checkbox} from '@/components/ui/checkbox';
import {Textarea} from '@/components/ui/textarea';
import {Button} from '@/components/ui/button';
import {CountrySelect} from '@/components/erp/geography';
import {LookupSelect} from '@/components/erp/lookup-select';
import {RequiredLabel} from '@/components/erp/required-label';
import {ERPRecordWorkspaceForm,ERPRecordSectionPanel} from '@/components/workspace/erp-record-workspace-form';
import {DraftRestoredNotice} from '@/components/workspace/draft-restored-notice';
import {useWorkspaceFormNavigation} from '@/hooks/use-workspace-form-navigation';
import {useWorkspaceFormSection} from '@/hooks/use-workspace-form-section';
import {useWorkspaceControlledDraft} from '@/hooks/use-workspace-controlled-draft';
import {useAdministrationSaveSession} from '@/hooks/use-administration-save-session';
import {createSaveAdmission} from '@/lib/workspace/save-admission';
import {reportWorkspaceFieldErrors,workspaceValidationFailure} from '@/lib/workspace/field-errors';
import {financeReferenceCreateSchemas,financeReferenceUpdateSchemas,financeReferencePaths,financeReferencePermissions,verifyFinanceReferenceReceipt,validFinanceReferenceRequest,type FinanceReferenceEntity,type FinanceReferenceRequest} from '@/lib/master-data/finance-reference-contract';
import type {AuthContext} from '@/lib/rbac/check';
import {invalidateBanks,invalidatePaymentTerms,invalidateTaxTypes} from '@/lib/query/invalidation';
import {referenceFields,referenceNames,referenceFormState,referenceFormPayload,referenceSubmittedState,referenceDraftCodec,type FinanceReferenceRecord,type ReferenceField} from '../reference-form-state';
import {saveFinanceReference} from '../reference-mutations';
type Props={entity:FinanceReferenceEntity;record?:FinanceReferenceRecord|null;mode:'add'|'edit'|'view';authContext:AuthContext};
const invalidations={banks:invalidateBanks,payment_terms:invalidatePaymentTerms,tax_types:invalidateTaxTypes};
export function FinanceReferenceWorkspaceForm(props:Props){return <ReferenceFormSession key={`${props.authContext.profile?.id??'none'}:${props.entity}:${props.record?.id??'new'}:${props.mode}`} {...props}/>;}
function ReferenceFormSession({entity,record,mode,authContext}:Props){
 const n=referenceNames[entity],formId=n.prefix+'-workspace-form',fields=referenceFields(entity);
 const navigation=useWorkspaceFormNavigation(),router=useRouter(),queryClient=useQueryClient();
 const {activeTab,markDirty}=navigation;
 const permissions=financeReferencePermissions(authContext),locked=record?.is_locked===true&&!permissions.overrideLocked;
 const viewing=mode==='view'||!permissions.manage||locked;
 const session=useAdministrationSaveSession<FinanceReferenceRequest>(formId,record?.id??null,record?.workspace_revision,(p,id)=>validFinanceReferenceRequest(entity,p,id)&&p.action==='save');
 const id=useRef(session.savedId),opening=useRef(record?referenceFormState(entity,record):null);
 const editing=session.savedId!==null;
 const {value:form,setValue:setForm,isDirty,acceptSaved,getCurrent,restoredFromDraft}=useWorkspaceControlledDraft({formId,initialValue:referenceFormState(entity,record),codec:referenceDraftCodec,enabled:!viewing});
 const set=(key:string,value:string|boolean)=>setForm(old=>({...old,[key]:value}));
 const detailSection=entity==='banks'?'contact':entity==='payment_terms'?'terms':'vat';
 const sections=[{id:'basic',label:'Basic Info',icon:Landmark},{id:detailSection,label:entity==='banks'?'Contact':entity==='payment_terms'?'Terms':'VAT & Applicability',icon:Tag},{id:'status',label:'Status',icon:Shield},{id:'audit',label:'Audit Info',icon:Info}];
 const [activeSection,setActiveSection]=useWorkspaceFormSection(formId,'basic',sections.map(s=>s.id));
 const [admission]=useState(createSaveAdmission),[busy,setBusy]=useState(false),[message,setMessage]=useState<string|null>(null),[localBlocked,setLocalBlocked]=useState(false);
 const lease=useRef<{active:boolean}|null>(null),allowed=useRef(!viewing);
 useLayoutEffect(()=>{allowed.current=!viewing;});
 useLayoutEffect(()=>{const current={active:true};lease.current=current;return ()=>{current.active=false;admission.leave();};},[admission]);
 useEffect(()=>{if(activeTab?.id)markDirty(activeTab.id,isDirty);},[activeTab?.id,markDirty,isDirty]);
 const notify=(text:string)=>{setMessage(text);try{toast.error(text);}catch{/* Feedback is not a mutation. */}};
 const save=async(closeAfter=false)=>{
  const activation=lease.current,current=()=>!!activation?.active&&lease.current===activation&&session.isCurrent();
  if(!current()||!allowed.current||localBlocked||session.recoveryError||!admission.enter())return false;
  setBusy(true);setMessage(null);
  let dispatched=false,confirmed=false,recovering=false,rejected=false;
  try{
   let pending=session.getPending();recovering=pending!==null;
   const currentForm=structuredClone(getCurrent()),creating=id.current===null;
   if(!pending){
    const values=referenceFormPayload(entity,currentForm,creating?null:opening.current);
    if(entity==='tax_types'&&currentForm.effective_to&&String(currentForm.effective_to)<String(currentForm.effective_from)){
     setActiveSection('basic');reportWorkspaceFieldErrors(document.getElementById(formId),{effective_to:'Effective to must be on or after effective from.'});notify('Check the highlighted fields before saving.');return false;
    }
    const parsed=(creating?financeReferenceCreateSchemas[entity]:financeReferenceUpdateSchemas[entity]).safeParse(values);
    if(!parsed.success){const failure=workspaceValidationFailure(parsed.error.issues),first=String(parsed.error.issues[0]?.path[0]??'');setActiveSection(fields.find(f=>f.key===first)?.section??'basic');reportWorkspaceFieldErrors(document.getElementById(formId),failure.fieldErrors);notify(failure.error);return false;}
    // A no-op still gets an original recoverable receipt. Do not coerce omitted
    // fields or revalidate historical unchanged text through the create schema.
    const data=Object.keys(values).length?values:{[n.name]:currentForm[n.name]};
    pending=session.prepare({action:'save',data});
   }
   const submitted=referenceSubmittedState(entity,opening.current??currentForm,pending.payload.data);
   if(!current())return false;
   dispatched=true;const result=await saveFinanceReference(entity,pending.id,pending.payload,pending.contract);
   if(!current())return false;
   if(!result.success){
    rejected=!recovering&&!result.uncertain;
    if(rejected){session.rejected();reportWorkspaceFieldErrors(document.getElementById(formId),result.fieldErrors);notify(result.error??'The change was rejected.');}
    else{session.setUncertain(true);notify('The earlier save is still unconfirmed. Recover the original request before another change.');}
    return false;
   }
   const receipt=verifyFinanceReferenceReceipt(result.data,pending.id,pending.contract);
   if(!receipt)throw Error('Incomplete receipt');
   confirmed=true;
   session.accept(receipt);id.current=receipt.id;opening.current=submitted;
   const unchanged=acceptSaved(submitted),route=`/admin/master-data/finance-basics/${financeReferencePaths[entity]}/record/${receipt.id}?mode=edit`;
   let failed=false;const effect=(fn:()=>void)=>{if(current())try{fn();}catch{failed=true;}};
   effect(()=>toast.success(receipt.changed===false?'No changes to save':pending.id===null?`${n.label} created`:`${n.label} updated`));
   const tab=navigation.activeTab;
   if(tab){effect(()=>navigation.markDirty(tab.id,!unchanged));effect(()=>navigation.updateTabRoute(tab.id,route,receipt.id,'edit'));effect(()=>navigation.renameTab(tab.id,String(submitted[n.name]),String(submitted[n.code])));}
   effect(()=>invalidations[entity](queryClient));
   if(closeAfter&&unchanged&&tab)effect(()=>navigation.closeTab(tab.id,{force:true}));
   else if(pending.id===null&&tab)effect(()=>{if(navigation.isTabActive(tab.id))router.replace(route);});
   if(failed&&current()){setLocalBlocked(true);notify('Record saved, but its display could not refresh. Reopen the saved record; do not submit another create.');}
   return true;
  }catch{
   if(!current())return confirmed;
   if(confirmed){setLocalBlocked(true);session.setUncertain(false);notify('Record saved, but local recovery could not finish. Reopen the saved record before continuing.');return true;}
   if(rejected){setLocalBlocked(true);notify('The request was rejected, but local recovery could not finish. Reopen the record.');return false;}
   if(dispatched||recovering)session.setUncertain(true);
   notify('The retained request could not be verified or its result is unconfirmed. Reopen and reconcile before another change.');return false;
  }finally{admission.leave();if(current())setBusy(false);}
 };
 const disabled=viewing||busy||session.uncertain||localBlocked||!!session.recoveryError;
 const render=(f:ReferenceField)=>{
  const value=String(form[f.key]??'');let control;
  if(f.kind==='boolean')control=<div className="flex items-center gap-2"><Checkbox id={f.key} name={f.key} checked={form[f.key]===true} onCheckedChange={v=>set(f.key,v===true)} disabled={disabled}/><Label htmlFor={f.key}>{f.label}</Label></div>;
  else if(f.kind==='country')control=<CountrySelect name={f.key} value={value?Number(value):null} onValueChange={v=>set(f.key,v==null?'':String(v))} disabled={disabled} includeInactive={!!record} allowClear showCode/>;
  else if(f.kind==='lookup')control=<LookupSelect name={f.key} ariaLabel={f.label} categoryCode={f.category!} valueField="code" value={value||null} onValueChange={v=>set(f.key,v==null?'':String(v))} disabled={disabled} includeInactive={!!record} required={f.required} allowClear={!f.required} showCode/>;
  else if(f.kind==='textarea')control=<Textarea id={f.key} name={f.key} value={value} onChange={e=>set(f.key,e.target.value)} disabled={disabled} maxLength={f.max} dir={f.key.endsWith('_ar')?'rtl':undefined} rows={3}/>;
  else control=<Input id={f.key} name={f.key} value={value} onChange={e=>set(f.key,e.target.value)} disabled={disabled||(f.immutable&&editing)} required={f.required} maxLength={f.max} dir={f.key.endsWith('_ar')?'rtl':undefined} type={f.kind==='number'?'number':f.kind==='date'?'date':f.kind==='email'?'email':f.kind==='url'?'url':'text'} min={f.kind==='number'?0:undefined} max={f.kind==='number'?(f.step&&f.step<1?100:2147483647):undefined} step={f.step}/>;
  return <div className="space-y-2" key={f.key}>{f.kind!=='boolean'&&(f.required?<RequiredLabel htmlFor={f.key}>{f.label}</RequiredLabel>:<Label htmlFor={f.key}>{f.label}</Label>)}{control}</div>;
 };
 return <ERPRecordWorkspaceForm mode={viewing?'view':editing?'edit':'add'} title={`${viewing?'View':editing?'Edit':'New'} ${n.label}`} subtitle="Shared finance catalogue" recordCode={editing?String(form[n.code]):undefined} sections={sections} activeSection={activeSection} onSectionChange={setActiveSection} isDirty={isDirty} isSubmitting={busy} onSave={viewing||localBlocked||!!session.recoveryError?undefined:()=>save()} onSaveAndClose={viewing||localBlocked||!!session.recoveryError?undefined:()=>save(true)} onRequestClose={()=>navigation.closeTab(navigation.activeTab?.id??'')}>
  <form id={formId} noValidate onSubmit={e=>{e.preventDefault();void save();}}>
   <button type="submit" hidden tabIndex={-1} aria-hidden="true" disabled={disabled}>Save record</button>
   {message&&<p role="status">{message}</p>}{session.recoveryError&&<p role="alert">{session.recoveryError}</p>}
   <DraftRestoredNotice visible={!viewing&&restoredFromDraft}/>
   {viewing&&<p role="status">{locked?'This record is locked. Ask an authorized administrator to unlock it.':!permissions.manage?'Read only. Changes require global finance catalogue management permission.':'This record is open in view mode.'}</p>}
   {session.uncertain&&!session.recoveryError&&<div role="status"><p>The last save is unconfirmed. The original submitted values and save identity are retained.</p><Button type="button" disabled={busy||viewing||localBlocked} onClick={()=>void save()}>Recover original request</Button></div>}
   {sections.filter(s=>s.id!=='audit').map(s=><ERPRecordSectionPanel key={s.id} id={s.id} activeId={activeSection} title={s.label}><div className="grid grid-cols-1 gap-4 md:grid-cols-2">{fields.filter(f=>(f.section??'basic')===s.id).map(render)}</div></ERPRecordSectionPanel>)}
   <ERPRecordSectionPanel id="audit" activeId={activeSection} title="Audit Information" lazyMount>{record?<div className="grid grid-cols-1 gap-4 md:grid-cols-2"><div><Label>Created At</Label><Input aria-label="Created At" value={new Date(record.created_at).toLocaleString()} disabled/></div><div><Label>Updated At (when opened)</Label><Input aria-label="Updated At (when opened)" value={new Date(record.updated_at).toLocaleString()} disabled/></div></div>:<p>Save and reopen to view persisted audit details.</p>}</ERPRecordSectionPanel>
  </form>
 </ERPRecordWorkspaceForm>;
}
