'use client';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {useQueryClient} from '@tanstack/react-query';
import {toast} from 'sonner';
import {MapPin,Info,Shield} from 'lucide-react';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Checkbox} from '@/components/ui/checkbox';
import {UomCategorySelect} from '@/components/erp/uom/uom-category-select';
import {UnitOfMeasureSelect} from '@/components/erp/uom/unit-of-measure-select';
import {Textarea} from '@/components/ui/textarea';
import {ERPCombobox} from '@/components/erp/combobox';
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
import {invalidateUom} from '@/lib/query/invalidation';
import {uomPaths,uomSaveReceiptSchema,type UomEntity} from '@/lib/master-data/uom-save-contract';
import type {WorkspaceSaveContract,WorkspaceSaveReceipt} from '@/lib/workspace/save-contract';
import {uomFields,uomNames,uomDraftCodec,uomFormPayload,uomFormState,type UomField,type UomRecord} from '../form-state';
import * as schema from '../validation';
import * as actions from '../actions';

type Props={entity:UomEntity;record?:UomRecord|null;mode:'add'|'edit'|'view';authContext:AuthContext;onSuccess?:()=>void};
const createSchemas={uom_categories:schema.createUomCategorySchema,units_of_measure:schema.createUnitOfMeasureSchema,uom_conversions:schema.createUomConversionSchema};
const updateSchemas={uom_categories:schema.updateUomCategorySchema,units_of_measure:schema.updateUnitOfMeasureSchema,uom_conversions:schema.updateUomConversionSchema};
function save(entity:UomEntity,id:number|null,payload:Record<string,unknown>,contract:WorkspaceSaveContract){
 if(entity==='uom_categories')return id===null?actions.createUomCategory(schema.createUomCategorySchema.parse(payload),contract):actions.updateUomCategory(schema.updateUomCategorySchema.parse({id,...payload}),contract);
 if(entity==='units_of_measure')return id===null?actions.createUnitOfMeasure(schema.createUnitOfMeasureSchema.parse(payload),contract):actions.updateUnitOfMeasure(schema.updateUnitOfMeasureSchema.parse({id,...payload}),contract);
 return id===null?actions.createUomConversion(schema.createUomConversionSchema.parse(payload),contract):actions.updateUomConversion(schema.updateUomConversionSchema.parse({id,...payload}),contract);
}

