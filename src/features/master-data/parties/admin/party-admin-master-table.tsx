"use client";
import {createContext,useContext,useEffect,useLayoutEffect,useRef,useState} from 'react';
import type {CellContext,ColumnDef} from '@tanstack/react-table';
import {useRouter} from 'next/navigation';
import {toast} from 'sonner';
import {Pencil,PlusCircle,Power,Tags,Link2} from 'lucide-react';
import {ERPDataTable} from '@/components/erp/table/erp-data-table';
import {ERPChildDialogForm} from '@/components/erp/erp-child-dialog-form';
import {ERPCombobox} from '@/components/erp/combobox';
import {RequiredLabel} from '@/components/erp/required-label';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Textarea} from '@/components/ui/textarea';
import {Switch} from '@/components/ui/switch';
import {Badge} from '@/components/ui/badge';
import type {AuthContext} from '@/lib/rbac/check';
import {hasGlobalPermission} from '@/lib/rbac/scope';
import {useWorkspaceNavigationLock} from '@/hooks/use-workspace-navigation-lock';
import {partyAdminMasterPermission,serviceCategorySchema,relationshipTypeSchema,type PartyAdminMasterEntity} from '@/lib/master-data/party-admin-master-contract';
import {createPartyAdminMasterAttempt,type PartyAdminMasterRow} from '@/lib/master-data/party-admin-master-attempt';

