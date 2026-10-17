'use client';
import {isFinanceSystemAdmin} from '@/lib/master-data/finance-reference-contract';

import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {useQueryClient} from '@tanstack/react-query';
import {toast} from 'sonner';
import {MapPin,Info,Shield} from 'lucide-react';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Checkbox} from '@/components/ui/checkbox';
import {CostCenterSelect,ProfitCenterSelect} from '@/components/erp/finance-basics';
import {OwnerCompanySelect,BranchSelect} from '@/components/erp/organizations';
import {Textarea} from '@/components/ui/textarea';
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
import {hasGlobalPermission} from '@/lib/rbac/scope';
import type {AuthContext} from '@/lib/rbac/check';
import {invalidateCostCenters,invalidateProfitCenters} from '@/lib/query/invalidation';
import {financeCenterPaths,financeCenterSaveReceiptSchema,type FinanceCenterEntity} from '@/lib/master-data/finance-center-save-contract';
import type {WorkspaceSaveContract,WorkspaceSaveReceipt} from '@/lib/workspace/save-contract';
import {savedSelection} from '@/lib/master-data/saved-selection';
import {centerFields,centerNames,centerDraftCodec,centerFormPayload,centerFormState,type CenterField,type CenterRecord} from '../center-form-state';
import * as schema from '../validation';
import * as actions from '../actions';

type Props={entity:FinanceCenterEntity;record?:CenterRecord|null;mode:'add'|'edit'|'view';authContext:AuthContext};
const createSchemas={cost_centers:schema.createCostCenterSchema,profit_centers:schema.createProfitCenterSchema};
const updateSchemas={cost_centers:schema.updateCostCenterSchema,profit_centers:schema.updateProfitCenterSchema};
const invalidations={cost_centers:invalidateCostCenters,profit_centers:invalidateProfitCenters};
function save(entity:FinanceCenterEntity,id:number|null,payload:Record<string,unknown>,contract:WorkspaceSaveContract){
 return entity==='cost_centers'?
  (id===null?actions.createCostCenter(schema.createCostCenterSchema.parse(payload),contract):actions.updateCostCenter(schema.updateCostCenterSchema.parse({id,...payload}),contract)):
  (id===null?actions.createProfitCenter(schema.createProfitCenterSchema.parse(payload),contract):actions.updateProfitCenter(schema.updateProfitCenterSchema.parse({id,...payload}),contract));
}

