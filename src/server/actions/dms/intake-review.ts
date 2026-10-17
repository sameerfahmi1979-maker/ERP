'use server';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {verifyAndAttestIntakeSource} from '@/server/dms-intake-source-attestation';
import {intakeReviewContextSchema,intakeReviewPlanSchema,intakeReviewConfirmationSchema,type IntakeReviewPlan} from '@/lib/dms/intake-review';
import {z} from 'zod';
import {getAuthContext} from '@/lib/rbac/check';
const snapshot=z.object({fingerprint:z.string().regex(/^[a-f0-9]{64}$/),requiresOverride:z.boolean(),reason:z.string().nullable(),canOverride:z.boolean()});
export async function prepareExactIntakeReview(input:unknown):Promise<{success:true;data:IntakeReviewPlan}|{success:false;error:string}>{
 const parsed=intakeReviewContextSchema.safeParse(input);if(!parsed.success)return {success:false,error:'Choose the original file and its destination before reviewing.'};
 try{
  const client=await createClient(),v=parsed.data;let typeId=v.typeId,expiryDate=v.expiryDate??null;
  if(v.documentId){const d=await client.from('dms_documents').select('document_type_id,expiry_date').eq('id',v.documentId).is('deleted_at',null).single();
   if(d.error||!d.data)return {success:false,error:'The selected document is unavailable or outside your access.'};typeId=d.data.document_type_id;expiryDate=d.data.expiry_date;}
  if(!typeId)return {success:false,error:'Choose the document type before reviewing.'};
  const verified=await verifyAndAttestIntakeSource(client,createAdminClient(),v.sessionId);
  const response=await client.rpc('f07_prepare_intake_review',{p_session:v.sessionId,p_type:typeId,p_expiry:expiryDate});const p=snapshot.safeParse(response.data);
  if(response.error||!p.success)return {success:false,error:'The original file could not be reviewed. Check your scoped review permission and the retained upload, then verify again.'};
  return {success:true,data:intakeReviewPlanSchema.parse({actorId:verified.plan.actorId,sessionId:v.sessionId,typeId,expiryDate,...(v.documentId?{documentId:v.documentId}:{}),...p.data})};
 }catch{return {success:false,error:'Verification did not complete. Keep this upload and check its actual format, size and original file before trying again.'};}
}
export async function confirmExactIntakeReview(input:unknown){
 const p=intakeReviewConfirmationSchema.safeParse(input);if(!p.success)return {success:false,error:'Explicitly confirm the original file, document type and expiry date.'};
 const v=p.data;
 if(v.requiresOverride&&(!v.override||!v.canOverride)||v.override&&(v.reasonText?.trim().length??0)<20)return {success:false,error:'A scoped DMS administrator must explain the manual override in at least 20 characters.'};
 try{
  const actor=await getAuthContext();if(!actor.isAccountActive||actor.profile?.id!==v.actorId)return {success:false,error:'The signed-in account changed. Verify and confirm the original file again in your current account.'};
  const client=await createClient();
  if(v.documentId){const d=await client.from('dms_documents').select('document_type_id,expiry_date').eq('id',v.documentId).is('deleted_at',null).single();
   if(d.error||!d.data||d.data.document_type_id!==v.typeId||d.data.expiry_date!==v.expiryDate)return {success:false,error:'The destination changed. Verify and review its current type and expiry again.'};}
  const response=await client.rpc('f07_confirm_intake_review',{p_session:v.sessionId,p_type:v.typeId,p_expiry:v.expiryDate,p_fingerprint:v.fingerprint,
   p_confirmed:v.confirmed,p_override:v.override,p_reason:v.override?v.reasonText?.trim()??null:null});
  if(response.error||response.data?.confirmed!==true||response.data?.fingerprint!==v.fingerprint||response.data?.mode!==(v.override?'manual_override':'verified'))
   return {success:false,error:'Review confirmation is unconfirmed or the source changed. Keep the original upload; verify and confirm it again before saving.'};
  return {success:true};
 }catch{return {success:false,error:'Review confirmation is unconfirmed. Keep the original upload and retry the same review.'};}
}
