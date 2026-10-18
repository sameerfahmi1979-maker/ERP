"use server";
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {getAuthContext,hasGlobalPermission,canUseApplication} from '@/lib/rbac/check';
import {notificationReadIdentity} from '@/lib/reads/notifications-schema';
const id=z.number().int().positive().refine(Number.isSafeInteger);
const revision=z.number().int().nonnegative().refine(Number.isSafeInteger);
const row=z.object({id,source_table:z.string(),event_type:z.string(),state:z.enum(['pending','processing','retry','held']),attempt_count:revision,recovery_revision:revision,
 created_at:z.string(),last_outcome:z.string().nullable(),pending_recipients:revision,held_recipients:revision,omitted_decisions:revision}).strip();
export type NotificationRecoveryRow=z.infer<typeof row>;
function allowed(ctx:Awaited<ReturnType<typeof getAuthContext>>,identity:string){
 return canUseApplication(ctx)&&identity===notificationReadIdentity(ctx)&&(hasGlobalPermission(ctx,'notifications.admin')||hasGlobalPermission(ctx,'notifications.manage'));
}
export async function inspectNotificationRecovery(identity:string,before?:number){
 try{
  if(!allowed(await getAuthContext(),identity)||before!==undefined&&!id.safeParse(before).success)return {success:false as const};
  const r=await (await createClient()).rpc('f10_inspect_notification_recovery',{before_id:before??null});
  const data=z.array(row).max(50).safeParse(r.data);
  if(r.error||!data.success)return {success:false as const};return {success:true as const,data:data.data};
 }catch{return {success:false as const};}
}
export async function retryHeldNotificationEvent(identity:string,eventId:number,expectedRevision:number,operationId:string){
 try{
  if(!id.safeParse(eventId).success||!revision.safeParse(expectedRevision).success||!z.uuid().safeParse(operationId).success||!allowed(await getAuthContext(),identity))return {success:false};
  const r=await (await createClient()).rpc('f10_retry_held_notification_event',{event_id:eventId,expected_revision:expectedRevision,operation_id:operationId});
  const receipt=z.object({id,revision,status:z.literal('pending')}).strict().safeParse(r.data);
  return {success:!r.error&&receipt.success&&receipt.data.id===eventId&&receipt.data.revision===expectedRevision+1};
 }catch{return {success:false};}
}
