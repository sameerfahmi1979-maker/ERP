'use client';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {useQueryClient} from '@tanstack/react-query';
import {toast} from 'sonner';
import {MapPin,Info,Shield} from 'lucide-react';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Checkbox} from '@/components/ui/checkbox';
import {CountrySelect,EmirateSelect,CitySelect} from '@/components/erp/geography';
import {LookupSelect} from '@/components/erp/lookup-select';
import {RequiredLabel} from '@/components/erp/required-label';
import {ERPRecordWorkspaceForm,ERPRecordSectionPanel} from '@/components/workspace/erp-record-workspace-form';
import {DraftRestoredNotice} from '@/components/workspace/draft-restored-notice';
import {useWorkspaceFormNavigation} from '@/hooks/use-workspace-form-navigation';
import {useWorkspaceFormSection} from '@/hooks/use-workspace-form-section';
import {useWorkspaceControlledDraft} from '@/hooks/use-workspace-controlled-draft';
import {useWorkspaceSaveSession} from '@/hooks/use-workspace-save-session';
import {useWorkspaceDraftStoreContext} from '@/components/workspace/workspace-draft-provider';
import {useWorkspaceFormOwner} from '@/hooks/use-workspace-form-owner';
import {createSaveAdmission} from '@/lib/workspace/save-admission';
import {reportWorkspaceFieldErrors,workspaceValidationFailure} from '@/lib/workspace/field-errors';
import {hasGlobalPermission,hasRole} from '@/lib/rbac/scope';
import type {AuthContext} from '@/lib/rbac/check';
import {invalidateCountries,invalidateEmirates,invalidateCities,invalidateAreas,invalidatePorts} from '@/lib/query/invalidation';
import {geographyPaths,geographySaveReceiptSchema,type GeographyEntity} from '@/lib/master-data/geography-save-contract';
import type {WorkspaceSaveContract,WorkspaceSaveReceipt} from '@/lib/workspace/save-contract';
import {geographyFields,geographyFormNames,geographyDraftCodec,geographyFormPayload,geographyFormState,type GeographyField,type GeographyRecord} from '../form-state';
import * as schema from '../validation';
import * as actions from '../actions';

type Props={entity:GeographyEntity;record?:GeographyRecord|null;mode:'add'|'edit'|'view';authContext:AuthContext};
const createSchemas={countries:schema.createCountrySchema,emirates:schema.createEmirateSchema,cities:schema.createCitySchema,areas_zones:schema.createAreaZoneSchema,ports:schema.createPortSchema};
const updateSchemas={countries:schema.updateCountrySchema,emirates:schema.updateEmirateSchema,cities:schema.updateCitySchema,areas_zones:schema.updateAreaZoneSchema,ports:schema.updatePortSchema};
const invalidations={countries:invalidateCountries,emirates:invalidateEmirates,cities:invalidateCities,areas_zones:invalidateAreas,ports:invalidatePorts};
function save(entity:GeographyEntity,id:number|null,payload:Record<string,unknown>,contract:WorkspaceSaveContract){
 switch(entity){
  case 'countries':return id===null?actions.createCountry(schema.createCountrySchema.parse(payload),contract):actions.updateCountry(schema.updateCountrySchema.parse({id,...payload}),contract);
  case 'emirates':return id===null?actions.createEmirate(schema.createEmirateSchema.parse(payload),contract):actions.updateEmirate(schema.updateEmirateSchema.parse({id,...payload}),contract);
  case 'cities':return id===null?actions.createCity(schema.createCitySchema.parse(payload),contract):actions.updateCity(schema.updateCitySchema.parse({id,...payload}),contract);
  case 'areas_zones':return id===null?actions.createAreaZone(schema.createAreaZoneSchema.parse(payload),contract):actions.updateAreaZone(schema.updateAreaZoneSchema.parse({id,...payload}),contract);
  case 'ports':return id===null?actions.createPort(schema.createPortSchema.parse(payload),contract):actions.updatePort(schema.updatePortSchema.parse({id,...payload}),contract);
 }
}

