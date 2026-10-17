"use client";
import {useRef,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useQueryClient} from '@tanstack/react-query';
import type {ColumnDef} from '@tanstack/react-table';
import type {AuthContext} from '@/lib/rbac/check';
import {canManageCalendar,canOpenCalendarEditor} from '@/lib/master-data/calendar-permissions';
import {createWorkspaceSaveAttempt} from '@/lib/workspace/save-contract';
import {queryKeys} from '@/lib/query/query-keys';
import {softDeleteWorkCalendar,type WorkCalendarRow} from '@/server/actions/common-master-data/work-calendars';
import {MasterArchivePanel} from '@/features/common-master-data/master-archive-panel';
import {ERPDataTable} from '@/components/erp/table/erp-data-table';
import {Button} from '@/components/ui/button';
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from '@/components/ui/alert-dialog';
import {toast} from 'sonner';
export function WorkCalendarsListClient({calendars,authContext}:{calendars:WorkCalendarRow[];authContext:AuthContext}){
 const router=useRouter(),queryClient=useQueryClient();const [rows,setRows]=useState(calendars),[snapshot,setSnapshot]=useState(calendars);
 if(snapshot!==calendars){setSnapshot(calendars);setRows(calendars);}
 const [target,setTarget]=useState<WorkCalendarRow|null>(null),[saving,setSaving]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState<string|null>(null),[refreshFailure,setRefreshFailure]=useState(false);
 const attempt=useRef(createWorkspaceSaveAttempt()),flight=useRef(false);
 const [archiveRefreshVersion,setArchiveRefreshVersion]=useState(0);
 const refresh=async()=>{await queryClient.invalidateQueries({queryKey:queryKeys.commonMd.workCalendars()});router.refresh();setRefreshFailure(false);};
 const archive=async()=>{
  if(!target||flight.current)return;flight.current=true;setSaving(true);setError(null);
  try{
   const result=await softDeleteWorkCalendar(target.id,attempt.current.begin({id:target.id,archived:true},String(target.workspace_revision)));
   if(!result.success){if(!result.uncertain)attempt.current.resolved();setUncertain(result.uncertain===true);setError(result.error??'Archive could not be confirmed. Retry the same action.');return;}
   if(!result.data||result.data.id!==target.id||result.archived!==true){setUncertain(true);setError('Archive could not be confirmed. Retry the same action.');return;}
   attempt.current.resolved();setUncertain(false);setRows(old=>old.filter(row=>row.id!==target.id));setTarget(null);setArchiveRefreshVersion(value=>value+1);
   try{toast.success('Calendar archived; history retained');}catch{/* Notification failure is not an unknown archive. */}
   try{await refresh();}catch{setRefreshFailure(true);}
  }catch{setUncertain(true);setError('Archive could not be confirmed. Retry the same action safely.');}
  finally{flight.current=false;setSaving(false);}
 };
 const columns:ColumnDef<WorkCalendarRow>[]=[
  {accessorKey:'calendar_name',header:'Calendar',cell:({row})=><Link className="text-primary underline" href={`/admin/common-master-data/work-calendars/record/${row.original.id}`}>{row.original.calendar_name}</Link>},
  {accessorKey:'calendar_code',header:'Code'},{accessorKey:'calendar_type',header:'Type'},
  {id:'company',header:'Company',accessorFn:r=>r.owner_company_id===null?'All organizations':r.owner_company?.legal_name_en??'Unavailable company'},
  {id:'working_days',header:'Working days',accessorFn:r=>r.working_days?.join(', ')??''},
  {id:'status',header:'Status',accessorFn:r=>r.is_active?'Active':'Inactive'},
  {id:'actions',header:'Actions',enableSorting:false,enableHiding:false,cell:({row})=>canManageCalendar(authContext,row.original.owner_company_id)?<div className="flex gap-2">
   <Link className="text-primary underline" href={`/admin/common-master-data/work-calendars/record/${row.original.id}?mode=edit`}>Edit</Link>
   <Button type="button" variant="outline" size="sm" disabled={target!==null||saving} onClick={()=>{attempt.current.resolved();setError(null);setUncertain(false);setTarget(row.original);}}>Archive {row.original.calendar_code}</Button>
  </div>:null},
 ];
 return <div className="space-y-4">
  {refreshFailure&&<p role="alert">Calendar archived, but the list could not refresh. <Button variant="outline" onClick={()=>void refresh().catch(()=>setRefreshFailure(true))}>Refresh calendars</Button></p>}
  <ERPDataTable presentation="worklist" tableId="common-md.work-calendars" resultsLabel="Work calendars" data={rows} columns={columns} enableRowSelection={false}/>
  {canOpenCalendarEditor(authContext)&&<MasterArchivePanel key={authContext.profile?.id} entity="work_calendars" title="Archived calendars" disabled={target!==null} onRestored={refresh} refreshVersion={archiveRefreshVersion}/>}
  <AlertDialog open={target!==null} onOpenChange={value=>{if(!value&&!saving&&!uncertain)setTarget(null);}}><AlertDialogContent>
   <AlertDialogHeader><AlertDialogTitle>Archive work calendar</AlertDialogTitle><AlertDialogDescription>Archive {target?.calendar_name} ({target?.calendar_code})? Its history is retained. Linked shifts, attendance and schedules must be resolved first.</AlertDialogDescription></AlertDialogHeader>
   {error&&<p role="alert">{error}</p>}
   <AlertDialogFooter><AlertDialogCancel disabled={saving||uncertain}>Cancel</AlertDialogCancel><AlertDialogAction disabled={saving} onClick={event=>{event.preventDefault();void archive();}}>{saving?'Archiving…':'Archive calendar'}</AlertDialogAction></AlertDialogFooter>
  </AlertDialogContent></AlertDialog>
 </div>;
}
