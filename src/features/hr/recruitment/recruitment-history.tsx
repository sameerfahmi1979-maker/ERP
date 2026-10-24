'use client';
import{useLayoutEffect,useState}from'react';
import{useQuery,useQueryClient}from'@tanstack/react-query';
import{Button}from'@/components/ui/button';
import{readRecruitmentLifecycleHistory,readRecentRecruitmentReceipts}from'@/server/actions/hr/recruitment-lifecycle';
import type{RecruitmentLifecycleKind}from'@/lib/hr/recruitment-lifecycle-contract';
export function RecruitmentHistory({candidate,employee=null,kind,id,identity}:{candidate:number|null;employee?:number|null;kind:RecruitmentLifecycleKind;id:number;identity:string}){
 const[opened,setOpened]=useState(false),[cursors,setCursors]=useState<(number|undefined)[]>([undefined]),before=cursors.at(-1);
 const qc=useQueryClient();
 useLayoutEffect(()=>()=>{const queryKey=['f12-history',identity,candidate,employee,kind,id];void qc.cancelQueries({queryKey});qc.removeQueries({queryKey});},[qc,identity,candidate,employee,kind,id]);
 const q=useQuery({queryKey:['f12-history',identity,candidate,employee,kind,id,before],queryFn:()=>readRecruitmentLifecycleHistory({candidate,employee,kind,id,before}),enabled:opened,staleTime:0});
 return <div><Button type="button"variant="ghost"size="sm"onClick={()=>setOpened(v=>!v)}>Decision history</Button>{opened&&<div aria-live="polite">{q.isFetching?<p>Loading verified history…</p>:q.data?.success?<><ul>{q.data.rows.map(r=><li key={r.id}className="text-sm">{new Date(r.created_at).toLocaleString()} · {r.action} · revision {r.revision} · recorded user #{r.actor_id}{r.reason?` · ${r.reason}`:''}</li>)}</ul>{!q.data.rows.length&&<p>No versioned decisions recorded on this page. Legacy history was not invented.</p>}{cursors.length>1&&<Button type="button"variant="ghost"onClick={()=>setCursors(v=>v.slice(0,-1))}>Newer history</Button>}{q.data.hasMore&&<Button type="button"variant="ghost"onClick={()=>setCursors(v=>[...v,q.data!.success?q.data.rows.at(-1)!.id:undefined])}>Older history</Button>}</>:<p role="alert">History unavailable; this is not an empty-history result.</p>}</div>}</div>;
}
export function RecruitmentReceiptHistory({candidate,identity}:{candidate:number|null;identity:string}){
 const[opened,setOpened]=useState(false),[cursors,setCursors]=useState<({before:string;operation:string}|undefined)[]>([undefined]),cursor=cursors.at(-1);
 const qc=useQueryClient();
 useLayoutEffect(()=>()=>{const queryKey=['f12-receipts',identity,candidate];void qc.cancelQueries({queryKey});qc.removeQueries({queryKey});},[qc,identity,candidate]);
 const q=useQuery({queryKey:['f12-receipts',identity,candidate,cursor],queryFn:()=>readRecentRecruitmentReceipts({candidate,employee:null,...cursor}),enabled:opened,staleTime:0});
 return <section><Button type="button"variant="outline"onClick={()=>setOpened(v=>!v)}>Check my recorded hiring decisions</Button>{opened&&<div><p className="text-sm text-muted-foreground">Only your committed decisions and identifiers are listed. No private form is replayed. Absence from a page does not prove an interrupted save failed.</p>{q.isFetching?<p role="status">Checking recorded decisions…</p>:q.data?.success?<><ul>{q.data.rows.map(r=><li key={r.receipt.operation_id}>{new Date(r.created_at).toLocaleString()} · {r.receipt.kind} #{r.receipt.id} · revision {r.receipt.revision} · confirmed</li>)}</ul>{cursors.length>1&&<Button type="button"variant="ghost"onClick={()=>setCursors(v=>v.slice(0,-1))}>Newer decisions</Button>}{q.data.hasMore&&<Button type="button"variant="ghost"onClick={()=>{if(q.data?.success){const r=q.data.rows.at(-1)!;setCursors(v=>[...v,{before:r.created_at,operation:r.receipt.operation_id}]);}}}>Earlier decisions</Button>}</>:<p role="alert">Receipt history unavailable. No save was retried.</p>}</div>}</section>;
}
