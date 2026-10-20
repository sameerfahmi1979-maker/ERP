'use client';
import {useInfiniteQuery,useQueryClient} from '@tanstack/react-query';
import {useLayoutEffect,useMemo}from 'react';
import {Button} from '@/components/ui/button';
import type {AuthContext} from '@/lib/rbac/check';
import {hasHrReadCapability,hrReadIdentity} from '@/lib/reads/hr-read-identity';
import {useReadLifetime}from '@/hooks/use-read-lifetime';
import {getEmployeeEmploymentHistory} from '@/server/actions/hr/employees';

export function EmployeeEmploymentHistory({employeeId,authContext}:{employeeId:number;authContext:AuthContext}){
 const identity=hrReadIdentity(authContext),client=useQueryClient(),lifetime=useReadLifetime(`${identity}:${employeeId}`);
 const queryKey=useMemo(()=>['hr','employment-history',identity,employeeId]as const,[identity,employeeId]);
 const allowed=authContext.isAccountActive&&!authContext.profile?.must_change_password&&(hasHrReadCapability(authContext,'hr.employees.view')||hasHrReadCapability(authContext,'hr.employee_profile.view'));
 const read=useInfiniteQuery({queryKey,enabled:allowed&&lifetime.enabled,gcTime:0,staleTime:0,retry:false,initialPageParam:undefined as number|undefined,queryFn:async({pageParam})=>{
  if(!lifetime.active||!allowed)throw Error('History access is no longer available');
  const r=await getEmployeeEmploymentHistory(employeeId,pageParam);
  if(!lifetime.active)throw Error('History access is no longer available');
  if(!r.success||!r.data)throw Error(r.error??'History unavailable');return r.data;
 },getNextPageParam:page=>page.nextCursor??undefined});
 useLayoutEffect(()=>()=>{void client.cancelQueries({queryKey,exact:true});client.removeQueries({queryKey,exact:true});},[client,queryKey,lifetime]);
 if(!allowed)return <p role="alert">Employment history is unavailable with your current access.</p>;
 if(!lifetime.enabled)return null;
 return <section className="space-y-3"><h3 className="font-semibold">Employment history</h3>
  <p className="text-sm text-muted-foreground">History begins with changes recorded by this release. Earlier employment history has not been reconstructed or guessed. Reference numbers identify the exact stored assignments.</p>
  {read.isError?<div role="alert">History could not be loaded; this is not an empty history. <Button type="button" variant="outline" onClick={()=>{if(lifetime.active)void read.refetch();}}>Retry</Button></div>:read.isPending?<p role="status">Loading history…</p>:<>
  <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Effective</th><th className="p-2">Change</th><th className="p-2">Reason</th><th className="p-2">Recorded</th></tr></thead><tbody>
  {read.data.pages.flatMap(page=>page.rows).map(row=><tr key={row.id} className="border-b align-top"><td className="p-2 whitespace-nowrap">{row.effective_date}</td><td className="p-2">{row.old_values===null?'Initial recorded employment facts':Object.keys(row.new_values).filter(key=>JSON.stringify(row.old_values?.[key])!==JSON.stringify(row.new_values[key])).map(key=><p key={key}>{key.replaceAll('_',' ')}: {String(row.old_values?.[key]??'—')} → {String(row.new_values[key]??'—')}</p>)}</td><td className="p-2 whitespace-pre-wrap">{row.reason}</td><td className="p-2">{row.created_at}<br/>Revision {row.revision}</td></tr>)}
  </tbody></table></div>
  {read.data.pages[0].rows.length===0&&<p>No employment changes recorded by this release.</p>}
  {read.hasNextPage&&<Button type="button" variant="outline" disabled={read.isFetchingNextPage} onClick={()=>{if(lifetime.active)void read.fetchNextPage();}}>Load earlier changes</Button>}
  </>}
 </section>;
}
