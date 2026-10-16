"use client";
import {isFinanceSystemAdmin} from '@/lib/master-data/finance-reference-contract';


import {useState,useEffect,useLayoutEffect,useRef} from "react";
import {useRouter} from "next/navigation";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Checkbox} from "@/components/ui/checkbox";
import {Textarea} from "@/components/ui/textarea";
import {toast} from "sonner";
import type {Currency} from "@/features/master-data/finance-basics/types";
import {createCurrency,updateCurrency} from "@/features/master-data/finance-basics/actions";
import {createCurrencySchema} from "@/features/master-data/finance-basics/validation";
import {RequiredLabel} from "@/components/erp/required-label";
import {useQueryClient} from "@tanstack/react-query";
import {invalidateCurrencies} from "@/lib/query/invalidation";
import {Coins,Tag,Shield,Info} from "lucide-react";
import type {AuthContext} from "@/lib/rbac/check";
import {hasGlobalPermission} from "@/lib/rbac/scope";
import {useWorkspaceFormNavigation} from "@/hooks/use-workspace-form-navigation";
import {useWorkspaceFormSection} from "@/hooks/use-workspace-form-section";
import {ERPRecordWorkspaceForm,ERPRecordSectionPanel} from "@/components/workspace/erp-record-workspace-form";
import {useWorkspaceControlledDraft} from "@/hooks/use-workspace-controlled-draft";
import {useWorkspaceSaveSession} from "@/hooks/use-workspace-save-session";
import {useWorkspaceDraftStoreContext} from '@/components/workspace/workspace-draft-provider';
import {useWorkspaceFormOwner} from '@/hooks/use-workspace-form-owner';
import type {WorkspaceSaveContract,WorkspaceSaveReceipt} from '@/lib/workspace/save-contract';
import {createSaveAdmission} from "@/lib/workspace/save-admission";
import {currencyFormState,currencyDraftCodec,type CurrencyFormState} from "@/lib/master-data/currency-form-state";
import {currencySaveReceiptSchema} from "@/lib/master-data/currency-save-receipt";
import {workspaceValidationFailure,reportWorkspaceFieldErrors} from "@/lib/workspace/field-errors";
import {DraftRestoredNotice} from "@/components/workspace/draft-restored-notice";

