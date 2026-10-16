import 'server-only';
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {getAuthContext} from '@/lib/rbac/check';
import {hasGlobalPermission} from '@/lib/rbac/scope';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';
import type {WorkspaceSaveResult} from '@/server/workspace-save';

const contractSchema=z.object({operationId:z.string().uuid(),revision:z.string().regex(/^[1-9]\d*$/)});
const receiptSchema=z.object({id:z.number().int().positive(),revision:z.string().regex(/^[1-9]\d*$/),changed:z.boolean(),replayed:z.boolean()});
/** Server-only, actor-bound transaction/probe. Never logs inputs or raw errors. */
export async function saveOrCheckEmailCredential(id:number,secret:string|null,contract?:WorkspaceSaveContract):Promise<WorkspaceSaveResult>{
 try{
  const ctx=await getAuthContext();
  if(!ctx.profile||!hasGlobalPermission(ctx,'settings.email.secrets.manage'))return {success:false,error:'Global credential administration permission is required.'};
  const parsed=contractSchema.safeParse(contract);
  if(!Number.isSafeInteger(id)||id<1||!parsed.success||secret!==null&&(!secret.trim()||secret.length>500))return {success:false,error:'Reopen the provider and enter a valid client secret before saving.'};
  const client=await createClient();
  const {data:claims,error:claimsError}=await client.auth.getClaims();
  const session=claims?.claims.session_id;
  const valid=await client.rpc('f03_current_session_valid');
  if(claimsError||typeof session!=='string'||valid.error||valid.data!==true)return {success:false,error:'Your session is no longer valid. Sign in again before changing credentials.'};
  const {data,error}=await createAdminClient().rpc('save_email_provider_secret',{p_actor:ctx.profile.id,p_session:session,p_id:id,p_revision:parsed.data.revision,p_operation:parsed.data.operationId,p_secret:secret});
  if(error){
   if(error.code==='PT409')return {success:false,error:'The provider or save inputs changed. Reopen and compare before entering another credential.'};
   if(error.code==='PT404')return {success:false,error:secret===null?'No completed credential save was found, or the provider is no longer available. Reopen settings before entering a credential.':'The provider is no longer available.'};
   if(error.code==='42501')return {success:false,error:'Your session or global credential permission is no longer valid.'};
   const rolledBack=(typeof error.code==='string'&&error.code.length===5&&(/^(?:22|23|42|P0|PT)[0-9A-Z]{3}$/.test(error.code)||['40000','40001','40002','40P01'].includes(error.code)));
   return {success:false,uncertain:!rolledBack,error:rolledBack?'Credential change was rolled back. The previous configuration was preserved.':'Credential save unconfirmed. Check the save result before entering another secret.'};
  }
  const receipt=receiptSchema.safeParse(data);
  return receipt.success?{success:true,data:receipt.data}:{success:false,uncertain:true,error:'Credential save response incomplete. Check the save result before trying again.'};
 }catch{return {success:false,uncertain:true,error:'Credential save unconfirmed. Check the save result before entering another secret.'};}
}
