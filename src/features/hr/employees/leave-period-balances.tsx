'use client';
import{useLayoutEffect,useState}from'react';import{useQuery,useQueryClient}from'@tanstack/react-query';import{Button}from'@/components/ui/button';import{readLeavePeriodBalances}from'@/server/actions/hr/attendance-workbench';import{useReadLifetime}from'@/hooks/use-read-lifetime';
export function LeavePeriodBalances({employee,identity}:{employee:number;identity:string}){
 return <PeriodBalances key={`${employee}:${identity}`}employee={employee}identity={identity}/>;
}
function PeriodBalances({employee,identity}:{employee:number;identity:string}){
 const[open,setOpen]=useState(false),[cursors,setCursors]=useState([0]),life=useReadLifetime(identity),qc=useQueryClient();
 const q=useQuery({queryKey:['hr','time','leave-balances',employee,'f12-periods',identity,cursors.at(-1)],queryFn:async()=>{const result=await readLeavePeriodBalances(employee,cursors.at(-1)!);if(!life.active)throw Error('Period opening retired.');return result;},enabled:open&&life.enabled,gcTime:0,staleTime:0,retry:false});
 useLayoutEffect(()=>()=>{const queryKey=['hr','time','leave-balances',employee,'f12-periods',identity];void qc.cancelQueries({queryKey});qc.removeQueries({queryKey});},[qc,employee,identity]);
 if(!life.enabled)return null;
 return <section className="space-y-2"><Button variant="outline"onClick={()=>{if(life.active)setOpen(v=>!v);}}>Review leave periods and reservations</Button>{open&&(q.isFetching?<p role="status">Checking current periods…</p>:!q.isError&&q.data?.success?<>
 <p className="text-sm text-muted-foreground">Inclusive calendar days. Historical/manual/unreviewed periods or carry-forward are unknown, not zero. Requests do not guarantee approval.</p>
 <ul>{q.data.rows.map(b=><li key={b.id}>Type #{b.leave_type_id} · {b.period_start??'Unreviewed period'} — {b.period_end??'Unknown end'} · {b.known?`${b.entitled_days} entitled / ${b.used_days} consumed / ${b.reserved_days} reserved / ${b.entitled_days-b.used_days-(b.reserved_days??0)} available`:'Balance availability held for period/policy review'}</li>)}</ul>
 {!q.data.rows.length&&<p>No recorded balances on this page. Entitlement is not inferred.</p>}
 <Button variant="ghost"disabled={cursors.length===1}onClick={()=>setCursors(p=>p.slice(0,-1))}>Previous periods</Button>
 <Button variant="ghost"disabled={!q.data.hasMore}onClick={()=>{const last=q.data?.success?q.data.rows.at(-1):null;if(last)setCursors(p=>[...p,last.id]);}}>More periods</Button>
 </>:<p role="alert">Periods unavailable; no balance is assumed.</p>)}</section>;
}
