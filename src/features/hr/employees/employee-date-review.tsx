'use client';
import {useEffect,useRef,useState}from 'react';
import {Button}from '@/components/ui/button';
import {Input}from '@/components/ui/input';
import {Label}from '@/components/ui/label';
import {useReadLifetime}from '@/hooks/use-read-lifetime';
import {hasHrReadCapability,hrReadIdentity}from '@/lib/reads/hr-read-identity';
import {useRecordReadActive}from '@/hooks/use-record-read-active';
import type{AuthContext}from '@/lib/rbac/check';
import {employmentFieldLabel}from '@/lib/hr/employee-foundation';
import {reviewRecordedEmploymentDate}from '@/server/actions/hr/employee-foundation';
import {readEmploymentAsOf}from '@/server/reads/hr-employment-as-of';

type Props={employeeId:number;authContext:AuthContext};
export function EmployeeDateReview(props:Props){
 const active=useRecordReadActive();
 if(!active||!props.authContext.isAccountActive||props.authContext.profile?.must_change_password||!(hasHrReadCapability(props.authContext,'hr.employees.view')||hasHrReadCapability(props.authContext,'hr.employee_profile.view')))return null;
 return <DateReviewInstance key={`${hrReadIdentity(props.authContext)}:${props.employeeId}`} {...props}/>;
}
function DateReviewInstance({employeeId,authContext}:Props){
 const lifetime=useReadLifetime(`${hrReadIdentity(authContext)}:${employeeId}`),mounted=useRef(true);
 const [date,setDate]=useState(''),[busy,setBusy]=useState(false),[result,setResult]=useState<Awaited<ReturnType<typeof reviewRecordedEmploymentDate>>|null>(null);
 const [period,setPeriod]=useState<Awaited<ReturnType<typeof readEmploymentAsOf>>|null>(null);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const review=async()=>{
  if(busy||!lifetime.active||!date)return;setBusy(true);setResult(null);
  try{const reply=await reviewRecordedEmploymentDate(employeeId,date);if(mounted.current&&lifetime.active)setResult(reply);}
  catch{if(mounted.current&&lifetime.active)setResult({status:'review-required',reason:'Recorded-date review is unavailable. No employment fact was changed.'});}
  finally{if(mounted.current&&lifetime.active)setBusy(false);}
 };
 const reviewPeriod=async()=>{
  if(busy||!lifetime.active||!date)return;
  setBusy(true);setPeriod(null);setResult(null);
  try{const data=await readEmploymentAsOf(employeeId,date);if(mounted.current&&lifetime.active)setPeriod(data);}
  catch{if(mounted.current&&lifetime.active)setPeriod({status:'unavailable'});}
  finally{if(mounted.current&&lifetime.active)setBusy(false);}
 };
 if(!lifetime.enabled)return null;
 return <div className="space-y-2 text-sm">
  <Label htmlFor={`employment-review-date-${employeeId}`}>Review recorded employment at a date</Label>
  <Input id={`employment-review-date-${employeeId}`} type="date" value={date} disabled={busy} onChange={event=>{setDate(event.target.value);setResult(null);setPeriod(null);}}/>
  <Button type="button" variant="outline" disabled={busy||!date} onClick={()=>void review()}>Review recorded date</Button>
  <Button type="button" variant="outline" disabled={busy||!date} onClick={()=>void reviewPeriod()}>Check verified employment period</Button>
  <p className="text-muted-foreground">Evidence review only. Future employment, pre-system history and ambiguous corrections are not reconstructed. This does not change employment or regenerate an official letter.</p>
  {busy&&<p role="status">Reviewing authorized history…</p>}
  {result&&<div role="status">{result.status==='recorded'?<><p>Recorded snapshot #{result.eventId}; effective {result.effectiveDate}.</p><ul>{Object.entries(result.facts).map(([key,value])=><li key={key}>{employmentFieldLabel(key)}: {String(value??'—')}</li>)}</ul></>:<p>{result.reason}</p>}</div>}
  {period&&<div role="status">{period.status==='resolved'?<dl className="grid grid-cols-2 gap-1">
   <dt>Employment period</dt><dd>#{period.period_id}</dd><dt>Employer company</dt><dd>#{period.company_id}</dd>
   <dt>Branch</dt><dd>{period.branch_id??'Company scope'}</dd><dt>Contractual start</dt><dd>{period.contractual_start}</dd>
   <dt>Actual start</dt><dd>{period.actual_start}</dd><dt>Effective from</dt><dd>{period.effective_from}</dd>
  </dl>:<p>{period.status==='unresolved'?'There is no verified employment period for this date.':'The verified employment period is unavailable with your current access.'}</p>}</div>}
 </div>;
}