/** F06-specific form adapter; uses the existing F04 workspace and F05 controls. */
export function FinanceCenterWorkspaceForm(props:Props){
 return <FinanceCenterFormSession key={`${props.authContext.profile?.id??'none'}:${props.entity}:${props.record?.id??'new'}:${props.mode}`} {...props}/>;
}
function FinanceCenterFormSession({entity,record,mode,authContext}:Props){
 const names=centerNames[entity],formId=names.prefix+'-workspace-form',fields=centerFields(entity),prefix=entity==='cost_centers'?'cost':'profit';
 const navigation=useWorkspaceFormNavigation(),router=useRouter(),queryClient=useQueryClient();
 const {activeTab,markDirty}=navigation;
 const [admission]=useState(createSaveAdmission),[isSubmitting,setSubmitting]=useState(false);
 const session=useWorkspaceSaveSession(formId,record?.id??null,record?.workspace_revision),id=useRef(session.id);
 const [savedId,setSavedId]=useState(session.id),[uncertain,setUncertain]=useState(false);
 const locked=record?.is_locked===true&&!isFinanceSystemAdmin(authContext);
 const viewing=mode==='view'||!hasGlobalPermission(authContext,'master_data.finance_basics.manage')||locked;
 const editing=savedId!==null;
 const sections=[{id:'basic',label:'Basic information',icon:MapPin},{id:'org',label:'Organization',icon:Info},{id:'status',label:'Status',icon:Shield},{id:'audit',label:'Audit information',icon:Info}];
 const [activeSection,setActiveSection]=useWorkspaceFormSection(formId,'basic',sections.map(s=>s.id));
 const {value:form,setValue:setForm,isDirty,acceptSaved,getCurrent,restoredFromDraft}=useWorkspaceControlledDraft({formId,initialValue:centerFormState(entity,record),codec:centerDraftCodec,enabled:!viewing});
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
   const wasNew=dispatchId===null,values=centerFormPayload(entity,submitted,!wasNew);
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
   const receipt=financeCenterSaveReceiptSchema.safeParse(result.data);
   if(!receipt.success||(dispatchId!==null&&receipt.data.id!==dispatchId))throw Error('Incomplete receipt');
   confirmed=true;
   if(!current())return true;
   id.current=receipt.data.id;setSavedId(receipt.data.id);setUncertain(false);
   recovery.accept(receipt.data);
   const unchanged=acceptSaved(submitted),route=`/admin/master-data/finance-basics/${financeCenterPaths[entity]}/record/${receipt.data.id}?mode=edit`;
   let displayFailed=false;
   const display=(effect:()=>void)=>{if(current())try{effect();}catch{displayFailed=true;}};
   display(()=>toast.success(receipt.data.changed===false?'No changes to save':wasNew?'Record created':'Record updated'));
   const tab=navigation.activeTab;
   if(tab){display(()=>navigation.markDirty(tab.id,!unchanged));display(()=>navigation.updateTabRoute(tab.id,route,receipt.data.id,'edit'));display(()=>navigation.renameTab(tab.id,String(submitted[prefix+'_center_name_en']).trim(),String(submitted[fields[0].key]).trim().toUpperCase()));}
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
 const renderField=(f:CenterField)=>{
  const text=String(form[f.key]??''),selected=text===''?null:Number(text);
  const selection={name:f.key,value:selected,disabled,required:f.required,includeInactive:!!record,showCode:true};
  let control;
  if(viewing&&['company','branch','parent','lookup'].includes(f.kind??'')){
   const parentName=record?.parent&&('cost_center_name_en' in record.parent?record.parent.cost_center_name_en:record.parent.profit_center_name_en);
   const label=f.kind==='company'?(text?record?.owner_company?.legal_name_en??'Company unavailable':'Global'):
    f.kind==='branch'?(text?record?.branch?.branch_name_en??'Branch unavailable':'All branches'):
    f.kind==='parent'?(text?parentName??'Parent unavailable':'No parent'):
    text?record?.type_label?.value_label_en??`${text} (label unavailable)`:'Not assigned';
   control=<Input id={f.key} name={f.key} value={label} disabled/>;
  }
  else if(f.kind==='boolean')control=<div className="flex items-center gap-2"><Checkbox id={f.key} name={f.key} checked={form[f.key]===true} onCheckedChange={v=>set(f.key,v===true)} disabled={disabled}/><Label htmlFor={f.key}>{f.label}</Label></div>;
  else if(f.kind==='company')control=<OwnerCompanySelect {...selection} allowClear placeholder="Leave empty for global"
   onValueChange={v=>setForm(old=>({...old,owner_company_id:v==null?'':String(v),...(old.owner_company_id!==(v==null?'':String(v))?{branch_id:'',['parent_'+prefix+'_center_id']:''}:{})}))}/>;
  else if(f.kind==='branch')control=<BranchSelect {...selection} disabled={disabled||!form.owner_company_id} allowClear ownerCompanyId={form.owner_company_id?Number(form.owner_company_id):null}
   onValueChange={v=>setForm(old=>({...old,branch_id:v==null?'':String(v),...(old.branch_id!==(v==null?'':String(v))?{['parent_'+prefix+'_center_id']:''}:{})}))}/>;
   else if(f.kind==='parent'){const Parent=entity==='cost_centers'?CostCenterSelect:ProfitCenterSelect;
    const parentName=record?.parent&&('cost_center_name_en' in record.parent?record.parent.cost_center_name_en:record.parent.profit_center_name_en);
    const parentId=record&&('parent_cost_center_id' in record?record.parent_cost_center_id:record.parent_profit_center_id);
    control=<Parent {...selection} includeInactive={false} choiceMode="finance-parent"
     parentScope={{companyId:form.owner_company_id?Number(form.owner_company_id):null,branchId:form.branch_id?Number(form.branch_id):null,excludeId:savedId}}
     savedSelection={savedSelection(parentId,parentName)} allowClear onValueChange={v=>set(f.key,v==null?'':String(v))}/>;
  }
  else if(f.kind==='textarea')control=<Textarea id={f.key} name={f.key} value={text} onChange={e=>set(f.key,e.target.value)} disabled={disabled} maxLength={f.max} dir={f.key.endsWith('_ar')?'rtl':undefined} rows={3}/>;
  else if(f.kind==='lookup')control=<LookupSelect name={f.key} categoryCode={f.category!} valueField="code" value={text||null} onValueChange={v=>set(f.key,v==null?'':String(v))} disabled={disabled} required={f.required} includeInactive={!!record} allowClear={!f.required}/>;
  else control=<Input id={f.key} name={f.key} value={text} onChange={e=>set(f.key,e.target.value)} disabled={disabled||(f.immutable&&editing)} required={f.required} maxLength={f.max} minLength={f.key===prefix+'_center_name_en'?2:undefined} dir={f.key.endsWith('_ar')?'rtl':undefined} type={f.kind==='number'?'number':'text'} min={f.kind==='number'?0:undefined} max={f.kind==='number'?2147483647:undefined} step={f.kind==='number'?1:undefined}/>;
  return <div className="space-y-2" key={f.key}>{f.kind!=='boolean'&&(f.required?<RequiredLabel htmlFor={f.key}>{f.label}</RequiredLabel>:<Label htmlFor={f.key}>{f.label}</Label>)}{control}</div>;
 };
 return <ERPRecordWorkspaceForm mode={viewing?'view':editing?'edit':'add'} title={`${viewing?'View':editing?'Edit':'New'} ${names.label}`} subtitle="Finance catalogue · company and branch references are validated on save" recordCode={editing?String(form[fields[0].key]):undefined}
  sections={sections} activeSection={activeSection} onSectionChange={setActiveSection} isDirty={isDirty} isSubmitting={isSubmitting}
  onSave={viewing||recovery.stopped?undefined:()=>handleSave()} onSaveAndClose={viewing||recovery.stopped?undefined:()=>handleSave(true)} onRequestClose={()=>navigation.closeTab(navigation.activeTab?.id??'')}>
  <form id={formId} onSubmit={e=>{e.preventDefault();void handleSave();}}>
   {recoveryStatus&&<p role="status">{recoveryStatus}</p>}
   <DraftRestoredNotice visible={!viewing&&restoredFromDraft}/>
   {viewing&&!locked&&<p role="status" className="mb-4 text-sm text-muted-foreground">Read only. Changes require global finance catalogue management permission.</p>}
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
