import 'server-only';
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {getAuthContext,hasPermission} from '@/lib/rbac/check';
import {aiApprovalRecoverySchema,aiApprovalSnapshotSchema,type AiApprovalRecoveryResult} from '@/lib/dms/numbered-ai-approval';

const unavailable:AiApprovalRecoveryResult={success:false,error:'The original approval could not be recovered with your current access. Reopen the intake or discard it from the Inbox; do not upload it again.'};
/** Read only. The privileged lookup never authorizes a replay or releases data
 * to the browser: invoker RLS/current linked-record checks must pass first. */
export async function recoverNumberedAiApproval(sessionId:number):Promise<AiApprovalRecoveryResult>{
 if(!z.number().int().positive().max(Number.MAX_SAFE_INTEGER).safeParse(sessionId).success)return unavailable;
 try{
  const ctx=await getAuthContext();
  if(!ctx.profile||!['dms.documents.upload','dms.documents.review_ai','dms.admin'].some(p=>hasPermission(ctx,p))||!hasPermission(ctx,'numbering.rules.generate'))return unavailable;
  const client=await createClient();
  const source=await client.from('dms_upload_sessions').select('id,status,document_id').eq('id',sessionId).is('deleted_at',null).maybeSingle();
  if(source.error||!source.data||source.data.status==='cancelled')return unavailable;
  const claims=await client.auth.getClaims();
  const session=z.string().uuid().safeParse(claims.data?.claims.session_id);
  if(claims.error||!session.success)return unavailable;
  const found=await createAdminClient().rpc('read_numbered_ai_intake_recovery',{p_actor:ctx.profile.id,p_auth_session:session.data,p_session:sessionId});
  if(found.error)return unavailable;
  if(found.data===null)return {success:true,data:null};
  const original=aiApprovalRecoverySchema.safeParse(found.data);
  if(!original.success||original.data.input.uploadSessionId!==sessionId)return unavailable;
  if(original.data.receipt){
   const receipt=original.data.receipt;
   // A completed receipt needs current document visibility, not the old upload
   // snapshot (which legitimately changed on completion).
   if(source.data.document_id!==receipt.documentId)return unavailable;
   const document=await client.from('dms_documents').select('id,document_no').eq('id',receipt.documentId).is('deleted_at',null).maybeSingle();
   if(document.error||document.data?.document_no!==receipt.documentNo)return unavailable;
  }else{
   const visible=await client.rpc('prepare_numbered_ai_intake',{p_request:original.data.input});
   const snapshot=aiApprovalSnapshotSchema.safeParse(visible.data);
   if(visible.error||!snapshot.success||snapshot.data.source.id!==sessionId)return unavailable;
  }
  return {success:true,data:original.data};
 }catch{return unavailable;}
}
