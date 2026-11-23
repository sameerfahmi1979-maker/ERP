'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Select} from '@fluentui/react-components';
import type {ColumnDef} from '@tanstack/react-table';
import {ERPPageHeader} from '@/components/erp/page-header';
import {ERPDataTable} from '@/components/erp/table/erp-data-table';
import {ERPChildDialogForm} from '@/components/erp/erp-child-dialog-form';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Textarea} from '@/components/ui/textarea';
import {Switch} from '@/components/ui/switch';
import {toast} from 'sonner';
import {readJson} from '@/lib/reads/client';
import type {ActionResult} from '@/server/actions/hr/settings';
import {hrSpecializedSchemas} from '@/lib/hr/specialized-settings-contract';
import {hrLookupSaveReceipt} from '@/lib/hr/settings-save-contract';
import {createWorkspaceSaveAttempt,type WorkspaceSaveContract} from '@/lib/workspace/save-contract';
import {hrRuleForms,initialHrRuleForm,hrRulePayload,hrRuleReferenceLabel,hrRuleTitle,type HrRuleEntity,type HrRuleRow} from '@/lib/hr/specialized-settings-form';
import {HrSettingsLifecycle,type HrArchiveTarget} from './hr-settings-lifecycle';
import {HrRuleReferenceControl} from './hr-rule-reference-control';
import {useHrSettingsWorklist} from './use-hr-settings-worklist';

