'use client';
import {useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Textarea} from '@/components/ui/textarea';
import {prepareExactIntakeReview} from '@/server/actions/dms/intake-review';
import type {IntakeReviewPlan,IntakeReviewConfirmation} from '@/lib/dms/intake-review';
import {useReadCacheOwner} from '@/components/layout/read-cache-boundary';
type Props={sessionId:number;typeId?:number;expiryDate?:string|null;documentId?:number;disabled?:boolean;reviewKey?:string;onChange:(v:IntakeReviewConfirmation|null)=>void};
export function DmsExactFileReview(props:Props){
 const owner=useReadCacheOwner(),live=owner?.isLive()??false;
 const identity=JSON.stringify([owner?.identity,owner?.generation,live,props.sessionId,props.typeId,props.expiryDate,props.documentId,props.reviewKey]);
 return <ReviewPanel key={identity} {...props} disabled={props.disabled||!live} active={live}/>;
}
function ReviewPanel({sessionId,typeId,expiryDate,documentId,disabled,onChange,active}:Props&{active:boolean}){
 const [plan,setPlan]=useState<IntakeReviewPlan|null>(null),[confirmed,setConfirmed]=useState(false),[override,setOverride]=useState(false),[reason,setReason]=useState(''),[pending,setPending]=useState(false),[error,setError]=useState<string|null>(null);
 const identity=JSON.stringify({sessionId,typeId,expiryDate:expiryDate||null,documentId});
 const [preparedIdentity,setPreparedIdentity]=useState('');
 useEffect(()=>{
  const current=plan&&preparedIdentity===identity;
  onChange(current&&confirmed&&(!plan.requiresOverride||override&&plan.canOverride&&reason.trim().length>=20)
   ?{...plan,confirmed:true,override,reasonText:override?reason.trim():null}:null);
 },[plan,confirmed,override,reason,preparedIdentity,identity,onChange]);
 async function verify(){
  setPending(true);setConfirmed(false);setPlan(null);setError(null);
  try{const r=await prepareExactIntakeReview({sessionId,...(documentId?{documentId}:{typeId,expiryDate:expiryDate||null})});
   if(!r.success){setError(r.error);return;}setPlan(r.data);setPreparedIdentity(identity);setOverride(false);setReason('');
  }catch{setError('The original-file check did not complete. Retain this upload and verify again.');}finally{setPending(false);}
 }
 const current=plan&&preparedIdentity===identity;
 return <fieldset disabled={disabled||pending} className="space-y-3 rounded-md border border-border p-3 text-sm">
  <legend className="px-1 font-medium">Review original file</legend>
  <p className="text-muted-foreground">Check the original file, selected type and expiry date before saving. AI suggestions are not approval.</p>
  {!active&&<p role="alert">The account or access scope is changing. Review will be available after your current access is ready.</p>}
  <Button type="button" variant="outline" size="sm" onClick={verify} disabled={disabled||pending||(!typeId&&!documentId)}>{pending?'Verifying original…':current?'Verify original again':'Verify original for review'}</Button>
  {error&&<p role="alert" className="text-destructive">{error}</p>}
  {current&&<>
   <p role="status">The original file’s format, size and fingerprint were verified.</p>
   {plan.requiresOverride&&<div className="space-y-2">
    <p role="alert" className="text-destructive">{plan.reason}</p>
    {plan.canOverride?<><label className="flex items-start gap-2"><input type="checkbox" checked={override} onChange={e=>setOverride(e.target.checked)} className="mt-1"/>Use my scoped DMS administrator authority for a recorded manual override</label>
     {override&&<label className="block space-y-1">Reason for manual override (20–1,000 characters)<Textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={1000} rows={3}/></label>}</>:<p>A scoped DMS administrator must review this exception, or run AI Fill again against the verified original.</p>}
   </div>}
   <label className="flex items-start gap-2"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} className="mt-1"/>I checked the original file, document type, expiry date and the values I am saving.</label>
  </>}
 </fieldset>;
}
