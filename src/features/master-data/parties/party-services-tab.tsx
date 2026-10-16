"use client";
import {useEffect,useMemo,useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {z} from 'zod';
import type {ColumnDef} from '@tanstack/react-table';
import type {AuthContext} from '@/lib/rbac/check';
import {hasGlobalPermission} from '@/lib/rbac/scope';
import {ERPDataTable} from '@/components/erp/table/erp-data-table';
import {ERPChildDialogForm} from '@/components/erp/erp-child-dialog-form';
import {ERPCombobox} from '@/components/erp/combobox';
import {Button} from '@/components/ui/button';
import {Label} from '@/components/ui/label';
import {Textarea} from '@/components/ui/textarea';
import {Switch} from '@/components/ui/switch';
import {PlusCircle,Trash2,Tags} from 'lucide-react';
import {toast} from 'sonner';
import {useChildTableQuery} from '@/hooks/child-tables/use-child-table-query';
import {useWorkspaceDraftStoreContext} from '@/components/workspace/workspace-draft-provider';
import {useWorkspaceFormOwner} from '@/hooks/use-workspace-form-owner';
import {getServiceCategoriesForSelect,getPartyServiceCategoryAssignments,type PartyServiceCategoryAssignment} from '@/server/actions/master-data/party-service-categories';
import {serviceAssignmentId,serviceAssignmentFields,type ServiceAssignmentRequest} from '@/lib/master-data/party-service-assignment-contract';
import {usePartyServiceAssignmentSession} from './use-party-service-assignment-session';

type Props={partyId:number;canManage:boolean;authContext?:AuthContext;disabled?:boolean;parentInactive?:boolean;onChildOpen?:(open:boolean)=>void};
const fieldsSchema=z.object({service_category_id:serviceAssignmentId.nullable(),is_primary:z.boolean(),remarks:z.string().max(4000)}).strict();
const dialogSchema=z.object({principalId:serviceAssignmentId,partyId:serviceAssignmentId,ownerId:z.string().nullable(),sessionId:z.string().uuid(),
 action:z.enum(['add','remove']),id:serviceAssignmentId.nullable(),revision:z.string().regex(/^[1-9]\d*$/).nullable(),label:z.string(),fields:fieldsSchema}).strict()
 .refine(value=>value.action==='add'?value.id===null&&value.revision===null:value.id!==null&&value.revision!==null&&Number.isSafeInteger(Number(value.revision)));
type DialogSnapshot=z.infer<typeof dialogSchema>;
const emptyFields={service_category_id:null,is_primary:false,remarks:''};

export function PartyServicesTab(props:Props){
 const owner=useWorkspaceFormOwner(),store=useWorkspaceDraftStoreContext();
 const storeIdentity=useMemo(()=>({store,id:crypto.randomUUID()}),[store]);
 const principalId=props.authContext?.profile?.id;
 const canRead=!!props.authContext&&hasGlobalPermission(props.authContext,'master_data.parties.view');
 const canEdit=canRead&&props.canManage&&!props.disabled&&hasGlobalPermission(props.authContext!,'master_data.parties.manage_services');
 if(!canRead||!principalId||!serviceAssignmentId.safeParse(props.partyId).success)return <p role="alert">You do not have access to these party service assignments.</p>;
 return <ServicesSession key={`${principalId}:${props.partyId}:${owner?.id??'standalone'}:${storeIdentity.id}`} {...props} principalId={principalId} canEdit={canEdit}/>;
}
function ServicesSession({partyId,principalId,canEdit,parentInactive,onChildOpen}:Props&{principalId:number;canEdit:boolean}){
 const owner=useWorkspaceFormOwner(),store=useWorkspaceDraftStoreContext(),queryClient=useQueryClient();
 const draftKey=owner?`draft:tab:${owner.id}:party-services:${principalId}:${partyId}`:null;
 const [restored]=useState(()=>{
  const raw=draftKey?store?.getDraft(draftKey):undefined;
  if(!raw)return {snapshot:null as DialogSnapshot|null,error:null as string|null};
  try{
   if(Object.keys(raw).length!==1||typeof raw.services!=='string')throw Error();
   const snapshot=dialogSchema.parse(JSON.parse(raw.services));
   if(snapshot.principalId!==principalId||snapshot.partyId!==partyId||snapshot.ownerId!==(owner?.id??null))throw Error();
   return {snapshot,error:null};
  }catch{return {snapshot:null,error:'The retained service request could not be verified. Reopen this record and check saved assignments before changing it.'};}
 });
 const [dialog,setDialog]=useState(restored.snapshot),[notice,setNotice]=useState<string|null>(restored.error);
 const mounted=useRef(false);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{onChildOpen?.(!!dialog||!!restored.error);return()=>onChildOpen?.(false);},[dialog,onChildOpen,restored.error]);
 const {data:assignments,isLoading,error,refetch}=useChildTableQuery({tableName:'party_service_category_assignments',parentId:partyId,fetcher:getPartyServiceCategoryAssignments});
 const categories=useQuery({queryKey:['service_categories_for_select',principalId],queryFn:async()=>{
  const result=await getServiceCategoriesForSelect();if(!result.success||!result.data)throw Error('Service categories could not be loaded.');return result.data;
 },staleTime:5*60*1000,enabled:canEdit});
 const persist=(snapshot:DialogSnapshot)=>{if(draftKey)store?.setDraft(draftKey,{services:JSON.stringify(snapshot)});};
 const open=(row?:PartyServiceCategoryAssignment)=>{
  if(!canEdit||dialog||restored.error||(!row&&parentInactive))return;
  if(row&&(!serviceAssignmentId.safeParse(row.workspace_revision).success||row.party_id!==partyId)){setNotice('Reload the saved assignments before removing this category. Its revision is unavailable.');return;}
  const snapshot:DialogSnapshot={principalId,partyId,ownerId:owner?.id??null,sessionId:crypto.randomUUID(),action:row?'remove':'add',id:row?.id??null,revision:row?String(row.workspace_revision):null,label:row?.category_name_en??(row?`Category #${row.service_category_id}`:''),fields:row?{service_category_id:row.service_category_id,is_primary:row.is_primary,remarks:row.remarks??''}:{...emptyFields}};
  persist(snapshot);setNotice(null);setDialog(snapshot);
 };
 const close=()=>{if(draftKey)store?.clearDraft(draftKey);setDialog(null);};
 const saved=async(changed:boolean)=>{
  // Notification/draft/cache failures never reinterpret a confirmed receipt.
  try{close();}catch{setNotice('Saved. The local draft could not close; close the saved assignment again before making another change.');return;}
  try{toast.success(changed?'Service assignment saved':'No changes to save');}catch{/* Notification is not the commit boundary. */}
  try{await queryClient.invalidateQueries({queryKey:['child','party_service_category_assignments',partyId]});}
  catch{if(mounted.current)setNotice('Saved. The assignment list could not refresh; reload it before making another change.');}
 };
 const columns:ColumnDef<PartyServiceCategoryAssignment>[]=[
  {accessorKey:'category_name_en',header:'Category'},{accessorKey:'category_code',header:'Code'},{accessorKey:'remarks',header:'Remarks'},{accessorKey:'is_primary',header:'Primary'},
  {id:'actions',header:'Actions',enableHiding:false,enableSorting:false,cell:({row})=>canEdit?<Button type="button" aria-label="Remove category" variant="ghost" disabled={!!dialog||!!restored.error} onClick={()=>open(row.original)}><Trash2 className="h-4 w-4"/></Button>:null},
 ];
 return <div className="space-y-4">
  <div className="flex items-center justify-between"><div><h3 className="font-medium text-sm">Services &amp; Categories</h3><p className="text-xs text-muted-foreground">{assignments?.length??0} active assignment(s)</p></div>
   {canEdit&&<Button size="sm" variant="outline" disabled={!!dialog||!!restored.error||parentInactive||!!categories.error||categories.isPending||!!error||isLoading} onClick={()=>open()}><PlusCircle className="mr-2 h-4 w-4"/>Assign Category</Button>}
  </div>
  <Button type="button" size="sm" variant="outline" disabled={!!dialog||!!restored.error||isLoading} onClick={()=>{setNotice(null);refetch();}}>Reload saved assignments</Button>
  {notice&&<p role="alert">{notice}</p>}
  {parentInactive&&<p className="text-sm text-muted-foreground">This party is inactive. Existing assignments can be removed; reactivate the party before adding a category.</p>}
  {categories.error&&canEdit&&<div role="alert"><p>Service categories could not be loaded.</p><Button type="button" onClick={()=>void categories.refetch()}>Retry category choices</Button></div>}
  {isLoading?<p>Loading service assignments…</p>:error?<div role="alert"><p>Service assignments could not be loaded.</p><Button type="button" onClick={refetch}>Try again</Button></div>:<ERPDataTable tableId={`party.services:${partyId}`} resultsLabel="Service categories" data={assignments??[]} columns={columns} enableRowSelection={false}/>}
  {dialog&&<ServiceDialog key={dialog.sessionId} snapshot={dialog} canEdit={canEdit} parentInactive={parentInactive} categories={categories.data??[]} choicesUnavailable={!!categories.error||categories.isPending} persist={persist} close={close} saved={saved}/>}
 </div>;
}
function ServiceDialog({snapshot,canEdit,parentInactive,categories,choicesUnavailable,persist,close,saved}:{snapshot:DialogSnapshot;canEdit:boolean;parentInactive?:boolean;categories:{id:number;category_name_en:string;category_code:string}[];choicesUnavailable:boolean;persist:(value:DialogSnapshot)=>void;close:()=>void;saved:(changed:boolean)=>Promise<void>}){
 const [fields,setFields]=useState(snapshot.fields),[validation,setValidation]=useState<string|null>(null);
 const opening={action:snapshot.action,id:snapshot.id,partyId:snapshot.partyId,revision:snapshot.revision};
 const session=usePartyServiceAssignmentSession(`party-services:${snapshot.principalId}:${snapshot.partyId}:${snapshot.sessionId}`,opening);
 const locked=!canEdit||session.saving||session.uncertain||session.blocked||!!session.confirmed;
 const change=<K extends keyof typeof fields>(key:K,value:typeof fields[K])=>{
  if(locked||!session.isCurrent())return;const next={...fields,[key]:value};persist({...snapshot,fields:next});setFields(next);
 };
 const submit=async()=>{
  if(!session.isCurrent())return;
  if(session.confirmed){await saved(session.confirmed.changed);return;}
  if(!canEdit)return;
  let request:ServiceAssignmentRequest|undefined;
  if(snapshot.action==='remove'&&!session.uncertain)request={action:'remove',id:snapshot.id!,partyId:snapshot.partyId,revision:snapshot.revision!,fields:{}};
  if(snapshot.action==='add'&&!session.uncertain){
   const parsed=serviceAssignmentFields.safeParse({...fields,remarks:fields.remarks.trim()||null});
   if(!parsed.success){setValidation('Select a category and keep remarks within 4,000 characters.');return;}
   request={action:'add',id:null,partyId:snapshot.partyId,revision:null,fields:parsed.data};
  }
  persist({...snapshot,fields});setValidation(null);
  const receipt=await session.submit(request);
  if(receipt&&session.isCurrent())await saved(receipt.changed);
 };
 const options=categories.map(category=>({value:category.id,label:category.category_name_en,code:category.category_code}));
 if(fields.service_category_id!==null&&!options.some(option=>option.value===fields.service_category_id))options.push({value:fields.service_category_id,label:`Category #${fields.service_category_id} (retained selection)`,code:''});
 return <ERPChildDialogForm open onOpenChange={open=>{if(!open&&!session.saving&&!session.uncertain&&!session.blocked)close();}} title={snapshot.action==='remove'?'Remove Service Category':'Assign Service Category'} subtitle="Changes are kept only in this workspace session." icon={<Tags className="h-5 w-5"/>} mode={snapshot.action==='remove'?'edit':'add'} size="md" isSubmitting={session.saving} closeDisabled={session.uncertain||session.blocked} submitDisabled={!session.confirmed&&(!canEdit||session.blocked||(snapshot.action==='add'&&!session.uncertain&&(choicesUnavailable||parentInactive)))} onSubmit={submit} submitLabel={session.confirmed?'Close Saved Assignment':session.uncertain?'Retry Original Request':snapshot.action==='remove'?'Remove':'Assign'} isDirty={!session.confirmed&&snapshot.action==='add'&&JSON.stringify(fields)!==JSON.stringify(emptyFields)}>
  {(validation||session.error)&&<p role="alert">{validation??session.error}</p>}
  {session.confirmed&&<p role="status">The service assignment is saved. Close this saved assignment to finish local confirmation; it will not be submitted again.</p>}
  {!canEdit&&<p role="alert">Your current access is read-only. Any unconfirmed request remains retained for this account and record.</p>}
  {session.uncertain&&<p role="status">Retry the original request unchanged to confirm its outcome before closing or making another change.</p>}
  {snapshot.action==='remove'?<p>Remove {snapshot.label}? Its assignment history will be retained. No other category will be made primary.</p>:<fieldset disabled={locked} className="grid grid-cols-12 gap-4">
   <div className="col-span-12"><Label>Service Category *</Label><ERPCombobox required ariaLabel="Service Category" value={fields.service_category_id} onValueChange={value=>change('service_category_id',value===null?null:Number(value))} options={options} placeholder="Select category..." disabled={locked||choicesUnavailable} showCode/></div>
   <div className="col-span-12 flex items-center gap-3"><Switch id="service-is-primary" aria-label="Primary category" checked={fields.is_primary} onCheckedChange={value=>change('is_primary',value)} disabled={locked}/><Label htmlFor="service-is-primary">Primary category</Label></div>
   <div className="col-span-12"><Label>Remarks</Label><Textarea aria-label="Remarks" value={fields.remarks} onChange={event=>change('remarks',event.target.value)} rows={3} maxLength={4000} disabled={locked}/></div>
  </fieldset>}
 </ERPChildDialogForm>;
}