type Props={currency?:Currency|null;mode:"add"|"edit"|"view";authContext:AuthContext};
const FORM_ID="currency-workspace-form";
const sections=[{id:"basic",label:"Basic info",icon:Coins},{id:"details",label:"Details",icon:Tag},{id:"status",label:"Status",icon:Shield},{id:"audit",label:"Audit info",icon:Info}];
export function CurrencyWorkspaceForm({currency,mode,authContext}:Props){
 const {closeTab,activeTab,markDirty,updateTabRoute,isTabActive}=useWorkspaceFormNavigation();
 const router=useRouter(),queryClient=useQueryClient();
 const [admission]=useState(createSaveAdmission);
 const session=useWorkspaceSaveSession(FORM_ID,currency?.id??null,currency?.workspace_revision);
 const id=useRef(session.id),code=useRef(currency?.currency_code??null);
 const [savedId,setSavedId]=useState(session.id);
 const [savedCode,setSavedCode]=useState(currency?.currency_code??null);
 const [isSubmitting,setIsSubmitting]=useState(false);
 const [activeSection,setActiveSection]=useWorkspaceFormSection(FORM_ID,"basic",sections.map(s=>s.id));
 const canManage=hasGlobalPermission(authContext,"master_data.finance_basics.manage");
 const locked=currency?.is_locked===true&&!isFinanceSystemAdmin(authContext);
 const isViewing=mode==="view"||!canManage||locked;
 const isEditing=savedId!==null;
 const {value:form,setValue:setForm,isDirty,acceptSaved,getCurrent,restoredFromDraft}=useWorkspaceControlledDraft({formId:FORM_ID,initialValue:currencyFormState(currency),codec:currencyDraftCodec,enabled:!isViewing});
 const field=<K extends keyof CurrencyFormState>(key:K,value:CurrencyFormState[K])=>setForm(old=>({...old,[key]:value}));
 useEffect(()=>{if(activeTab?.id)markDirty(activeTab.id,isDirty);},[activeTab?.id,isDirty,markDirty]);
 const inputId=currency?.id??null;

 // F04 owns the envelope/schema; this local witness verifies only its normalized
 // bytes and our own known transitions. No persisted key or shared API is added.
 const store=useWorkspaceDraftStoreContext(),owner=useWorkspaceFormOwner();
 const principal=authContext.profile?.id??null;
 const [recoveryStatus,setRecoveryStatus]=useState<string|null>(null);
 const [recovery]=useState(()=>{
  const key=owner? `draft:tab:${owner.id}:${FORM_ID}:save`:null;
  const scope={store,ownerId:owner?.id,principal,inputId:inputId,mode};
  let expected:string|undefined,pending=false,fingerprint:string|undefined;
  let stopped=!!session.recoveryError||(inputId!==null&&session.id!==inputId);
  let terminal:'confirmed'|'rejected'|null=null;
  let acknowledgedId:number|null=null;
  const capture=(ownWrite?:string)=>{
   const raw=key?store?.getViewState(key):ownWrite;
   if(typeof raw!=='string'||(ownWrite!==undefined&&raw!==ownWrite))throw Error('Unverified retained save');
   const value:unknown=JSON.parse(raw);
   if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Unverified retained save');
   expected=raw;pending=Object.hasOwn(value,'pending');
   fingerprint=pending?(value as {pending:{fingerprint:string}}).pending.fingerprint:undefined;
  };
  try{if(!stopped)capture(key?undefined:JSON.stringify({id:session.id,revision:currency?.workspace_revision==null?null:String(currency?.workspace_revision)}));}catch{stopped=true;}
  const witness=()=>{if(stopped||(key&&(!store||store.getViewState(key)!==expected)))throw Error('Unverified retained save');};
  return {scope,get pending(){return pending;},get stopped(){return stopped;},get terminal(){return terminal;},get acknowledgedId(){return acknowledgedId;},
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
   accept(receipt:WorkspaceSaveReceipt){witness();session.accept(receipt);capture(JSON.stringify({id:receipt.id,revision:receipt.revision}));pending=false;acknowledgedId=receipt.id;},
   rejected(){witness();session.rejected();const value=JSON.parse(expected!);delete value.pending;capture(JSON.stringify(value));},
  };
 });
 const activation=useRef<{active:boolean}|null>(null),retired=useRef(false),promoted=useRef(false);
 const flight=useRef<{lease:{active:boolean};dispatch:object}|null>(null);
 const allowed=useRef(!isViewing);
 useLayoutEffect(()=>{allowed.current=!isViewing;});
 useLayoutEffect(()=>{
  // A sound own create may be adopted by the parent without replacing this
  // unkeyed form. Promote once; a wrong ID or failed acknowledgement cannot.
  if(!recovery.stopped&&recovery.scope.inputId===null&&recovery.scope.mode==='add'&&mode==='edit'&&inputId!==null&&inputId===recovery.acknowledgedId){
   promoted.current=true;
  }
  const sameRecord=inputId===(promoted.current?recovery.acknowledgedId:recovery.scope.inputId);
  const sameMode=mode===(promoted.current?'edit':recovery.scope.mode);
  if(store!==recovery.scope.store||owner?.id!==recovery.scope.ownerId||principal!==recovery.scope.principal||!sameRecord||!sameMode)retired.current=true;
  const lease={active:!retired.current};activation.current=lease;
  return ()=>{lease.active=false;if(flight.current?.lease===lease){flight.current=null;admission.leave();}};
 },[store,owner?.id,principal,inputId,mode,recovery,admission]);
 const notify=(message:string)=>{setRecoveryStatus(message);try{toast.error(message);}catch{/* Feedback cannot change a known outcome. */}};
 const blockedMessage=()=>recovery.terminal==='confirmed'?'Record saved, but local recovery could not finish. Reopen the saved record before continuing.':
  recovery.terminal==='rejected'?'The request was rejected, but local recovery could not finish. Reopen the record before continuing.':
  'The retained save request could not be verified. Reopen and reconcile the record before another change.';
 const handleSave=async(closeAfter=false):Promise<boolean>=>{
  const lease=activation.current,current=()=>!!lease?.active&&!retired.current&&activation.current===lease;
  if(!current()||!allowed.current)return false;
  if(recovery.stopped){notify(blockedMessage());return false;}
  if(!admission.enter())return false;
  const dispatch={};flight.current={lease:lease!,dispatch};
  setIsSubmitting(true);setRecoveryStatus(null);
  const submitted=structuredClone(getCurrent()),element=document.getElementById(FORM_ID),dispatchId=id.current;
  const recovering=recovery.pending;let confirmed=false,rejected=false;
  try{
   recovery.witness();
   const parsed=createCurrencySchema.safeParse({...submitted,currency_code:code.current??submitted.currency_code.toUpperCase(),
    decimal_places:submitted.decimal_places.trim()===""?NaN:Number(submitted.decimal_places),
    sort_order:submitted.sort_order.trim()===""?NaN:Number(submitted.sort_order)});
   if(!parsed.success){
    const key=String(parsed.error.issues[0]?.path[0]??"");
    setActiveSection(["description_en","description_ar","notes","sort_order"].includes(key)?"details":"basic");
    const failure=workspaceValidationFailure(parsed.error.issues);reportWorkspaceFieldErrors(element,failure.fieldErrors);notify(failure.error);return false;
   }
   const wasNew=dispatchId===null;
   const {currency_code,...editable}=parsed.data;
   const payload=wasNew?parsed.data:editable;
   const snapshot=structuredClone(payload),contract=recovery.begin(snapshot);
   if(!current())return false;
   const result=wasNew?await createCurrency(structuredClone(parsed.data),contract):await updateCurrency({...structuredClone(editable),id:dispatchId!},contract);
   if(!result.success){
    rejected=!recovering&&!result.uncertain;
    if(!current())return false;
    recovery.witness();
    if(rejected){recovery.rejected();reportWorkspaceFieldErrors(element,result.fieldErrors);notify(result.error??'The request was rejected. Check its values.');}
    else notify('The earlier save is still unconfirmed. Retry the same submitted values.');
    return false;
   }
   const receipt=currencySaveReceiptSchema.safeParse(result.data);
   if(!receipt.success||(dispatchId!==null&&receipt.data.id!==dispatchId))throw Error('Incomplete receipt');
   confirmed=true;if(!current())return true;
   id.current=receipt.data.id;code.current=currency_code;setSavedId(receipt.data.id);setSavedCode(currency_code);
   recovery.accept(receipt.data);
   const unchanged=acceptSaved(submitted),route=`/admin/master-data/finance-basics/currencies/record/${receipt.data.id}?mode=edit`;
   let displayFailed=false;
   const display=(effect:()=>void)=>{if(current())try{effect();}catch{displayFailed=true;}};
   display(()=>toast.success(receipt.data.changed===false?'No changes to save':wasNew?'Currency created':'Currency updated'));
   if(activeTab){display(()=>markDirty(activeTab.id,!unchanged));display(()=>updateTabRoute(activeTab.id,route,receipt.data.id,'edit'));}
   display(()=>invalidateCurrencies(queryClient));
   if(closeAfter&&unchanged&&activeTab)display(()=>closeTab(activeTab.id,{force:true}));
   else if(wasNew&&activeTab)display(()=>{if(isTabActive(activeTab.id))router.replace(route);});
   if(displayFailed&&current())notify('Currency saved, but its display could not refresh. Reopen the currency list before continuing.');
   return true;
  }catch{
   if(!current())return confirmed;
   if(confirmed){recovery.stop('confirmed');notify(blockedMessage());return true;}
   if(rejected){recovery.stop('rejected');notify(blockedMessage());return false;}
   try{recovery.witness();}catch{recovery.stop();}
   notify(recovery.stopped?blockedMessage():'The previous save is unconfirmed. Restore its submitted values and retry.');
   return false;
  }finally{if(flight.current?.dispatch===dispatch){flight.current=null;admission.leave();if(current())setIsSubmitting(false);}}
 };
 return <ERPRecordWorkspaceForm mode={isViewing?"view":isEditing?"edit":"add"}
  title={isViewing?"View currency":isEditing?"Edit currency":"New currency"}
  subtitle={isEditing?`${form.currency_name_en} (${form.currency_code})`:"Create a currency for the shared catalogue"}
  recordCode={savedCode??undefined} sections={sections} activeSection={activeSection} onSectionChange={setActiveSection}
  isDirty={isDirty} onSave={isViewing||recovery.stopped?undefined:()=>handleSave()} onSaveAndClose={isViewing||recovery.stopped?undefined:()=>handleSave(true)}
  onRequestClose={()=>closeTab(activeTab?.id??"")} isSubmitting={isSubmitting}>
  <form id={FORM_ID} onSubmit={e=>{e.preventDefault();void handleSave();}}>
   {recoveryStatus&&<p role="status">{recoveryStatus}</p>}
   <DraftRestoredNotice visible={!isViewing&&restoredFromDraft}/>
   {locked&&<p role="status" className="mb-4 text-sm text-muted-foreground">This currency is locked. Ask an authorized administrator to unlock it before making changes.</p>}
   <ERPRecordSectionPanel id="basic" activeId={activeSection} title="Basic information">
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
     <div className="space-y-2"><RequiredLabel htmlFor="currency_code">Currency code (ISO 4217)</RequiredLabel>
      <Input id="currency_code" name="currency_code" required maxLength={3} value={form.currency_code} onChange={e=>field("currency_code",e.target.value)} disabled={isViewing||isEditing||isSubmitting} className="uppercase" placeholder="AED"/></div>
     <div className="space-y-2"><Label htmlFor="symbol">Symbol</Label>
      <Input id="symbol" name="symbol" maxLength={10} value={form.symbol} onChange={e=>field("symbol",e.target.value)} disabled={isViewing}/></div>
     <div className="space-y-2"><RequiredLabel htmlFor="currency_name_en">English name</RequiredLabel>
      <Input id="currency_name_en" name="currency_name_en" required minLength={2} maxLength={255} value={form.currency_name_en} onChange={e=>field("currency_name_en",e.target.value)} disabled={isViewing}/></div>
     <div className="space-y-2"><Label htmlFor="currency_name_ar">Arabic name</Label>
      <Input id="currency_name_ar" name="currency_name_ar" maxLength={255} dir="rtl" value={form.currency_name_ar} onChange={e=>field("currency_name_ar",e.target.value)} disabled={isViewing}/></div>
     <div className="space-y-2"><RequiredLabel htmlFor="decimal_places">Decimal places</RequiredLabel>
      <Input id="decimal_places" name="decimal_places" type="number" min={0} max={4} step={1} required value={form.decimal_places} onChange={e=>field("decimal_places",e.target.value)} disabled={isViewing}/></div>
     <div className="space-y-2"><div className="flex items-center gap-2">
      <Checkbox id="is_base_currency" name="is_base_currency" checked={form.is_base_currency} onCheckedChange={v=>field("is_base_currency",v===true)} disabled={isViewing}/>
      <Label htmlFor="is_base_currency">Base currency</Label></div>
      <p className="text-xs text-muted-foreground">Only one base currency can be designated. Saving never replaces another currency automatically.</p></div>
    </div>
   </ERPRecordSectionPanel>
   <ERPRecordSectionPanel id="details" activeId={activeSection} title="Descriptions and notes">
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
     {([{key:"description_en",label:"Description (English)",max:1000},{key:"description_ar",label:"Description (Arabic)",max:1000},{key:"notes",label:"Notes",max:2000}] as const).map(f=>
      <div className={f.key==="notes"?"space-y-2 md:col-span-2":"space-y-2"} key={f.key}><Label htmlFor={f.key}>{f.label}</Label>
       <Textarea id={f.key} name={f.key} maxLength={f.max} dir={f.key==="description_ar"?"rtl":undefined} value={form[f.key]} onChange={e=>field(f.key,e.target.value)} disabled={isViewing} rows={3}/></div>)}
     <div className="space-y-2"><RequiredLabel htmlFor="sort_order">Sort order</RequiredLabel>
      <Input id="sort_order" name="sort_order" type="number" min={0} max={2147483647} step={1} required value={form.sort_order} onChange={e=>field("sort_order",e.target.value)} disabled={isViewing}/></div>
    </div>
   </ERPRecordSectionPanel>
   <ERPRecordSectionPanel id="status" activeId={activeSection} title="Status">
    <div className="flex items-center gap-2"><Checkbox id="is_active" name="is_active" checked={form.is_active} onCheckedChange={v=>field("is_active",v===true)} disabled={isViewing}/><Label htmlFor="is_active">Active</Label></div>
    <p className="mt-2 text-sm text-muted-foreground">Inactive currencies remain available in existing records and history. They are not offered for new selections.</p>
   </ERPRecordSectionPanel>
   <ERPRecordSectionPanel id="audit" activeId={activeSection} title="Audit information" lazyMount>
    {currency?<div className="grid grid-cols-1 gap-4 md:grid-cols-2">{([{key:"created_at",label:"Created at"},{key:"updated_at",label:"Updated at"}] as const).map(f=><div className="space-y-2" key={f.key}><Label htmlFor={f.key}>{f.label}</Label><Input id={f.key} value={currency[f.key]?new Date(currency[f.key]).toLocaleString():"Unavailable"} disabled/></div>)}</div>:
     <p className="text-sm text-muted-foreground">{isEditing?"Open this saved record again to view its audit timestamps.":"Audit information will be available after saving."}</p>}
   </ERPRecordSectionPanel>
  </form>
 </ERPRecordWorkspaceForm>;
}