export type HrRuleSettingsProps={entity:HrRuleEntity;rows:HrRuleRow[];total:number;readIdentity:string;canManage:boolean;onSave:(id:number|null,input:Record<string,unknown>,contract:WorkspaceSaveContract)=>Promise<ActionResult>};
export function HrRuleSettingsPage(props:HrRuleSettingsProps){return <RuleSession key={`${props.readIdentity}:${props.entity}:${props.canManage}`} {...props}/>;}
function RuleSession({entity,rows,total,canManage,onSave}:HrRuleSettingsProps){
 const config=hrRuleForms[entity];
 const read=useHrSettingsWorklist(rows,total,(criteria,signal)=>readJson<ActionResult<{data:HrRuleRow[];total:number}>>(
  'hr-rule-settings',{kind:'list',entity,...criteria},signal),config.fields.map(field=>({id:field.key,label:field.label,type:field.kind==='number'?'number':'text'})),true);
 const [editing,setEditing]=useState<HrRuleRow|null>(null),[open,setOpen]=useState(false),[form,setForm]=useState(()=>initialHrRuleForm(entity));
 const [blocked,setBlocked]=useState<Record<string,boolean>>({});
 const [confirmedSave,setConfirmedSave]=useState(false);
 const hasBlockedChoice=Object.values(blocked).some(Boolean);
 const [busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState<string|null>(null);
 const [target,setTarget]=useState<HrArchiveTarget|null>(null),[archiveBusy,setArchiveBusy]=useState(false);
 const attempt=useRef(createWorkspaceSaveAttempt()),flight=useRef(false),retry=useRef<(()=>Promise<void>)|null>(null),activation=useRef({retired:false});
 const pending=useRef<{id:number|null;payload:Record<string,unknown>;contract:WorkspaceSaveContract;hadUnknown:boolean}|null>(null);
 useEffect(()=>{const current={retired:false};activation.current=current;return()=>{current.retired=true;};},[]);
 const choiceStatus=useCallback((field:string,value:boolean)=>setBlocked(previous=>previous[field]===value?previous:{...previous,[field]:value}),[]);
 function begin(row?:HrRuleRow){if(!canManage||flight.current||uncertain||archiveBusy)return;setEditing(row??null);setForm(initialHrRuleForm(entity,row));attempt.current.resolved();retry.current=null;setError(null);setBlocked({});setConfirmedSave(false);setOpen(true);}
 async function run(payload:Record<string,unknown>){
  if(!canManage||flight.current||activation.current.retired)return;const active=activation.current;let confirmed=false;flight.current=true;setBusy(true);setError(null);retry.current=()=>run(payload);
  try{
   if(!pending.current&&editing&&!/^[1-9]\d*$/.test(String(editing.workspace_revision??''))){setError('Reopen this record before saving. Its current revision is unavailable.');return;}
   pending.current??={id:editing?.id??null,payload:{...payload},contract:attempt.current.begin([entity,editing?.id??null,payload],editing?String(editing.workspace_revision):null),hadUnknown:false};const request=pending.current;
   const result=await onSave(request.id,request.payload,request.contract);if(active.retired||pending.current!==request)return;
   if(!result.success){
    request.hadUnknown ||= result.uncertain===true;setUncertain(request.hadUnknown);if(!request.hadUnknown){attempt.current.resolved();pending.current=null;retry.current=null;}
    const safe=result.error&&/^(This HR record|This record changed|You no longer have permission|A selected record|The change was rejected|Reopen this record|Global HR configuration)/.test(result.error);
    setError(request.hadUnknown?'Save unconfirmed. Retry the same unchanged entries.':safe?result.error!:'The configuration was not saved. Check your access and entries. Your entries are retained.');return;
   }
   const receipt=hrLookupSaveReceipt.safeParse(result.data);
   if(!receipt.success||receipt.data.entity!==entity||(request.id!==null&&receipt.data.id!==request.id)){request.hadUnknown=true;setUncertain(true);setError('Save response incomplete. Retry the same unchanged entries.');return;}
   confirmed=true;attempt.current.resolved();pending.current=null;retry.current=null;setUncertain(false);setOpen(false);setConfirmedSave(true);
   try{toast.success(receipt.data.changed?'Configuration saved':'No changes to save');}catch{setError('Saved. The confirmation message could not be displayed.');}
   if(active.retired)return;
   read.refresh();
  }catch{if(!active.retired){if(confirmed){setError('Saved. Reopen the list to refresh the display.');}else{if(pending.current)pending.current.hadUnknown=true;setUncertain(true);setError('Save unconfirmed. Retry the same unchanged entries.');}}}
  finally{if(!active.retired&&activation.current===active){flight.current=false;setBusy(false);}}
 }
 async function submit(){
  if(uncertain){await retry.current?.();return;}if(hasBlockedChoice)return;
  const payload=hrRulePayload(entity,form,editing??undefined),schema=hrSpecializedSchemas[entity];
  const parsed=(editing?schema.partial():schema).safeParse(payload);
  if(!parsed.success){setError('Check the required values and valid whole numbers. Your entries are retained.');return;}
  await run(parsed.data);
 }
 const unavailable=busy||uncertain||archiveBusy;
 const columns:ColumnDef<HrRuleRow>[]=[
  ...config.fields.map((field,index):ColumnDef<HrRuleRow>=>({id:field.key,header:field.label,enableHiding:index!==0,
   accessorFn:row=>field.kind==='reference'?hrRuleReferenceLabel(row,field):field.kind==='boolean'?row[field.key]===true?'Yes':'No':row[field.key]??'',
   meta:{filter:{type:field.kind==='number'?'number':'text'}}})),
  ...(canManage?[{id:'actions',header:'Actions',enableSorting:false,meta:{exportable:false},cell:({row}:{row:{original:HrRuleRow}})=><div className="flex flex-wrap gap-1"><Button size="sm" variant="ghost" disabled={unavailable||open} aria-label={`Edit ${hrRuleTitle(entity,row.original)}`} onClick={()=>begin(row.original)}>Edit</Button><Button size="sm" variant="ghost" disabled={unavailable||open} aria-label={`Archive ${hrRuleTitle(entity,row.original)}`} onClick={()=>setTarget({id:row.original.id,name:hrRuleTitle(entity,row.original),code:String(row.original.rule_code??row.original.workflow_code??''),revision:String(row.original.workspace_revision??'')})}>Archive</Button></div>}]as ColumnDef<HrRuleRow>[]:[]),
 ];
 return <div className="flex min-w-0 flex-col gap-4">
  <ERPPageHeader title={config.title} description={config.description} breadcrumbs={[{label:'Dashboard',href:'/dashboard'},{label:'HR Settings',href:'/admin/hr/settings'},{label:config.title}]}
   actions={canManage?<Button disabled={unavailable||open} onClick={()=>begin()}>Add {config.singular}</Button>:undefined}/>
  {!canManage&&<p className="text-sm text-muted-foreground">Read-only: global HR configuration permission is required to change these shared settings.</p>}
  {!open&&error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  {read.status==='failed'&&<div role="alert" className="text-sm text-destructive">
   {confirmedSave&&read.refreshFailed?'Saved. The list could not refresh.':'HR configuration could not load.'} <Button variant="outline" onClick={read.refresh}>Retry list</Button>
  </div>}
  <ERPDataTable presentation="worklist" tableId={`hr.f06.${entity}`} data={read.rows} columns={columns} serverRead={read.serverRead} isLoading={read.status==='loading'} enableRowSelection={false} searchPlaceholder="Search permitted configurations…" emptyMessage="No configurations match this view."/>
  {canManage&&<HrSettingsLifecycle entity={entity} target={target} onTargetChange={setTarget} onBusyChange={setArchiveBusy} disabled={open||busy||uncertain} onChanged={read.refresh}/>}
  {canManage&&<ERPChildDialogForm open={open} onOpenChange={setOpen} title={`${editing?'Edit':'Add'} ${config.singular}`} mode={editing?'edit':'add'} size="lg" isSubmitting={busy} closeDisabled={uncertain} submitDisabled={hasBlockedChoice&&!uncertain} submitLabel={uncertain?'Retry same save':'Save'} onSubmit={submit}>
   {error&&<p role="alert" className="mb-4 rounded-sm border border-destructive p-3 text-sm text-destructive">{error}</p>}
   <p className="mb-4 text-sm text-muted-foreground">New configurations start inactive. Activate only after reviewing their requirements. Existing identifiers stay unchanged; saves and lifecycle changes retain an audit history.</p>
   <fieldset disabled={busy||uncertain} className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
    {config.fields.map(field=>{
     const id=`hr-rule-${field.key}`,value=form[field.key],missing=!!editing&&!Object.hasOwn(editing,field.key),disabled=busy||uncertain||missing||!!editing&&field.immutable===true;
     const set=(value:string|boolean)=>setForm(f=>({...f,[field.key]:value}));
     return <div key={field.key} className={`min-w-0 ${field.kind==='notes'?'sm:col-span-2':''}`}>
      <Label htmlFor={id} className="mb-1 block">{field.label}{field.required?' *':''}</Label>
      {field.kind==='boolean'?<Switch id={id} checked={value===true} disabled={disabled} onCheckedChange={set}/>:field.kind==='reference'?<HrRuleReferenceControl id={id} entity={entity} field={field} row={editing??undefined} disabled={disabled} value={String(value??'')} onChange={set} onBlocked={choiceStatus}/>:field.kind==='enum'?<Select id={id} aria-label={field.label} required disabled={disabled} value={String(value)} onChange={e=>set(e.target.value)} style={{width:'100%'}}>{field.options?.map(option=><option key={option} value={option}>{option.replaceAll('_',' ')}</option>)}</Select>:field.kind==='notes'?<Textarea id={id} value={String(value??'')} disabled={disabled} maxLength={field.max} onChange={e=>set(e.target.value)}/>:<Input id={id} type={field.kind==='number'?'number':'text'} value={String(value??'')} required={field.required} disabled={disabled} min={field.min} max={field.kind==='number'?field.max:undefined} step={field.kind==='number'?1:undefined} maxLength={field.kind==='text'?field.max:undefined} pattern={field.kind==='text'&&field.required?'.*\\S.*':undefined} onChange={e=>set(e.target.value)}/>}
      {missing&&<p className="text-xs text-muted-foreground">Current value unavailable. It will remain unchanged.</p>}
     </div>;
    })}
   </fieldset>
  </ERPChildDialogForm>}
 </div>;
}
