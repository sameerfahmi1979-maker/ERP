"use client";
import {useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import type {ColumnDef} from '@tanstack/react-table';
import {ERPDataTable} from '@/components/erp/table/erp-data-table';
import {Button} from '@/components/ui/button';
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from '@/components/ui/alert-dialog';
import {listArchivedMasters,restoreArchivedMaster,type ArchivedMasterRow,type ArchiveEntity} from '@/server/actions/common-master-data/archive';
import {createWorkspaceSaveAttempt,type WorkspaceSaveContract} from '@/lib/workspace/save-contract';
import {toast} from 'sonner';

/** Parent mounts this only for intended managers and keys it by principal/scope.
 * Database checks the stored scope again; UI permission is never authority. */
export function MasterArchivePanel({entity,calendarId,title,disabled=false,onRestored,onTaskOpenChange,refreshVersion=0}:{entity:ArchiveEntity;calendarId?:number;title:string;disabled?:boolean;onRestored?:()=>Promise<void>|void;onTaskOpenChange?:(open:boolean)=>void;refreshVersion?:number}){
 const router=useRouter();const [open,setOpen]=useState(false),[rows,setRows]=useState<ArchivedMasterRow[]|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState<string|null>(null);
 const [target,setTarget]=useState<ArchivedMasterRow|null>(null),[saving,setSaving]=useState(false),[uncertain,setUncertain]=useState(false),[saveError,setSaveError]=useState<string|null>(null);
 const attempt=useRef(createWorkspaceSaveAttempt()),flight=useRef(false),generation=useRef(0);
 const pending=useRef<{entity:ArchiveEntity;id:number;contract:WorkspaceSaveContract;hadUnknown:boolean}|null>(null),activation=useRef({retired:false});
 useEffect(()=>{const current={retired:false};activation.current=current;return()=>{current.retired=true;};},[]);
 const [loadedVersion,setLoadedVersion]=useState(refreshVersion);
 if(loadedVersion!==refreshVersion){setLoadedVersion(refreshVersion);setRows(null);}
 useEffect(()=>()=>{generation.current++;},[]);
 useEffect(()=>{onTaskOpenChange?.(target!==null);return()=>onTaskOpenChange?.(false);},[target,onTaskOpenChange]);
 const load=async()=>{
  const current=++generation.current;setLoading(true);setError(null);
  try{const result=await listArchivedMasters(entity,calendarId);if(current!==generation.current)return;if(result.success)setRows(result.data);else{setRows(null);setError(result.error);}}
  catch{if(current===generation.current){setRows(null);setError('The archive could not be loaded. Try again.');}}
  finally{if(current===generation.current)setLoading(false);}
 };
 // Refresh the already-open recovery catalogue after a sibling lifecycle mutation.
 // This uses component-local state, not a second shared cache or lookup service.
 useEffect(()=>{
  if(!open)return;
  const current=++generation.current;let cancelled=false;
  listArchivedMasters(entity,calendarId).then(result=>{
   if(cancelled||current!==generation.current)return;
   if(result.success){setRows(result.data);setError(null);}else{setRows(null);setError(result.error);}
  }).catch(()=>{if(!cancelled&&current===generation.current){setRows(null);setError('The archive could not be loaded. Try again.');}}).finally(()=>{if(!cancelled&&current===generation.current)setLoading(false);});
  return()=>{cancelled=true;};
 },[refreshVersion,entity,calendarId,open]);
 const restore=async()=>{
  if(!target||flight.current||disabled||activation.current.retired)return;const active=activation.current;let confirmed=false;flight.current=true;setSaving(true);setSaveError(null);
  try{
   pending.current??={entity,id:target.id,contract:attempt.current.begin({entity,id:target.id,archived:false},target.revision),hadUnknown:false};const request=pending.current;
   const result=await restoreArchivedMaster(request.entity,request.id,request.contract);
   if(active.retired||pending.current!==request)return;
   if(!result.success){const wasUnknown=request.hadUnknown;request.hadUnknown ||= result.uncertain===true;if(!request.hadUnknown){attempt.current.resolved();pending.current=null;}setUncertain(request.hadUnknown);setSaveError(wasUnknown?'Restore remains unconfirmed. Retry the same action to recover its result.':result.error??'Restore could not be confirmed. Retry this action.');return;}
   if(!result.data||result.data.id!==request.id||result.archived!==false){request.hadUnknown=true;setUncertain(true);setSaveError('Restore could not be confirmed. Retry this action.');return;}
   confirmed=true;attempt.current.resolved();pending.current=null;setUncertain(false);setRows(old=>old?.filter(row=>row.id!==request.id)??null);setTarget(null);
   try{toast.success(result.changed===false?'Record already restored':'Record restored inactive; review it before activation');}catch{/* Keep the confirmed restore and continue display work. */}
   if(active.retired)return;
   try{await onRestored?.();if(!active.retired)router.refresh();}catch{if(!active.retired)setError('The record was restored, but the current view could not refresh. Reload the archive or reopen the list.');}
  }catch{if(active.retired)return;if(confirmed){setError('The record was restored, but the current view could not refresh. Reload the archive or reopen the list.');return;}if(pending.current)pending.current.hadUnknown=true;setUncertain(true);setSaveError('Restore could not be confirmed. Retry the same action safely.');}
  finally{if(!active.retired&&activation.current===active){flight.current=false;setSaving(false);}}
 };
 const columns:ColumnDef<ArchivedMasterRow>[]=[{accessorKey:'name',header:'Name'},{accessorKey:'code',header:'Code'},
  {id:'company',header:'Company',accessorFn:row=>row.owner_company_id===null?'All organizations':row.company_name??'Unavailable company'},
  {id:'branch',header:'Branch',accessorFn:row=>row.branch_id===null?'All branches':row.branch_name??'Unavailable branch'},
  {accessorKey:'archived_at',header:'Archived at'},
  {id:'actions',header:'Actions',enableHiding:false,enableSorting:false,cell:({row})=><Button type="button" variant="outline" size="sm" disabled={disabled||saving||target!==null} onClick={()=>{attempt.current.resolved();setSaveError(null);setUncertain(false);setTarget(row.original);}}>Restore {row.original.code}</Button>}];
 return <section aria-label={title} className="space-y-3">
  <Button type="button" variant="outline" disabled={disabled||saving||uncertain||target!==null} onClick={()=>{if(!open)setLoading(true);setOpen(value=>!value);}}>{open?'Hide':'Show'} {title.toLowerCase()}</Button>
  {open&&<><p className="text-sm text-muted-foreground">History is retained. Restoration keeps the record inactive; review it before allowing new use.</p>
   {loading&&<p role="status">Loading archive…</p>}
   {error&&<p role="alert">{error}</p>}
   <Button type="button" variant="outline" size="sm" disabled={loading||saving||target!==null} onClick={()=>void load()}>Refresh archive</Button>
   {rows!==null&&<ERPDataTable presentation="embedded" tableId={`f06.archive:${entity}:${calendarId??'all'}`} resultsLabel={title} data={rows} columns={columns} enableRowSelection={false} emptyMessage="No archived records are available in your management scope."/>}
  </>}
  <AlertDialog open={target!==null} onOpenChange={value=>{if(!value&&!saving&&!uncertain)setTarget(null);}}><AlertDialogContent>
   <AlertDialogHeader><AlertDialogTitle>Restore archived record</AlertDialogTitle><AlertDialogDescription>Restore {target?.name} ({target?.code}) as inactive? Its identity and history will be preserved.{entity==='work_shifts'?' A shift requires a restored, active parent calendar.':''}</AlertDialogDescription></AlertDialogHeader>
   {saveError&&<p role="alert">{saveError}</p>}
   <AlertDialogFooter><AlertDialogCancel disabled={saving||uncertain}>Cancel</AlertDialogCancel><AlertDialogAction disabled={saving||disabled} onClick={event=>{event.preventDefault();void restore();}}>{saving?'Restoring…':'Restore inactive'}</AlertDialogAction></AlertDialogFooter>
  </AlertDialogContent></AlertDialog>
 </section>;
}