type Props={entity:PartyAdminMasterEntity;rows:PartyAdminMasterRow[];authContext:AuthContext};
type Form={code:string;name:string;arabic:string;description:string;parent:number|null;is_active:boolean;sort_order:string};
const empty:Form={code:'',name:'',arabic:'',description:'',parent:null,is_active:true,sort_order:'0'};
function values(row:PartyAdminMasterRow):Form{return {code:'category_code' in row?row.category_code:row.relationship_code,name:'category_name_en' in row?row.category_name_en:row.name_en,arabic:('category_name_ar' in row?row.category_name_ar:row.name_ar)??'',description:row.description??'',parent:'parent_category_id' in row?row.parent_category_id:null,is_active:row.is_active,sort_order:String(row.sort_order)};}
type CatalogueActions={blocked:boolean;launch:(row:PartyAdminMasterRow|null)=>void;run:(row:PartyAdminMasterRow|null,payload:object)=>Promise<void>};
const CatalogueActionsContext=createContext<CatalogueActions|null>(null);
// A stable TanStack cell type keeps the focused button mounted when refreshed
// server rows arrive. Context supplies current guards/handlers, never old ones.
function CatalogueRowActions({row}:CellContext<PartyAdminMasterRow,unknown>){
 const actions=useContext(CatalogueActionsContext);if(!actions)return null;
 return <div className="flex justify-end gap-1"><Button aria-label="Edit record" data-catalogue-edit={row.original.id} size="icon" variant="ghost" disabled={actions.blocked||!row.original.workspace_revision} onClick={()=>actions.launch(row.original)}><Pencil className="h-4 w-4"/></Button><Button aria-label={row.original.is_active?'Deactivate record':'Activate record'} size="icon" variant="ghost" disabled={actions.blocked||!row.original.workspace_revision} onClick={()=>void actions.run(row.original,{is_active:!row.original.is_active})}><Power className="h-4 w-4"/></Button></div>;
}
export function PartyAdminMasterTable(props:Props){
 const canManage=hasGlobalPermission(props.authContext,partyAdminMasterPermission[props.entity]);
 return <CatalogueSession key={`${props.entity}:${props.authContext.profile?.id??'anonymous'}`} {...props} canManage={canManage}/>;
}
function CatalogueSession({entity,rows,canManage}:Props&{canManage:boolean}){
 const router=useRouter(),category=entity==='party_service_categories_master';
 const [open,setOpen]=useState(false),[editing,setEditing]=useState<PartyAdminMasterRow|null>(null),[form,setForm]=useState<Form>({...empty});
 const [busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState<string|null>(null),[savedRows,setSavedRows]=useState<PartyAdminMasterRow[]>([]);
 const attempt=useRef(createPartyAdminMasterAttempt(entity)),generation=useRef(0),retry=useRef<{row:PartyAdminMasterRow|null;payload:object}|null>(null);
 const activation=useRef<{active:boolean}|null>(null),flight=useRef<{lease:{active:boolean}}|null>(null),allowed=useRef(canManage),localBlocked=useRef(false);
 const [reloadOnly,setReloadOnly]=useState(false),[recoveryBlocked,setRecoveryBlocked]=useState(false);
 useLayoutEffect(()=>{allowed.current=canManage;});
 useLayoutEffect(()=>{const lease={active:true};activation.current=lease;return()=>{lease.active=false;if(flight.current?.lease===lease)flight.current=null;};},[]);
 const catalogue=useRef<HTMLDivElement>(null),focusOrigin=useRef<{rowId:number|null}|null>(null);
 useWorkspaceNavigationLock(busy||uncertain);
 useEffect(()=>{if(!busy&&!uncertain)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[busy,uncertain]);
 useEffect(()=>{const mountedGeneration=generation.current+1;generation.current=mountedGeneration;return()=>{generation.current=mountedGeneration+1;};},[]);
 useEffect(()=>{
  if(open||busy||!focusOrigin.current)return;
  const current=generation.current;
  // TanStack may replace the cell while the dialog is open. Retain the row's
  // identity, not a detached trigger, and wait for the shared dialog cleanup.
  const frame=requestAnimationFrame(()=>{
   if(generation.current!==current)return;
   const origin=focusOrigin.current;focusOrigin.current=null;if(!origin)return;
   const selector=origin.rowId===null?'[data-catalogue-add]':`[data-catalogue-edit="${origin.rowId}"]`;
   const target=catalogue.current?.querySelector<HTMLButtonElement>(selector);
   if(target?.isConnected&&!target.disabled)target.focus({preventScroll:true});
  });
  return()=>cancelAnimationFrame(frame);
 },[open,busy,canManage]);
 const displayRows=rows.map(r=>savedRows.find(s=>s.id===r.id&&(s.workspace_revision??0)>(r.workspace_revision??0))??r).concat(savedRows.filter(s=>!rows.some(r=>r.id===s.id)));
 const forbidden=new Set<number>(editing?[editing.id]:[]);
 if(category){let changed=true;while(changed){changed=false;for(const r of displayRows)if('parent_category_id' in r&&r.parent_category_id!==null&&forbidden.has(r.parent_category_id)&&!forbidden.has(r.id)){forbidden.add(r.id);changed=true;}}}
 const parentOptions=displayRows.filter(r=>!forbidden.has(r.id)&&(r.is_active||r.id===form.parent)).map(r=>({value:r.id,label:`${values(r).name}${r.is_active?'':' (inactive — retained)'}`,code:values(r).code}));
 const launch=(row:PartyAdminMasterRow|null)=>{if(!activation.current?.active||!allowed.current||localBlocked.current||flight.current||attempt.current.pending())return;focusOrigin.current={rowId:row?.id??null};setEditing(row);setForm(row?values(row):{...empty});setError(null);setOpen(true);};
 async function run(row:PartyAdminMasterRow|null,payload:object){
  const lease=activation.current;
  if(!lease?.active||!allowed.current||localBlocked.current||flight.current)return;
  const dispatch={lease};flight.current=dispatch;
  const current=()=>lease.active&&activation.current===lease&&flight.current===dispatch;
  setBusy(true);setError(null);
  if(!attempt.current.pending())retry.current={row:row?structuredClone(row):null,payload:structuredClone(payload)};
  let knownSaved=false;
  try{
   const result=await attempt.current.run(row,payload,current);
   if(!current())return;
   knownSaved=true;
   let localFailure=false,feedbackFailure=false,refreshFailure=false;
   try{setSavedRows(existing=>[...existing.filter(r=>r.id!==result.row.id),result.row]);}catch{localFailure=true;}
   if(!current())return;
   try{attempt.current.acknowledged();}catch{localFailure=true;}
   if(!current())return;
   retry.current=null;setUncertain(false);setReloadOnly(false);
   if(localFailure){localBlocked.current=true;setRecoveryBlocked(true);}
   try{toast.success(result.receipt.changed===false?'No changes to save':'Catalogue record saved');}catch{feedbackFailure=true;}
   if(!current())return;
   try{setOpen(false);}catch{localFailure=true;localBlocked.current=true;setRecoveryBlocked(true);}
   if(!current())return;
   try{router.refresh();}catch{refreshFailure=true;}
   if(current()){
    if(localFailure)setError('Saved. Local confirmation could not finish. Reopen this catalogue before another change.');
    else if(refreshFailure)setError('Saved. The list refresh failed; the confirmed record is shown. Reload the page when available.');
    else if(feedbackFailure)setError('Saved. Local feedback is unavailable; the confirmed record is shown.');
   }
  }catch(e){
   if(current()){
    if(knownSaved){localBlocked.current=true;setRecoveryBlocked(true);retry.current=null;setUncertain(false);setReloadOnly(false);setError('Saved. Local confirmation could not finish. Reopen this catalogue before another change.');}
    else{setUncertain(attempt.current.pending());setReloadOnly(attempt.current.saved());setError(e instanceof Error?e.message:'The change could not be confirmed. Retry the same entries.');}
   }
  }finally{if(current()){flight.current=null;setBusy(false);}}
 }
 const payloadFor=(v:Form)=>{const common={description:v.description||null,is_active:v.is_active,sort_order:v.sort_order.trim()===''?NaN:Number(v.sort_order)};return category?serviceCategorySchema.parse({...common,category_code:v.code.trim().toUpperCase(),category_name_en:v.name,category_name_ar:v.arabic||null,parent_category_id:v.parent}):relationshipTypeSchema.parse({...common,relationship_code:v.code.trim().toUpperCase(),name_en:v.name,name_ar:v.arabic||null});};
 const submit=async()=>{if(!activation.current?.active||!allowed.current||localBlocked.current)return;if(attempt.current.pending()&&retry.current){await run(retry.current.row,retry.current.payload);return;}try{await run(editing,payloadFor(form));}catch{setError('Check Code, Name and Sort Order. Sort Order must be a whole number from 0 to 2147483647.');}};
 const blocked=busy||uncertain||recoveryBlocked||!canManage;
 const columns:ColumnDef<PartyAdminMasterRow>[]=[
  {id:'code',header:'Code',accessorFn:r=>values(r).code},
  {id:'name',header:'Name',accessorFn:r=>values(r).name,cell:({row})=><><div>{values(row.original).name}</div><div className="text-xs text-muted-foreground">{values(row.original).arabic}</div></>},
  {id:'description',header:category?'Parent':'Description',accessorFn:r=>category?('parent_name' in r?r.parent_name:''):r.description},
  {id:'status',header:'Status',cell:({row})=><Badge variant="outline">{row.original.is_active?'Active':'Inactive'}</Badge>},
  {accessorKey:'sort_order',header:'Order'},
  ...(canManage?[{id:'actions',header:'Actions',enableSorting:false,cell:CatalogueRowActions} satisfies ColumnDef<PartyAdminMasterRow>]:[]),
 ];
 return <CatalogueActionsContext.Provider value={{blocked,launch,run}}><div ref={catalogue} className="space-y-4">
  <div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold">{category?'Party Service Categories':'Party Relationship Types'}</h2><p className="text-sm text-muted-foreground">{displayRows.length} {category?'categories':'types'}</p></div>{canManage&&<Button data-catalogue-add size="sm" disabled={blocked} onClick={()=>launch(null)}><PlusCircle className="mr-2 h-4 w-4"/>{category?'Add Category':'Add Type'}</Button>}</div>
  {!open&&error&&<div role="alert">{error}{uncertain&&<Button disabled={busy||!canManage} onClick={()=>void submit()}>{reloadOnly?'Reload saved record':'Retry pending change'}</Button>}</div>}
  <ERPDataTable presentation="worklist" tableId={category?'admin.service-categories':'admin.relationship-types'} resultsLabel={category?'service categories':'relationship types'} data={displayRows} columns={columns} enableRowSelection={false}/>
  <ERPChildDialogForm open={open} onOpenChange={next=>{if(activation.current?.active&&!flight.current&&!attempt.current.pending())setOpen(next);}} title={`${editing?'Edit':'Add'} ${category?'Category':'Relationship Type'}`} subtitle="Codes and system identity are permanent. Retiring retains history." icon={category?<Tags className="h-5 w-5"/>:<Link2 className="h-5 w-5"/>} mode={editing?'edit':'add'} size="md" isSubmitting={busy} closeDisabled={uncertain} submitDisabled={recoveryBlocked||!canManage} submitLabel={uncertain?(reloadOnly?'Reload saved record':'Retry pending save'):undefined} onSubmit={submit}>
   {error&&<div role="alert" className="mb-3 text-sm text-destructive">{error}</div>}
   <fieldset disabled={blocked} className="grid grid-cols-12 gap-4">
    <div className="col-span-6"><RequiredLabel required>Code</RequiredLabel><Input required aria-label="Code" name={category?'category_code':'relationship_code'} maxLength={100} pattern="[A-Z0-9_]+" value={form.code} disabled={!!editing} onChange={e=>setForm(v=>({...v,code:e.target.value.toUpperCase()}))}/></div>
    <div className="col-span-6"><Label>Sort Order</Label><Input required aria-label="Sort Order" type="number" min={0} max={2147483647} step={1} value={form.sort_order} onChange={e=>setForm(v=>({...v,sort_order:e.target.value}))}/></div>
    <div className="col-span-6"><RequiredLabel required>Name (English)</RequiredLabel><Input required aria-label="Name" name={category?'category_name_en':'name_en'} maxLength={200} value={form.name} onChange={e=>setForm(v=>({...v,name:e.target.value}))}/></div>
    <div className="col-span-6"><Label>Name (Arabic)</Label><Input aria-label="Name (Arabic)" maxLength={200} dir="rtl" value={form.arabic} onChange={e=>setForm(v=>({...v,arabic:e.target.value}))}/></div>
    {category&&<div className="col-span-12"><Label>Parent Category</Label><ERPCombobox ariaLabel="Parent Category" value={form.parent} onValueChange={v=>setForm(f=>({...f,parent:v===null?null:Number(v)}))} options={parentOptions} allowClear showCode placeholder="No parent (root category)" disabled={blocked}/></div>}
    <div className="col-span-12"><Label>Description</Label><Textarea aria-label="Description" maxLength={2000} value={form.description} onChange={e=>setForm(v=>({...v,description:e.target.value}))}/></div>
    <div className="col-span-6 flex items-center gap-3"><Switch aria-label="Active" checked={form.is_active} disabled={blocked} onCheckedChange={v=>setForm(f=>({...f,is_active:v}))}/><Label>Active</Label></div>
   </fieldset>
  </ERPChildDialogForm>
 </div></CatalogueActionsContext.Provider>;
}
