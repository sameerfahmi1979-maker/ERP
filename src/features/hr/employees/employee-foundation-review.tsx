'use client';
import {useEffect,useRef,useState}from 'react';
import Link from 'next/link';
import {Button}from '@/components/ui/button';
import {reviewEmployeeName,type EmployeeNameReview}from '@/server/actions/hr/employee-foundation';
import type{AuthContext}from '@/lib/rbac/check';
import {hasHrReadCapability,hrReadIdentity}from '@/lib/reads/hr-read-identity';
import {useReadLifetime}from '@/hooks/use-read-lifetime';
import {useRecordReadActive}from '@/hooks/use-record-read-active';

type Props={authContext:AuthContext;name:string;companyId:number|null;employeeId?:number};
export function EmployeeNameReviewControl(props:Props){
 const active=useRecordReadActive();
 const key=JSON.stringify([hrReadIdentity(props.authContext),props.companyId,props.name,props.employeeId]);
 if(!active||!props.authContext.isAccountActive||props.authContext.profile?.must_change_password||!(hasHrReadCapability(props.authContext,'hr.employees.view')||hasHrReadCapability(props.authContext,'hr.employee_profile.view')))return null;
 return <NameReviewInstance key={key} {...props} identity={key}/>;
}
function NameReviewInstance({authContext,name,companyId,employeeId,identity}:Props&{identity:string}){
 const lifetime=useReadLifetime(identity),mounted=useRef(true);
 const [busy,setBusy]=useState(false),[result,setResult]=useState<EmployeeNameReview|null>(null);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const canReview=authContext.isAccountActive&&!authContext.profile?.must_change_password&&companyId!==null&&name.trim().length>=2;
 const load=async(page:number)=>{
  if(busy||!canReview||!lifetime.active)return;
  setBusy(true);
  try{
   const reply=await reviewEmployeeName({name,companyId,excludeId:employeeId,page});
   if(mounted.current&&lifetime.active)setResult(reply);
  }catch{if(mounted.current&&lifetime.active)setResult({success:false,error:'Name review is unavailable. No record was changed.'});}
  finally{if(mounted.current&&lifetime.active)setBusy(false);}
 };
 if(!lifetime.enabled)return null;
 return <div className="space-y-2 text-sm">
  <Button type="button" variant="outline" disabled={busy||!canReview} onClick={()=>void load(1)}>Check similar employee names</Button>
  <p className="text-muted-foreground">Optional review of the complete name, ignoring case, in permitted records of the selected employer. This is not a fuzzy identity search. A matching name is not proof of a duplicate. Incomplete information must stay in a draft or candidate; do not invent required facts.</p>
  {busy&&<p role="status">Checking permitted names…</p>}
  {result&&!result.success&&<p role="alert">{result.error}</p>}
  {result?.success&&<div role="status">
   {result.rows.length===0?<p>No permitted matching names were returned for this page. This does not prove a unique identity.</p>:<ul>{result.rows.map(row=><li key={row.id}><Link href={`/admin/hr/employees/record/${row.id}?mode=view`}>{row.employee_code} — {row.full_name_en}</Link></li>)}</ul>}
   <p>Page {result.page}; name review never merges or edits an employee.</p>
   {result.page>1&&<Button type="button" variant="outline" disabled={busy} onClick={()=>void load(result.page-1)}>Previous matches</Button>}
   {result.hasMore&&<Button type="button" variant="outline" disabled={busy} onClick={()=>void load(result.page+1)}>More matches</Button>}
  </div>}
 </div>;
}
