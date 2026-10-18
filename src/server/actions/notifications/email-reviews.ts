'use server';
import {z} from 'zod';
import {getAuthContext} from '@/lib/rbac/check';
import {createClient} from '@/lib/supabase/server';
import {DeliveryPolicyError,requireQueuePermission} from '@/lib/email/queue/policy';
import {boundedQuery} from '@/lib/email/queue/runtime-limits';
const inputSchema=z.object({queueId:z.number().int().positive().refine(Number.isSafeInteger),operationId:z.string().uuid(),
 disposition:z.enum(['investigating','provider_accepted_confirmed','provider_not_accepted_confirmed']),
 traceReference:z.string().min(3).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9 ._:/#-]{2,199}$/)}).strict();
const reviewSchema=z.object({id:z.number().int().positive(),actor_user_profile_id:z.number().int().positive(),
 disposition:z.enum(['investigating','provider_accepted_confirmed','provider_not_accepted_confirmed']),trace_reference:z.string().max(200),created_at:z.string()}).strip();
export type EmailDeliveryReview=z.infer<typeof reviewSchema>;
export async function getEmailDeliveryReviews(queueId:number):Promise<{success:boolean;data?:EmailDeliveryReview[];error?:string}>{
 try{
  requireQueuePermission(await getAuthContext(),'view');if(!Number.isSafeInteger(queueId)||queueId<1)return {success:false,error:'Invalid queue reference.'};
  const db=await createClient();const r=await boundedQuery(db.from('erp_email_delivery_reviews').select('id,actor_user_profile_id,disposition,trace_reference,created_at').eq('queue_id',queueId).order('id',{ascending:false}).limit(100));
  if(r.error)throw Error('Unavailable');const parsed=z.array(reviewSchema).safeParse(r.data);
  return parsed.success?{success:true,data:parsed.data}:{success:false,error:'Delivery review could not be verified.'};
 }catch{return {success:false,error:'Delivery review unavailable or access denied.'};}
}
export async function recordEmailDeliveryReview(input:z.infer<typeof inputSchema>):Promise<{success:boolean;data?:{id:number};error?:string;uncertain?:boolean}>{
 try{
  const ctx=await getAuthContext();requireQueuePermission(ctx,'manage');requireQueuePermission(ctx,'process');
  const parsed=inputSchema.safeParse(input);if(!parsed.success)return {success:false,error:'Choose a review outcome and a 3–200 character non-sensitive trace reference. Do not enter addresses, links, bodies or credentials.'};
  const p=parsed.data,db=await createClient();const r=await boundedQuery(db.rpc('f09_record_delivery_review',{p_queue:p.queueId,p_operation:p.operationId,p_disposition:p.disposition,p_trace:p.traceReference}));
  if(r.error){const known=['22023','42501','23503','23505','40001','40P01'].includes(r.error.code);return {success:false,uncertain:!known,error:known?'The review was rejected. Refresh the current held delivery and your authority.':'Review save unconfirmed. Retry the exact same review; it cannot resend the email.'};}
  const id=z.number().int().positive().refine(Number.isSafeInteger).safeParse(r.data);
  return id.success?{success:true,data:{id:id.data}}:{success:false,uncertain:true,error:'Review receipt incomplete. Retry the same operation.'};
 }catch(error){if(error instanceof DeliveryPolicyError)return {success:false,error:'Current global review authority is required.'};return {success:false,uncertain:true,error:'Review save could not be confirmed. Retry the same review. No send or status reset is performed.'};}
}
