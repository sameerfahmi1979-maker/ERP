"use client";
import { useQuery } from "@tanstack/react-query";
import { AlgtDialog } from "@/components/design-system/algt-dialog";
import { Button } from "@/components/ui/button";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import { getEmailAttemptHistory, type EmailAttemptEvent } from "@/server/actions/notifications/email-attempts";
import {getEmailDeliveryReviews,type EmailDeliveryReview} from "@/server/actions/notifications/email-reviews";
import {EmailDeliveryReviewForm} from './email-delivery-review-form';
import {useState} from 'react';
import type { ColumnDef } from "@tanstack/react-table";
const labels: Record<string,string> = {claimed:"Worker claimed",dispatching:"Dispatch started",accepted:"Provider accepted",retry:"Retry scheduled",permanent:"Terminal failure",unknown:"Delivery uncertain",cancelled:"Cancelled",lease_expired:"Worker lease expired",quota_deferred:"Provider capacity wait"};
const columns: ColumnDef<EmailAttemptEvent>[] = [
  {accessorKey:"attempt_number",header:"Attempt",size:100},
  {id:"event",accessorFn:r=>labels[r.event]??"Unrecognized event",header:"Event",size:230},
  {accessorKey:"created_at",header:"Recorded at",size:220,cell:({row})=>new Date(row.original.created_at).toLocaleString()},
];
const reviewColumns:ColumnDef<EmailDeliveryReview>[]=[
 {accessorKey:'actor_user_profile_id',header:'Reviewed by user'},
 {accessorKey:'disposition',header:'Operator conclusion',cell:({row})=>({investigating:'Investigation in progress',provider_accepted_confirmed:'Operator confirmed provider acceptance',provider_not_accepted_confirmed:'Operator confirmed no provider acceptance'}[row.original.disposition])},
 {accessorKey:'trace_reference',header:'Trace reference'},{accessorKey:'created_at',header:'Recorded at',cell:({row})=>new Date(row.original.created_at).toLocaleString()},
];
export function EmailAttemptHistory({id,ownerIdentity,canReview=false,onClose}:{id:number;ownerIdentity:string;canReview?:boolean;onClose:()=>void}) {
  const [reviewOpen,setReviewOpen]=useState(false);
  const {data=[],isLoading,isError,refetch}=useQuery({queryKey:["email-attempt-history",ownerIdentity,id],queryFn:async({signal})=>{signal.throwIfAborted();const r=await getEmailAttemptHistory(id);signal.throwIfAborted();if(!r.success)throw Error("History unavailable");return r.data??[];},retry:false,gcTime:0});
  const reviews=useQuery({queryKey:['email-delivery-reviews',ownerIdentity,id],queryFn:async({signal})=>{signal.throwIfAborted();const r=await getEmailDeliveryReviews(id);signal.throwIfAborted();if(!r.success)throw Error('Reviews unavailable');return r.data??[];},retry:false,gcTime:0});
  return <AlgtDialog open onOpenChange={open=>{if(!open)onClose();}} title={`Queue ${id} attempt history`} actions={<Button onClick={onClose}>Close history</Button>}>
    <p className="text-sm">Latest 100 recorded events, in browser timezone. Provider acceptance is not inbox receipt. Legacy items may have no events.</p>
    {isLoading?<p role="status">Loading history…</p>:isError?<div role="alert">History could not be loaded. <Button onClick={()=>void refetch()}>Retry history</Button></div>:<ERPDataTable presentation="embedded" tableId="email.attempt-history" columns={columns} data={data} enableRowSelection={false} />}
    <h3 className="mt-4 font-semibold">Operator reviews</h3><p className="text-xs text-muted-foreground">Latest 100 recorded reviews. An operator conclusion is not an inbox receipt. Unknown messages remain held.</p>
    {reviews.isPending?<p role="status">Loading reviews…</p>:reviews.isError?<p role="alert">Reviews could not be verified. <Button onClick={()=>void reviews.refetch()}>Retry reviews</Button></p>:<ERPDataTable presentation="embedded" tableId="email.delivery-reviews" columns={reviewColumns} data={reviews.data??[]} enableRowSelection={false}/>}
    {canReview&&<Button variant="outline" className="mt-3" onClick={()=>setReviewOpen(true)}>Record operator review</Button>}
    {reviewOpen&&canReview&&<EmailDeliveryReviewForm queueId={id} onClose={()=>setReviewOpen(false)} onRecorded={()=>{setReviewOpen(false);void reviews.refetch();}}/>}
  </AlgtDialog>;
}
