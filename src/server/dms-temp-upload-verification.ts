import 'server-only';
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {verifyDmsBlob,readBoundedDmsObject} from '@/server/dms-file-verification';
const id=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const planSchema=z.object({actorId:id,authSessionId:z.string().uuid(),source:z.object({id,name:z.string(),mime:z.string(),size:id,sha256:z.string().nullable(),path:z.string().min(1),owner:id.nullable(),company:id.nullable(),branch:id.nullable(),expiry:z.string().nullable()}).strict()}).strict();
const objectSchema=z.object({id:z.string().uuid(),version:z.string().min(1),lastModified:z.string().datetime({offset:true})});
export async function verifyTemporaryUpload(sessionId:number){
 try{
  if(!id.safeParse(sessionId).success)return {success:false,error:'Invalid upload.'};
  const client=await createClient(),prepared=await client.rpc('f07_prepare_temp_upload',{p_session:sessionId});
  const p=planSchema.safeParse(prepared.data);
  if(prepared.error||!p.success||p.data.source.id!==sessionId)return {success:false,error:'The upload is unavailable, closed, expired or outside your upload permissions.'};
  const plan=p.data,storage=createAdminClient().storage.from('dms-temp');
  const before=await storage.info(plan.source.path),beforeId=objectSchema.safeParse(before.data);
  if(before.error||!beforeId.success)return {success:false,error:'The uploaded file is not yet available. Keep this session and retry its verification.'};
  const original=await readBoundedDmsObject(storage,plan.source.path,plan.source.size);
  const proof=await verifyDmsBlob(original,plan.source);
  const after=await storage.info(plan.source.path),afterId=objectSchema.safeParse(after.data);
  if(after.error||!afterId.success||JSON.stringify(beforeId.data)!==JSON.stringify(afterId.data))return {success:false,error:'The uploaded file changed during verification. No upload completion was sent.'};
  const attested=await createAdminClient().rpc('f07_attest_temp_upload',{p_session:sessionId,p_actor:plan.actorId,p_auth_session:plan.authSessionId,p_source:plan.source,
   p_object:afterId.data.id,p_version:afterId.data.version,p_updated:afterId.data.lastModified,p_sha256:proof.sha256});
  if(attested.error)return {success:false,error:'The uploaded file could not be verified against its recorded source.'};
  const result=await client.rpc('f07_complete_temp_upload',{p_session:sessionId});
  if(result.error||!result.data||result.data.id!==sessionId||result.data.status!=='uploaded')return {success:false,uncertain:true,error:'Upload verification completion is unconfirmed. Keep this session; do not upload a second copy.'};
  return {success:true,data:result.data};
 }catch{return {success:false,uncertain:true,error:'Upload verification did not complete. Check that the actual file format, size and fingerprint match; retain this session for retry.'};}
}
