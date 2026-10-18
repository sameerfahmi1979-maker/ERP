import "server-only";
import {z} from "zod";
import {createClient} from "@/lib/supabase/server";
import {getAuthContext} from "@/lib/rbac/check";
import {canUseApplication} from "@/lib/rbac/scope";
import {notificationReadIdentity} from "@/lib/reads/notifications-schema";
const idSchema=z.number().int().positive().refine(Number.isSafeInteger);
const stateSchema=z.enum(["read","dismissed","archived"]);
export async function changePersonalNotification(id:unknown,state:unknown) {
 if(!idSchema.safeParse(id).success||!stateSchema.safeParse(state).success)return {success:false,error:"Invalid notification change."};
 try {
  if(!canUseApplication(await getAuthContext()))return {success:false,error:"Permission denied"};
  const db=await createClient();
  const {data,error}=await db.rpc("f10_transition_my_notification",{notification_id:id as number,transition:state as string});
  const receipt=z.object({id:idSchema,status:stateSchema}).strict().safeParse(data);
  if(error||!receipt.success||receipt.data.id!==id||receipt.data.status!==state)return {success:false,error:"The notification change could not be confirmed. Refresh before retrying."};
  return {success:true};
 } catch {return {success:false,error:"The notification change could not be confirmed. Refresh before retrying."};}
}
export async function markAllPersonalNotificationsRead(expectedIdentity?:string) {
 try {
  const ctx=await getAuthContext();
  if(!canUseApplication(ctx)||expectedIdentity!==undefined&&expectedIdentity!==notificationReadIdentity(ctx))return {success:false,error:"Permission denied"};
  const db=await createClient(),{data,error}=await db.rpc("f10_mark_all_my_notifications_read");
  if(error||!Number.isSafeInteger(data)||data<0)return {success:false,error:"The unread changes could not be confirmed. Refresh before retrying."};
  return {success:true,data:{count:data as number}};
 } catch {return {success:false,error:"The unread changes could not be confirmed. Refresh before retrying."};}
}
export async function changePersonalDmsNotification(id:unknown,state:'read'|'dismissed'){
 if(!idSchema.safeParse(id).success||!['read','dismissed'].includes(state))return {success:false,error:'Invalid notification change.'};
 try{
  if(!canUseApplication(await getAuthContext()))return {success:false,error:'Permission denied'};
  const r=await (await createClient()).rpc('f10_transition_my_dms_notification',{dms_notification_id:id,transition:state});
  const receipt=z.object({id:idSchema,status:z.enum(['read','dismissed'])}).strict().safeParse(r.data);
  if(r.error||!receipt.success||receipt.data.id!==id||receipt.data.status!==state)return {success:false,error:'The personal delivery is unavailable or changed. Refresh before retrying.'};
  return {success:true};
 }catch{return {success:false,error:'The change could not be confirmed. Refresh before retrying.'};}
}
