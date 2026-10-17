"use client";
import {useRef,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useQueryClient} from '@tanstack/react-query';
import type {ColumnDef} from '@tanstack/react-table';
import type {AuthContext} from '@/lib/rbac/check';
import {canManageDepartment,canOpenDepartmentEditor} from '@/lib/master-data/department-permissions';
import {createWorkspaceSaveAttempt} from '@/lib/workspace/save-contract';
import {invalidateCommonMdDepartments} from '@/lib/query/invalidation';
import {softDeleteDepartment,updateDepartment} from '@/server/actions/common-master-data/departments';
import type {DepartmentListRow as DepartmentRow} from '@/server/reads/departments';
import {MasterArchivePanel} from '@/features/common-master-data/master-archive-panel';
import {ERPDataTable} from '@/components/erp/table/erp-data-table';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem,DropdownMenuSeparator} from '@/components/ui/dropdown-menu';
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from '@/components/ui/alert-dialog';
import {MoreHorizontal} from 'lucide-react';
import {toast} from 'sonner';
type Props={departments:DepartmentRow[];canManage:boolean;authContext:AuthContext};
type Task={row:DepartmentRow;kind:'archive'|'status';active:boolean};
export function DepartmentsListClient(props:Props){
 // Account/scope changes must not retain another principal's mutation attempt.
 const key=JSON.stringify([props.authContext.profile?.id,props.authContext.roleAssignments,props.authContext.isAccountActive]);
 return <DepartmentsListInstance key={key} {...props}/>;
}
function DepartmentsListInstance({departments:initial,canManage,authContext}:Props){
 const router=useRouter(),queryClient=useQueryClient();
 const [rows,setRows]=useState(initial),[snapshot,setSnapshot]=useState(initial);
 if(snapshot!==initial){setSnapshot(initial);setRows(initial);}
 const [target,setTarget]=useState<Task|null>(null),[saving,setSaving]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState<string|null>(null),[refreshFailure,setRefreshFailure]=useState(false);
 const [archiveRefreshVersion,setArchiveRefreshVersion]=useState(0),[restoreOpen,setRestoreOpen]=useState(false);
 const attempt=useRef(createWorkspaceSaveAttempt()),flight=useRef(false);
 const refresh=async()=>{await invalidateCommonMdDepartments(queryClient);router.refresh();setRefreshFailure(false);};
 const run=async(task:Task)=>{
  if(flight.current||restoreOpen||!canManageDepartment(authContext,task.row.owner_company_id,task.row.branch_id))return;
  flight.current=true;setSaving(true);setError(null);
  try{
   const {row,kind,active}=task;
   const contract=attempt.current.begin(kind==='archive'?{id:row.id,archived:true}:{id:row.id,is_active:active},String(row.workspace_revision));
   const result=kind==='archive'?await softDeleteDepartment(row.id,contract):await updateDepartment({id:row.id,is_active:active},contract);
   if(!result.success){if(!result.uncertain)attempt.current.resolved();setUncertain(result.uncertain===true);setError(result.error??'The change could not be confirmed. Retry the same action.');return;}
   if(!result.data||result.data.id!==row.id||!/^[1-9]\d*$/.test(result.data.revision)||(kind==='archive'&&(!('archived' in result)||result.archived!==true))){setUncertain(true);setError('The change could not be confirmed. Retry the same action.');return;}
   attempt.current.resolved();setUncertain(false);setTarget(null);
   if(kind==='archive'){setRows(old=>old.filter(r=>r.id!==row.id));setArchiveRefreshVersion(value=>value+1);toast.success('Department archived; history retained');}
   else{setRows(old=>old.map(r=>r.id===row.id?{...r,is_active:active,workspace_revision:Number(result.data!.revision)}:r));toast.success(result.data.changed===false?'No changes to save':active?'Department activated':'Department deactivated');}
   try{await refresh();}catch{setRefreshFailure(true);}
  }catch{setUncertain(true);setError('The change could not be confirmed. Retry the same action safely.');}
  finally{flight.current=false;setSaving(false);}
 };
 const start=(row:DepartmentRow,kind:Task['kind'])=>{
  if(target||flight.current||restoreOpen)return;attempt.current.resolved();setError(null);setUncertain(false);
  const task={row,kind,active:!row.is_active};setTarget(task);if(kind==='status')void run(task);
 };
 const route=(row:DepartmentRow)=>'/admin/common-master-data/departments/record/'+row.id;
 const columns:ColumnDef<DepartmentRow>[]=[
  {accessorKey:'department_code',header:'Code',size:140},
  {accessorKey:'department_name_en',header:'Department',size:280,enableHiding:false,cell:({row})=><Link className="text-primary underline underline-offset-2" href={route(row.original)}>{row.original.department_name_en}</Link>},
  {accessorKey:'department_name_ar',header:'Department (Arabic)',size:240},
  {id:'company',header:'Company',size:240,accessorFn:r=>r.owner_company?.legal_name_en??'Unavailable company'},
  {id:'branch',header:'Branch',size:200,accessorFn:r=>r.branch_id===null?'All branches':r.branch?.branch_name_en??'Unavailable branch'},
  {id:'status',header:'Status',size:130,accessorFn:r=>r.is_active?'Active':'Inactive',cell:({row})=><Badge variant={row.original.is_active?'outline':'secondary'}>{row.original.is_active?'Active':'Inactive'}</Badge>},
  {id:'actions',header:'Actions',size:100,enableSorting:false,enableHiding:false,cell:({row})=>canManage&&canManageDepartment(authContext,row.original.owner_company_id,row.original.branch_id)?<DropdownMenu>
   <DropdownMenuTrigger disabled={saving||target!==null||restoreOpen} aria-label={'Actions for '+row.original.department_code} className="h-11 w-11 sm:h-8 sm:w-8 inline-flex items-center justify-center rounded-md hover:bg-muted"><MoreHorizontal className="h-4 w-4"/></DropdownMenuTrigger>
   <DropdownMenuContent align="end"><DropdownMenuItem disabled={saving||target!==null||restoreOpen} onClick={()=>router.push(route(row.original)+'?mode=edit')}>Edit</DropdownMenuItem>
    <DropdownMenuSeparator/><DropdownMenuItem disabled={saving||target!==null||restoreOpen} onClick={()=>start(row.original,'status')}>{row.original.is_active?'Deactivate':'Activate'}</DropdownMenuItem>
    <DropdownMenuSeparator/><DropdownMenuItem disabled={saving||target!==null||restoreOpen} onClick={()=>start(row.original,'archive')}>Archive</DropdownMenuItem>
   </DropdownMenuContent></DropdownMenu>:<Link href={route(row.original)} aria-label={'Open '+row.original.department_code}>Open</Link>},
 ];
 return <div className="space-y-4">
  {refreshFailure&&<p role="alert">Department saved, but the list could not refresh. <Button variant="outline" onClick={()=>void refresh().catch(()=>setRefreshFailure(true))}>Refresh departments</Button></p>}
  <ERPDataTable tableId="departments" data={rows} columns={columns} enableRowSelection={false} searchPlaceholder="Search departments" emptyMessage="No departments are available in your current scope."/>
  {canManage&&canOpenDepartmentEditor(authContext)&&<MasterArchivePanel entity="departments" title="Archived departments" disabled={target!==null} onRestored={refresh} onTaskOpenChange={setRestoreOpen} refreshVersion={archiveRefreshVersion}/>}
  <AlertDialog open={target!==null} onOpenChange={open=>{if(!open&&!saving&&!uncertain)setTarget(null);}}><AlertDialogContent>
   <AlertDialogHeader><AlertDialogTitle>{target?.kind==='archive'?'Archive Department':'Department status'}</AlertDialogTitle><AlertDialogDescription>{target?.kind==='archive'?'Archive '+target.row.department_name_en+'? History is retained. Referenced departments cannot be archived until their linked records are resolved.':(target?.active?'Activate ':'Deactivate ')+target?.row.department_name_en+'? If the response is interrupted, retry this same change to recover its result.'}</AlertDialogDescription></AlertDialogHeader>
   {error&&<p role="alert">{error}</p>}
   <AlertDialogFooter><AlertDialogCancel disabled={saving||uncertain}>Cancel</AlertDialogCancel><AlertDialogAction disabled={saving} onClick={event=>{event.preventDefault();if(target)void run(target);}}>{saving?'Saving…':target?.kind==='archive'?'Archive':'Retry status change'}</AlertDialogAction></AlertDialogFooter>
  </AlertDialogContent></AlertDialog>
 </div>;
}