/** F06-specific form adapter; uses the existing F04 workspace and F05 controls. */
export function UomWorkspaceForm(props:Props){
 return <UomFormSession key={`${props.authContext.profile?.id??'none'}:${props.entity}:${props.record?.id??'new'}:${props.mode}`} {...props}/>;
}
function UomFormSession({entity,record,mode,authContext,onSuccess}:Props){
 const names=uomNames[entity],formId=names.prefix+'-workspace-form',fields=uomFields(entity);
 const navigation=useWorkspaceFormNavigation(),router=useRouter(),queryClient=useQueryClient();
 const {activeTab,markDirty}=navigation;
 const [admission]=useState(createSaveAdmission),[isSubmitting,setSubmitting]=useState(false);
 const session=useWorkspaceSaveSession(formId,record?.id??null,record?.workspace_revision),id=useRef(session.id);
 const [savedId,setSavedId]=useState(session.id),[uncertain,setUncertain]=useState(false);
 const locked=record?.is_locked===true&&!hasRole(authContext,'system_admin');
 const viewing=mode==='view'||!hasGlobalPermission(authContext,'master_data.uom.manage')||locked;
 const editing=savedId!==null;
 const sections=[{id:'basic',label:'Basic information',icon:MapPin},...(entity==='units_of_measure'?[{id:'conversion',label:'Conversion',icon:Info}]:[]),{id:'status',label:'Status',icon:Shield},{id:'audit',label:'Audit information',icon:Info}];
 const [activeSection,setActiveSection]=useWorkspaceFormSection(formId,'basic',sections.map(s=>s.id));
 const {value:form,setValue:setForm,isDirty,acceptSaved,getCurrent,restoredFromDraft}=useWorkspaceControlledDraft({formId,initialValue:uomFormState(entity,record),codec:uomDraftCodec,enabled:!viewing});
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
   const wasNew=dispatchId===null,values=uomFormPayload(entity,submitted,!wasNew);
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
   const receipt=uomSaveReceiptSchema.safeParse(result.data);
   if(!receipt.success||(dispatchId!==null&&receipt.data.id!==dispatchId))throw Error('Incomplete receipt');
   confirmed=true;
   if(!current())return true;
   id.current=receipt.data.id;setSavedId(receipt.data.id);setUncertain(false);
   recovery.accept(receipt.data);
   const unchanged=acceptSaved(submitted),route=`/admin/master-data/uom/${uomPaths[entity]}/record/${receipt.data.id}?mode=edit`;
   let displayFailed=false;
   const display=(effect:()=>void)=>{if(current())try{effect();}catch{displayFailed=true;}};
   display(()=>toast.success(receipt.data.changed===false?'No changes to save':wasNew?'Record created':'Record updated'));
   const tab=navigation.activeTab;
   if(tab){display(()=>navigation.markDirty(tab.id,!unchanged));display(()=>navigation.updateTabRoute(tab.id,route,receipt.data.id,'edit'));display(()=>navigation.renameTab(tab.id,entity==='uom_conversions'?'Unit conversion':String(submitted[entity==='uom_categories'?'category_name_en':'unit_name_en']).trim()));}
   display(()=>invalidateUom(queryClient));
   display(()=>onSuccess?.());
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
 const renderField=(f:UomField)=>{
  const text=String(form[f.key]??''),selected=text===''?null:Number(text);
  const selection={name:f.key,value:selected,disabled,required:f.required,includeInactive:!!record,showCode:true};
  let control;
  if(f.kind==='boolean')control=<div className="flex items-center gap-2"><Checkbox id={f.key} name={f.key} checked={form[f.key]===true} onCheckedChange={v=>set(f.key,v===true)} disabled={disabled}/><Label htmlFor={f.key}>{f.label}</Label></div>;
  else if(f.kind==='category')control=<UomCategorySelect {...selection} disabled={disabled||editing} onValueChange={v=>set(f.key,v==null?'':String(v))}/>;
  else if(f.kind==='unit')control=<UnitOfMeasureSelect {...selection} ariaLabel={f.label} disabled={disabled||editing} onValueChange={v=>set(f.key,v==null?'':String(v))}/>;
  else if(f.kind==='rule')control=<ERPCombobox name={f.key} ariaLabel={f.label} disabled={disabled} allowClear={false} value={text||'SAME_CATEGORY'} onValueChange={v=>set(f.key,v==='SAME_CATEGORY'?'':String(v??''))} options={[
   {value:'SAME_CATEGORY',label:'Same-category conversion',description:'Not valid between different categories.'},
   {value:'FIXED_RATIO',label:'Documented fixed ratio',description:'Multiply the quantity by the factor; document the source and applicability in Notes.'},
   ...(text&&text!=='FIXED_RATIO'?[{value:text,label:`Historical rule: ${text} (review required)`,disabled:true}]:[]),
  ]}/>;
  else if(f.kind==='textarea')control=<Textarea id={f.key} name={f.key} value={text} onChange={e=>set(f.key,e.target.value)} disabled={disabled} maxLength={f.max} dir={f.key.endsWith('_ar')?'rtl':undefined} rows={3}/>;
  else control=<Input id={f.key} name={f.key} value={text} onChange={e=>set(f.key,e.target.value)} disabled={disabled||(f.immutable&&editing)} required={f.required} maxLength={f.kind==='number'?undefined:f.max} minLength={f.key==='category_name_en'?2:undefined} dir={f.key.endsWith('_ar')?'rtl':undefined} type={f.kind==='number'||f.kind==='factor'?'number':'text'} min={f.kind==='number'?0:f.kind==='factor'?0.0000000001:undefined} max={f.kind==='number'?f.max:undefined} step={f.kind==='number'?1:f.kind==='factor'?'any':undefined}/>;
  return <div className="space-y-2" key={f.key}>{f.kind!=='boolean'&&(f.required?<RequiredLabel htmlFor={f.key}>{f.label}</RequiredLabel>:<Label htmlFor={f.key}>{f.label}</Label>)}{control}</div>;
 };
 return <ERPRecordWorkspaceForm mode={viewing?'view':editing?'edit':'add'} title={`${viewing?'View':editing?'Edit':'New'} ${names.label}`} subtitle="Units catalogue · identities and dependencies are protected on save" recordCode={editing&&entity!=='uom_conversions'?String(form[entity==='uom_categories'?'category_code':'unit_code']):undefined}
  sections={sections} activeSection={activeSection} onSectionChange={setActiveSection} isDirty={isDirty} isSubmitting={isSubmitting}
  onSave={viewing||recovery.stopped?undefined:()=>handleSave()} onSaveAndClose={viewing||recovery.stopped?undefined:()=>handleSave(true)} onRequestClose={()=>navigation.closeTab(navigation.activeTab?.id??'')}>
  <form id={formId} onSubmit={e=>{e.preventDefault();void handleSave();}}>
   {recoveryStatus&&<p role="status">{recoveryStatus}</p>}
   <DraftRestoredNotice visible={!viewing&&restoredFromDraft}/>
   {locked&&<p role="status" className="mb-4 text-sm text-muted-foreground">This record is locked. Ask an authorized administrator to unlock it before making changes.</p>}
   {uncertain&&<p role="status" className="mb-4 text-sm text-muted-foreground">The last save is unconfirmed. Click Save again to recover its result without creating another record.</p>}
   {entity==='uom_conversions'&&<p className="mb-4 text-sm text-muted-foreground">Different categories require a documented fixed ratio. In Notes, explain its source and when it applies. Use this only for a constant relationship between these units; variable density, item-specific ratios and free-text formulas are not calculated. Bidirectional means the reverse uses the reciprocal factor.</p>}
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