/** F06-specific form adapter; uses the existing F04 workspace and F05 controls. */
export function GeographyWorkspaceForm(props:Props){
 return <GeographyFormSession key={`${props.authContext.profile?.id??'none'}:${props.entity}:${props.record?.id??'new'}:${props.mode}`} {...props}/>;
}
function GeographyFormSession({entity,record,mode,authContext}:Props){
 const names=geographyFormNames[entity],formId=names.prefix+'-workspace-form',fields=geographyFields[entity];
 const navigation=useWorkspaceFormNavigation(),router=useRouter(),queryClient=useQueryClient();
 const {activeTab,markDirty}=navigation;
 const [admission]=useState(createSaveAdmission),[isSubmitting,setSubmitting]=useState(false);
 const session=useWorkspaceSaveSession(formId,record?.id??null,record?.workspace_revision),id=useRef(session.id);
 const [savedId,setSavedId]=useState(session.id),[uncertain,setUncertain]=useState(false);
 const locked=record?.is_locked===true&&!hasRole(authContext,'system_admin');
 const viewing=mode==='view'||!hasGlobalPermission(authContext,'master_data.geography.manage')||locked;
 const editing=savedId!==null;
 const sections=[{id:'basic',label:'Basic information',icon:MapPin},...(fields.some(f=>f.section==='details')?[{id:'details',label:'Details',icon:Info}]:[]),{id:'status',label:'Status',icon:Shield},{id:'audit',label:'Audit information',icon:Info}];
 const [activeSection,setActiveSection]=useWorkspaceFormSection(formId,'basic',sections.map(s=>s.id));
 const {value:form,setValue:setForm,isDirty,acceptSaved,getCurrent,restoredFromDraft}=useWorkspaceControlledDraft({formId,initialValue:geographyFormState(entity,record),codec:geographyDraftCodec,enabled:!viewing});
 const set=(key:string,value:string|boolean)=>setForm(old=>({...old,[key]:value}));
 useEffect(()=>{if(activeTab?.id)markDirty(activeTab.id,isDirty);},[activeTab?.id,markDirty,isDirty]);
 const inputId=record?.id??null;

 // F04 owns the envelope/schema; this local witness verifies only its normalized
 // bytes and our own known transitions. No persisted key or shared API is added.
 const store=useWorkspaceDraftStoreContext(),owner=useWorkspaceFormOwner();
 const principal=authContext.profile?.id??null;
 const [recoveryStatus,setRecoveryStatus]=useState<string|null>(null);
 const [recovery]=useState(()=>{
  const key=owner? `draft:tab:${owner.id}:${formId}:save`:null;
  const scope={store,ownerId:owner?.id,principal,inputId:inputId,mode};
  let expected:string|undefined,pending=false,fingerprint:string|undefined;
  let stopped=!!session.recoveryError||(inputId!==null&&session.id!==inputId);
  let terminal:'confirmed'|'rejected'|null=null;
  const capture=(ownWrite?:string)=>{
   const raw=key?store?.getViewState(key):ownWrite;
   if(typeof raw!=='string'||(ownWrite!==undefined&&raw!==ownWrite))throw Error('Unverified retained save');
   const value:unknown=JSON.parse(raw);
   if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Unverified retained save');
   expected=raw;pending=Object.hasOwn(value,'pending');
   fingerprint=pending?(value as {pending:{fingerprint:string}}).pending.fingerprint:undefined;
  };
  try{if(!stopped)capture(key?undefined:JSON.stringify({id:session.id,revision:record?.workspace_revision==null?null:String(record?.workspace_revision)}));}catch{stopped=true;}
  const witness=()=>{if(stopped||(key&&(!store||store.getViewState(key)!==expected)))throw Error('Unverified retained save');};
  return {scope,get pending(){return pending;},get stopped(){return stopped;},get terminal(){return terminal;},
   stop(outcome:'confirmed'|'rejected'|null=null){stopped=true;if(outcome)terminal=outcome;},
   witness,
   begin(payload:unknown){
    witness();const exact=pending&&fingerprint===JSON.stringify(payload),recovering=pending;
    let contract:WorkspaceSaveContract;
    try{contract={...session.begin(payload)};}catch{
     try{witness();if(!recovering||exact)stopped=true;}catch{stopped=true;}
     throw Error('The previous save is unconfirmed. Restore its submitted values and retry.');
    }
    try{capture(JSON.stringify({...JSON.parse(expected!),pending:{fingerprint:JSON.stringify(payload),contract}}));}catch{stopped=true;throw Error('Unverified pending write');}
    return contract;
   },
   accept(receipt:WorkspaceSaveReceipt){witness();session.accept(receipt);capture(JSON.stringify({id:receipt.id,revision:receipt.revision}));pending=false;},
   rejected(){witness();session.rejected();const value=JSON.parse(expected!);delete value.pending;capture(JSON.stringify(value));},
  };
 });
 const activation=useRef<{active:boolean}|null>(null),retired=useRef(false);
 const flight=useRef<{lease:{active:boolean};dispatch:object}|null>(null);
 const allowed=useRef(!viewing);
 useLayoutEffect(()=>{allowed.current=!viewing;});
 useLayoutEffect(()=>{
  if(store!==recovery.scope.store||owner?.id!==recovery.scope.ownerId||principal!==recovery.scope.principal||inputId!==recovery.scope.inputId||mode!==recovery.scope.mode)retired.current=true;
  const lease={active:!retired.current};activation.current=lease;
  return ()=>{lease.active=false;if(flight.current?.lease===lease){flight.current=null;admission.leave();}};
 },[store,owner?.id,principal,inputId,mode,recovery,admission]);
 const notify=(message:string)=>{setRecoveryStatus(message);try{toast.error(message);}catch{/* Feedback cannot change a known outcome. */}};
 const blockedMessage=()=>recovery.terminal==='confirmed'?'Record saved, but local recovery could not finish. Reopen the saved record before continuing.':
  recovery.terminal==='rejected'?'The request was rejected, but local recovery could not finish. Reopen the record before continuing.':
  'The retained save request could not be verified. Reopen and reconcile the record before another change.';
 const handleSave=async(closeAfter=false)=>{
  const lease=activation.current,current=()=>!!lease?.active&&!retired.current&&activation.current===lease;
  if(!current()||!allowed.current)return false;
  if(recovery.stopped){notify(blockedMessage());return false;}
  if(!admission.enter())return false;
  const dispatch={};flight.current={lease:lease!,dispatch};
  setSubmitting(true);setRecoveryStatus(null);
  const submitted=structuredClone(getCurrent()),element=document.getElementById(formId),dispatchId=id.current;
  const recovering=recovery.pending;let dispatched=false,confirmed=false,rejected=false;
  try{
   recovery.witness();
   const wasNew=dispatchId===null,values=geographyFormPayload(entity,submitted,!wasNew);
   const parsed=(wasNew?createSchemas[entity]:updateSchemas[entity]).safeParse(wasNew?values:{id:dispatchId,...values});
   if(!parsed.success){const key=String(parsed.error.issues[0]?.path[0]??'');setActiveSection(fields.find(f=>f.key===key)?.section??'basic');
    const failure=workspaceValidationFailure(parsed.error.issues);reportWorkspaceFieldErrors(element,failure.fieldErrors);notify(failure.error);return false;}
   const payload=structuredClone(values),contract=recovery.begin(payload);
   if(!current())return false;
   dispatched=true;const result=await save(entity,dispatchId,payload,contract);
   if(!result.success){
    rejected=!recovering&&!result.uncertain;
    if(!current())return false;
    recovery.witness();
    if(rejected){recovery.rejected();setUncertain(false);reportWorkspaceFieldErrors(element,result.fieldErrors);notify(result.error??'The request was rejected. Check its values.');}
    else{setUncertain(true);notify('The earlier save is still unconfirmed. Retry the same submitted values.');}
    return false;
   }
   const receipt=geographySaveReceiptSchema.safeParse(result.data);
   if(!receipt.success||(dispatchId!==null&&receipt.data.id!==dispatchId))throw Error('Incomplete receipt');
   confirmed=true;
   if(!current())return true;
   id.current=receipt.data.id;setSavedId(receipt.data.id);setUncertain(false);
   recovery.accept(receipt.data);
   const unchanged=acceptSaved(submitted),route=`/admin/master-data/geography/${geographyPaths[entity]}/record/${receipt.data.id}?mode=edit`;
   let displayFailed=false;
   const display=(effect:()=>void)=>{if(current())try{effect();}catch{displayFailed=true;}};
   display(()=>toast.success(receipt.data.changed===false?'No changes to save':wasNew?'Record created':'Record updated'));
   const tab=navigation.activeTab;
   if(tab){display(()=>navigation.markDirty(tab.id,!unchanged));display(()=>navigation.updateTabRoute(tab.id,route,receipt.data.id,'edit'));display(()=>navigation.renameTab(tab.id,String(submitted.name_en).trim(),String(submitted[fields[0].key]).trim().toUpperCase()));}
   display(()=>invalidations[entity](queryClient));
   if(closeAfter&&unchanged&&tab)display(()=>navigation.closeTab(tab.id,{force:true}));
   else if(wasNew&&tab)display(()=>{if(navigation.isTabActive(tab.id))router.replace(route);});
   if(displayFailed&&current())notify('Record saved, but its display could not refresh. Reopen the list before continuing.');
   return true;
  }catch{
   if(!current())return confirmed;
   if(confirmed){recovery.stop('confirmed');notify(blockedMessage());return true;}
   if(rejected){recovery.stop('rejected');setUncertain(false);notify(blockedMessage());return false;}
   try{recovery.witness();}catch{recovery.stop();}
   if(dispatched||recovering)setUncertain(true);
   notify(recovery.stopped?blockedMessage():'The previous save is unconfirmed. Restore its submitted values and retry.');
   return false;
  }finally{if(flight.current?.dispatch===dispatch){flight.current=null;admission.leave();if(current())setSubmitting(false);}}
 };
 const disabled=viewing||recovery.stopped||isSubmitting||uncertain;
 const renderField=(f:GeographyField)=>{
  const text=String(form[f.key]??''),selected=text===''?null:Number(text);
  const selection={name:f.key,value:selected,disabled,required:f.required,includeInactive:!!record,showCode:true};
  let control;
  if(f.kind==='boolean')control=<div className="flex items-center gap-2"><Checkbox id={f.key} name={f.key} checked={form[f.key]===true} onCheckedChange={v=>set(f.key,v===true)} disabled={disabled}/><Label htmlFor={f.key}>{f.label}</Label></div>;
  else if(f.kind==='country')control=<CountrySelect {...selection} allowClear onValueChange={v=>setForm(old=>({...old,country_id:v==null?'':String(v),...(old.country_id!==(v==null?'':String(v))&&'emirate_id'in old?{emirate_id:''}:{})}))}/>;
  else if(f.kind==='region')control=<EmirateSelect {...selection} countryId={form.country_id?Number(form.country_id):undefined} onValueChange={v=>set(f.key,v==null?'':String(v))}/>;
  else if(f.kind==='city')control=<CitySelect {...selection} onValueChange={v=>set(f.key,v==null?'':String(v))}/>;
  else if(f.kind==='lookup')control=<LookupSelect name={f.key} categoryCode={f.category!} value={text||null} onValueChange={v=>set(f.key,v==null?'':String(v))} disabled={disabled} required={f.required} includeInactive={!!record} allowClear={!f.required}/>;
  else control=<Input id={f.key} name={f.key} value={text} onChange={e=>set(f.key,e.target.value)} disabled={disabled||(f.immutable&&editing)} required={f.required} maxLength={f.max} minLength={f.key==='name_en'||f.key==='nationality_en'?2:undefined} dir={f.key.endsWith('_ar')?'rtl':undefined} type={f.kind==='number'?'number':'text'} min={f.kind==='number'?0:undefined} max={f.kind==='number'?2147483647:undefined} step={f.kind==='number'?1:undefined}/>;
  return <div className="space-y-2" key={f.key}>{f.kind!=='boolean'&&(f.required?<RequiredLabel htmlFor={f.key}>{f.label}</RequiredLabel>:<Label htmlFor={f.key}>{f.label}</Label>)}{control}</div>;
 };
 return <ERPRecordWorkspaceForm mode={viewing?'view':editing?'edit':'add'} title={`${viewing?'View':editing?'Edit':'New'} ${names.label}`} subtitle="Shared geography catalogue" recordCode={editing?String(form[fields[0].key]):undefined}
  sections={sections} activeSection={activeSection} onSectionChange={setActiveSection} isDirty={isDirty} isSubmitting={isSubmitting}
  onSave={viewing||recovery.stopped?undefined:()=>handleSave()} onSaveAndClose={viewing||recovery.stopped?undefined:()=>handleSave(true)} onRequestClose={()=>navigation.closeTab(navigation.activeTab?.id??'')}>
  <form id={formId} onSubmit={e=>{e.preventDefault();void handleSave();}}>
   {recoveryStatus&&<p role="status">{recoveryStatus}</p>}
   <DraftRestoredNotice visible={!viewing&&restoredFromDraft}/>
   {locked&&<p role="status" className="mb-4 text-sm text-muted-foreground">This record is locked. Ask an authorized administrator to unlock it before making changes.</p>}
   {uncertain&&<p role="status" className="mb-4 text-sm text-muted-foreground">The last save is unconfirmed. Click Save again to recover its result without creating another record.</p>}
   {sections.filter(s=>s.id!=='audit').map(section=><ERPRecordSectionPanel key={section.id} id={section.id} activeId={activeSection} title={section.label}>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{fields.filter(f=>(f.section??'basic')===section.id).map(renderField)}</div>
   </ERPRecordSectionPanel>)}
   <ERPRecordSectionPanel id="audit" activeId={activeSection} title="Audit information" lazyMount>{record?<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
    <div><Label>Created at</Label><Input aria-label="Created at" value={new Date(record.created_at).toLocaleString()} disabled/></div>
    <div><Label>Updated at (when opened)</Label><Input aria-label="Updated at (when opened)" value={new Date(record.updated_at).toLocaleString()} disabled/></div>
   </div>:<p className="text-sm text-muted-foreground">Save and reopen this record to view its persisted audit details.</p>}</ERPRecordSectionPanel>
  </form>
 </ERPRecordWorkspaceForm>;
}
