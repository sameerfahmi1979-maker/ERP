import 'server-only';
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
const healthSchema=z.object({ok:z.boolean(),message:z.string(),revision:z.string(),durationMs:z.number().nullable()});
/** Call only after a global test guard and the actual connection check. */
export async function recordProviderHealth(kind:'email'|'ai',id:number,revision:unknown,actor:number,ok:boolean,duration?:number){
 try{
  const client=await createClient();
  const {data:claims,error:claimsError}=await client.auth.getClaims();
  const session=z.string().uuid().safeParse(claims?.claims.session_id);
  const valid=await client.rpc('f03_current_session_valid');
  if(claimsError||!session.success||valid.error||valid.data!==true)return {success:false as const,error:'The session expired; connection evidence was not recorded.'};
  const {data,error}=await createAdminClient().rpc('record_provider_health',{p_kind:kind,p_id:id,p_revision:revision,p_actor:actor,p_session:session.data,p_ok:ok,p_duration:duration===undefined?null:Math.min(300000,Math.max(0,Math.round(duration)))});
  if(error)return {success:false as const,error:error.code==='PT409'?'The configuration changed during testing. Rerun the connection check on the current version.':'The test result could not be recorded. Do not treat the stored health status as current.'};
  const parsed=healthSchema.safeParse(data);
  return parsed.success?{success:true as const,data:parsed.data}:{success:false as const,error:'Connection evidence was not confirmed.'};
 }catch{return {success:false as const,error:'Connection evidence was not confirmed. No delivery or business operation is verified.'};}
}
